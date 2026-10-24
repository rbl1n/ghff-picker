// web 003（兩人各自片單、層內排序、小時格子）專用 helper。
// 只放 Arrange / 讀取 / 比對工具，不放產品邏輯；刻意不 import 其他 web support 檔（避免循環），
// 其他 support / steps 檔可自由 import 本檔。
// 保存格式 schema_version 3 的形狀（見 specs/truth/data/data-model.dbml）：
//   film_preferences[].tier_rank、availability[]（date + intervals；沒有列 = 全天有空；intervals 為空 = 整天沒空）。
import { expect, type Locator, type Page } from "@playwright/test";
import LZString from "lz-string";
import type { Catalog, DuoItineraryEntry, ItineraryEntry, Session, Tier, TicketListItem, UnscheduledMustFilm, UserState } from "../../src/domain/types";
import { scheduleDuo } from "../../src/domain/duo";
import { buildItinerary } from "../../src/domain/schedule";
import { buildTicketList } from "../../src/domain/tickets";
import { STORAGE_KEY } from "../../src/state/storage";

/* ------------------------------------------------------------------ 型別 */

export interface Interval {
  start_min: number;
  end_min: number;
}
export interface DayAvail {
  date: string;
  intervals: Interval[];
}
export interface PrefV3 {
  film_id: string;
  tier: Tier;
  tier_rank: number;
  is_hot: boolean;
}
export interface SlotRow {
  date: string;
  /** null 搭配 end_min null = 整天不可看 */
  start_min: number | null;
  end_min: number | null;
}
export interface PartnerV3 {
  display_name: string;
  daily_limit: number | null;
  film_preferences: PrefV3[];
  availability: DayAvail[];
}
export interface StateV3 {
  schema_version: number;
  self_name?: string | null;
  partner?: PartnerV3 | null;
  daily_limit: number | null;
  manual_order: string[] | null;
  updated_at: string;
  film_preferences: PrefV3[];
  availability: DayAvail[];
  ticket_marks: { session_id: string; result: string }[];
}

export const TIERS: Tier[] = ["must", "want", "maybe"];
export const TIER_LABEL: Record<Tier, string> = { must: "必看", want: "想看", maybe: "有空再看" };
export const TIER_FROM_LABEL: Record<string, Tier> = { 必看: "must", 想看: "want", 有空再看: "maybe" };

/** 讀取任意保存內容的有空時段（容忍欄位命名差異：intervals / available_intervals） */
export function availOf(state: unknown): DayAvail[] {
  const raw = ((state as { availability?: unknown[] } | null | undefined)?.availability ?? []) as {
    date: string;
    intervals?: Interval[];
    available_intervals?: Interval[];
  }[];
  return raw.map((r) => ({ date: r.date, intervals: (r.intervals ?? r.available_intervals ?? []).map((i) => ({ ...i })) }));
}

export function prefsOf(state: unknown): PrefV3[] {
  return (((state as { film_preferences?: PrefV3[] } | null | undefined)?.film_preferences ?? []) as PrefV3[]).map((p) => ({ ...p }));
}

/* ------------------------------------------------------------ 有空時段運算 */

const DAY = 1440;

export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function normalizeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end_min > i.start_min).map((i) => ({ ...i })).sort((a, b) => a.start_min - b.start_min);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start_min <= last.end_min) last.end_min = Math.max(last.end_min, i.end_min);
    else out.push(i);
  }
  return out;
}

/** 某日的有空區間（沒有列 = 全天有空） */
export function intervalsOn(avail: DayAvail[], date: string): Interval[] {
  const row = avail.find((r) => r.date === date);
  return row ? row.intervals : [{ start_min: 0, end_min: DAY }];
}

function putDay(avail: DayAvail[], date: string, intervals: Interval[]): DayAvail[] {
  const norm = normalizeIntervals(intervals);
  const rest = avail.filter((r) => r.date !== date);
  const full = norm.length === 1 && norm[0].start_min === 0 && norm[0].end_min === DAY;
  if (!full) rest.push({ date, intervals: norm });
  return rest.sort((a, b) => a.date.localeCompare(b.date));
}

/** 從某日有空時段扣掉 [start, end)；start/end 為 null = 整天 */
export function subtractSlot(avail: DayAvail[], slot: SlotRow): DayAvail[] {
  if (slot.start_min === null || slot.end_min === null) return putDay(avail, slot.date, []);
  const s = slot.start_min;
  const e = slot.end_min;
  const next: Interval[] = [];
  for (const i of intervalsOn(avail, slot.date)) {
    if (e <= i.start_min || s >= i.end_min) next.push(i);
    else {
      if (i.start_min < s) next.push({ start_min: i.start_min, end_min: s });
      if (e < i.end_min) next.push({ start_min: e, end_min: i.end_min });
    }
  }
  return putDay(avail, slot.date, next);
}

/** Given「不可看時段」表格列 → 有空時段（逐列累加） */
export function availFromSlots(slots: SlotRow[]): DayAvail[] {
  return slots.reduce<DayAvail[]>((acc, s) => subtractSlot(acc, s), []);
}

/** 有空時段的補集（顯示用的不可看時段），格式 `日期|時段`，依日期、時間排序 */
export function complementLines(avail: DayAvail[]): string[] {
  const out: string[] = [];
  for (const row of [...avail].sort((a, b) => a.date.localeCompare(b.date))) {
    const ivs = normalizeIntervals(row.intervals);
    if (ivs.length === 0) {
      out.push(`${row.date}|整天不可看`);
      continue;
    }
    let cursor = 0;
    for (const i of ivs) {
      if (i.start_min > cursor) out.push(`${row.date}|${hhmm(cursor)}–${hhmm(i.start_min)}`);
      cursor = i.end_min;
    }
    if (cursor < DAY) out.push(`${row.date}|${hhmm(cursor)}–${hhmm(DAY)}`);
  }
  return out;
}

export type HourState = "有空" | "沒空" | "部分沒空";

export function hourStateOf(avail: DayAvail[], date: string, hour: number): HourState {
  const from = hour * 60;
  const to = from + 60;
  let free = 0;
  for (const i of intervalsOn(avail, date)) free += Math.max(0, Math.min(i.end_min, to) - Math.max(i.start_min, from));
  return free === 60 ? "有空" : free === 0 ? "沒空" : "部分沒空";
}

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function covered(avail: DayAvail[], date: string, from: number, to: number): boolean {
  if (to <= from) return true;
  return intervalsOn(avail, date).some((i) => i.start_min <= from && to <= i.end_min);
}

/** 場次可看 ⇔ 開演到散場每一分鐘都在有空時段內（跨午夜的部分以隔日有空時段判斷） */
export function isSessionAvailable(s: Session, avail: DayAvail[]): boolean {
  const end = s.end_min;
  if (end <= DAY) return covered(avail, s.date, s.start_min, end);
  return covered(avail, s.date, s.start_min, DAY) && covered(avail, nextDate(s.date), 0, end - DAY);
}

/* ------------------------------------------------------------ 層內名次 */

/** 依列順序（同層內先列者在前）指派 tier_rank = 1, 2, 3… */
export function ranked(rows: { film_id: string; tier: Tier; is_hot: boolean }[]): PrefV3[] {
  const count: Record<Tier, number> = { must: 0, want: 0, maybe: 0 };
  return rows.map((r) => ({ film_id: r.film_id, tier: r.tier, tier_rank: ++count[r.tier], is_hot: r.is_hot }));
}

/** 各層由前到後的 film_id */
export function orderByTier(prefs: PrefV3[]): Record<Tier, string[]> {
  const out: Record<Tier, string[]> = { must: [], want: [], maybe: [] };
  for (const t of TIERS) out[t] = prefs.filter((p) => p.tier === t).sort((a, b) => a.tier_rank - b.tier_rank).map((p) => p.film_id);
  return out;
}

/** 權威狀態：各層名次不重複、從 1 起連續 */
export function expectContiguousRanks(prefs: PrefV3[]): void {
  for (const t of TIERS) {
    const ranks = prefs.filter((p) => p.tier === t).map((p) => p.tier_rank).sort((a, b) => a - b);
    expect(ranks, `${TIER_LABEL[t]}層名次應從 1 起連續`).toEqual(ranks.map((_, i) => i + 1));
  }
}

/* ------------------------------------------------------------ 舊版格式（不經 003 的寫入程式） */

export interface LegacyBase {
  prefs: { film_id: string; tier: Tier; is_hot: boolean }[];
  slots: SlotRow[];
  dailyLimit: number | null;
  manualOrder?: string[] | null;
  marks?: { session_id: string; result: string }[];
}

/** 001（version 1）或 002（version 2）格式的使用者狀態：不可看時段為獨立清單，沒有有空時段與層內名次 */
export function legacyState(version: 1 | 2, b: LegacyBase): UserState {
  return {
    schema_version: version,
    daily_limit: b.dailyLimit,
    manual_order: b.manualOrder ?? null,
    updated_at: "2026-10-01T00:00:00+08:00",
    film_preferences: b.prefs.map((p) => ({ film_id: p.film_id, tier: p.tier, is_hot: p.is_hot })),
    unavailable_slots: b.slots.map((s) => ({ ...s })),
    ticket_marks: (b.marks ?? []).map((m) => ({ ...m })) as UserState["ticket_marks"],
  } as UserState;
}

/** 以個人分享連結編碼（kind / schema_version / sender_name / state）；v1 連結沒有 kind，內容直接是狀態 */
export function encodeLink(payload: unknown, baseUrl = ""): string {
  return `${baseUrl}#/import?d=${LZString.compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

/* ------------------------------------------------------------ 頁面讀取 */

export async function readRawState(page: Page): Promise<StateV3 | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StateV3) : null;
}

export async function readStateOrEmpty(page: Page): Promise<StateV3> {
  return (
    (await readRawState(page)) ?? {
      schema_version: 3,
      daily_limit: null,
      manual_order: null,
      updated_at: "",
      film_preferences: [],
      availability: [],
      ticket_marks: [],
    }
  );
}

/* ------------------------------------------------------------ 時段頁：小時格子 */

export const dayCellOf = (page: Page, date: string): Locator => page.locator(`[data-testid="day-cell"][data-date="${date}"]`);

export async function selectDay(page: Page, date: string): Promise<void> {
  const cell = dayCellOf(page, date);
  if ((await cell.getAttribute("aria-pressed")) !== "true") await cell.click();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
}

export const hourCellOf = (page: Page, date: string, hour: number): Locator =>
  page.locator(`[data-testid="hour-cell"][data-date="${date}"][data-hour="${hour}"]`);

/** 畫面上小時格子的狀態文字（有空／沒空／部分沒空） */
export async function hourCellLabel(cell: Locator): Promise<string> {
  return ((await cell.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

export const HOUR_STATE_ATTR: Record<HourState, string> = { 有空: "free", 沒空: "busy", 部分沒空: "partial" };

/* ------------------------------------------------------------ 選片頁：層內順序檢視 */

export const tierGroupOf = (page: Page, tier: Tier): Locator => page.locator(`[data-testid="tier-order-group"][data-tier="${tier}"]`);
export const tierItemOf = (page: Page, title: string): Locator => page.locator(`[data-testid="tier-order-item"][data-title="${title}"]`);

export async function shownTierOrder(page: Page): Promise<Record<Tier, string[]>> {
  const out: Record<Tier, string[]> = { must: [], want: [], maybe: [] };
  for (const t of TIERS) {
    out[t] = await tierGroupOf(page, t).locator('[data-testid="tier-order-item"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-title") ?? ""));
  }
  return out;
}

/** 層內順序檢視：畫面與（若有）表格一致，並對照保存內容的名次 */
export async function expectTierOrder(
  page: Page,
  catalog: Catalog | null,
  rows: { 層級: string; 順序: string }[],
): Promise<void> {
  const expected: Record<Tier, string[]> = { must: [], want: [], maybe: [] };
  for (const r of rows) expected[TIER_FROM_LABEL[r["層級"]]] = r["順序"].split("、").map((s) => s.trim()).filter(Boolean);
  await expect.poll(async () => JSON.stringify(await shownTierOrder(page))).toBe(JSON.stringify(expected));
  const st = await readStateOrEmpty(page);
  const prefs = prefsOf(st);
  expectContiguousRanks(prefs);
  const byTier = orderByTier(prefs);
  for (const t of TIERS) {
    expect(byTier[t].map((id) => titleOf(catalog, id)), `${TIER_LABEL[t]}層保存的名次順序`).toEqual(expected[t]);
  }
}

export function titleOf(catalog: Catalog | null, filmId: string): string {
  return catalog?.films.find((f) => f.film_id === filmId)?.title ?? filmId;
}

/* ------------------------------------------------------------ 行程頁篩選（畫面狀態，不保存） */

export type ItineraryFilter = "全部" | "只看自己" | "只看同伴";
const filters = new WeakMap<Page, ItineraryFilter>();
export const setFilter = (page: Page, f: ItineraryFilter): void => void filters.set(page, f);
export const filterOf = (page: Page): ItineraryFilter => filters.get(page) ?? "全部";

export const filterControl = (page: Page): Locator => page.getByTestId("itinerary-filter");
export const participantTags = (page: Page): Locator => page.getByTestId("participant-tag");

/* ------------------------------------------------------------ 排程引擎對照（權威狀態） */

export interface Plan {
  /** 兩人模式的完整兩人行程；個人模式 = null */
  duo: DuoItineraryEntry[] | null;
  /** 自己的行程（個人模式即行程；兩人模式 = 一起與自己看的場次） */
  itinerary: ItineraryEntry[];
  unscheduled: UnscheduledMustFilm[];
  tickets: TicketListItem[];
}

/**
 * 以目前保存的使用者狀態呼叫 src/domain 算出行程與搶票清單。
 * 搶票當下（FR-020）清單建立在排程當時的行程上，搶票標記只用來切換備案；
 * 只有「依搶到結果重新排程」後（FR-021）行程才納入標記，此時 replanned = true。
 * 兩人模式：兩人各自以自己的片單排程（scheduleDuo），搶票清單只列自己行程中的場次。
 */
export function computePlan(catalog: Catalog, state: UserState, replanned: boolean): Plan {
  const planState: UserState = replanned ? state : { ...state, ticket_marks: [] };
  if (state.partner) {
    const result = scheduleDuo(catalog, planState, state.partner);
    const mine = result.entries
      .filter((e) => e.participant === "self" || e.participant === "together")
      .map((e) => ({ session_id: e.session_id, tier: e.tier!, is_non_ticketed: e.is_non_ticketed, participant: e.participant, partner_tier: e.partner_tier }));
    const tickets = buildTicketList(catalog, state, mine, undefined, { entries: result.entries, partner: state.partner });
    return { duo: result.entries, itinerary: mine, unscheduled: result.unscheduled, tickets };
  }
  const { itinerary, unscheduled } = buildItinerary(catalog, planState);
  return { duo: null, itinerary, unscheduled, tickets: buildTicketList(catalog, state, itinerary) };
}

/** 兩人行程套用篩選後的列（全部 / 只看自己 = 一起與自己 / 只看同伴 = 一起與同伴），含視角層級 */
export function filteredDuoRows(
  plan: Plan,
  filter: ItineraryFilter,
): { session_id: string; participant: "self" | "partner" | "together"; tier: Tier }[] {
  const rows: { session_id: string; participant: "self" | "partner" | "together"; tier: Tier }[] = [];
  for (const e of plan.duo ?? []) {
    if (filter === "只看自己" && e.participant === "partner") continue;
    if (filter === "只看同伴" && e.participant === "self") continue;
    // 層級色塊顯示「視角」那個人的層級：視角預設自己；只看同伴時為同伴；全部中同伴自己看的列顯示同伴的層級
    const viewerIsPartner = filter === "只看同伴" || (filter === "全部" && e.participant === "partner");
    const tier = viewerIsPartner ? (e.partner_tier ?? e.tier) : e.tier;
    rows.push({ session_id: e.session_id, participant: e.participant, tier: tier! });
  }
  return rows;
}

/** 「一起」或「{名字} 自己」 */
export function participantLabel(p: "self" | "partner" | "together", selfName: string, partnerName: string): string {
  return p === "together" ? "一起" : `${p === "self" ? selfName : partnerName} 自己`;
}
