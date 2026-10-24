// web 兩人模式（002）專用 helper。不修改既有 support 檔的行為；只放 Arrange / 讀取 / 比對工具，不放產品邏輯。
import { expect, type Locator, type Page } from "@playwright/test";
import LZString from "lz-string";
import type { FilmPreference, PartnerData, Tier, UserState } from "../../src/domain/types";
import { SHARE_HASH_PREFIX } from "../../src/state/share";
import { STORAGE_KEY } from "../../src/state/storage";
import { buildState, norm, parseSlotText, sessionOf, slotText, type WebWorld } from "./web-a-helpers";
import { TIER_ENUM_TO_LABEL } from "./tables";
import { availFromSlots, availOf, complementLines, prefsOf, ranked, type DayAvail, type PrefV3 } from "./web-003-helpers";

/* ------------------------------------------------------------- 常數 */

export const BROKEN_LINK_TEXT = "這個分享連結無法讀取，請在原裝置重新產生";
const SEED_FLAG = "ghff-duo:seeded";
const FILM_NOT_IN_CATALOG = "__not_in_catalog__:";

/* ------------------------------------------------------- 待載入同伴資料 */

export interface PendingPartner {
  prefs: { title: string; tier: Tier; is_hot: boolean }[];
  slots: { date: string; start_min: number | null; end_min: number | null }[];
  dailyLimit: number | null;
  /** 同伴的場次偏好標記（005） */
  marks?: { title: string; sessionText: string; mark: "prefer" | "only" }[];
}

export interface SelfSnapshot {
  film_preferences: PrefV3[];
  availability: DayAvail[];
  daily_limit: number | null;
}

export interface PendingLink {
  url: string;
  senderName: string | null;
  broken: boolean;
}

export interface DuoCtx {
  /** 同伴連結裡夾帶的備註（片名 → 備註） */
  partnerNotes: { title: string; note: string }[];
  pending: PendingPartner;
  /** 觀眾已加入同伴 預載的資料 */
  preloaded: PartnerData | null;
  selfName: string | null;
  partnerName: string | null;
  baseline: SelfSnapshot | null;
  link: PendingLink | null;
  seedArmed: boolean;
}

const ctxs = new WeakMap<object, DuoCtx>();

export function duoOf(world: WebWorld): DuoCtx {
  let c = ctxs.get(world);
  if (!c) {
    c = {
      partnerNotes: [],
      pending: { prefs: [], slots: [], dailyLimit: null },
      preloaded: null,
      selfName: null,
      partnerName: null,
      baseline: null,
      link: null,
      seedArmed: false,
    };
    ctxs.set(world, c);
  }
  return c;
}

/** 片名 → film_id；不在快照的片用合成 id（合併時會被忽略） */
export function partnerFilmId(world: WebWorld, title: string): string {
  return world.catalog?.films.find((f) => f.title === title)?.film_id ?? `${FILM_NOT_IN_CATALOG}${title}`;
}

export function titleOfFilmId(world: WebWorld, id: string): string {
  if (id.startsWith(FILM_NOT_IN_CATALOG)) return id.slice(FILM_NOT_IN_CATALOG.length);
  return world.catalog?.films.find((f) => f.film_id === id)?.title ?? id;
}

export function pendingToPartner(world: WebWorld, name: string): PartnerData {
  const p = duoOf(world).pending;
  return {
    display_name: name,
    daily_limit: p.dailyLimit,
    // 003：層內名次依 Given 列順序；不可看時段從有空時段扣除
    film_preferences: ranked(p.prefs.map((x) => ({ film_id: partnerFilmId(world, x.title), tier: x.tier, is_hot: x.is_hot }))),
    availability: availFromSlots(p.slots),
    ...(p.marks?.length ? { session_marks: Object.fromEntries(p.marks.map((m) => [sessionOf(world, m.title, m.sessionText).session_id, m.mark])) } : {}),
  } as unknown as PartnerData;
}

export function addPendingSlots(world: WebWorld, rows: Record<string, string>[]): void {
  for (const r of rows) duoOf(world).pending.slots.push({ date: r["日期"], ...parseSlotText(r["時段"]) });
}

/* ------------------------------------------------------ 自己設定的基準快照 */

function sortPrefs<T extends { film_id: string }>(a: T[]): T[] {
  return [...a].sort((x, y) => x.film_id.localeCompare(y.film_id));
}
function sortAvail(a: DayAvail[]): DayAvail[] {
  return [...a].sort((x, y) => x.date.localeCompare(y.date));
}

export function selfSnapshotOf(s: UserState | SelfSnapshot): SelfSnapshot {
  return {
    film_preferences: sortPrefs(prefsOf(s)),
    availability: sortAvail(availOf(s)),
    daily_limit: s.daily_limit,
  };
}

/** 自己的基準快照：Given 當下記下的；沒有「加入同伴」Given 時以 world 的自己設定為準 */
export function baselineOf(world: WebWorld): SelfSnapshot {
  return duoOf(world).baseline ?? selfSnapshotOf(buildState(world));
}

/* ------------------------------------------------------------ 預載兩人模式 */

/** 由 world 累積的自己設定 + 同伴資料組出 schema_version 3 的預載狀態 */
export function buildDuoState(world: WebWorld): UserState {
  const c = duoOf(world);
  const s = buildState(world);
  s.schema_version = 3;
  s.self_name = c.selfName;
  s.partner = c.preloaded;
  return s;
}

async function seedScript(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ([key, value, flag]) => {
      try {
        if (!window.location.protocol.startsWith("http")) return;
        if (window.localStorage.getItem(flag) !== null) return;
        window.localStorage.setItem(key, value);
        window.localStorage.setItem(flag, "1");
      } catch {
        // 儲存空間不可用時略過
      }
    },
    [STORAGE_KEY, json, SEED_FLAG] as const,
  );
}

/**
 * 讓頁面「一開啟就是兩人模式」。
 * 其他 Given（搶票標記等）可能在這之後才累積進 world，所以預載內容在第一次 goto 當下才組出；
 * 初始腳本比根 steps 的 v1 預載腳本晚註冊，因此會覆蓋它，之後以 localStorage 旗標避免重載時覆蓋操作結果。
 */
export async function armDuoPreload(page: Page, world: WebWorld): Promise<void> {
  const c = duoOf(world);
  if (world.opened) {
    // 頁面已開啟：直接寫入並重新載入
    const json = JSON.stringify(buildDuoState(world));
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, json] as const);
    await page.reload();
    return;
  }
  if (c.seedArmed) return;
  c.seedArmed = true;
  const orig = page.goto.bind(page);
  (page as unknown as { goto: Page["goto"] }).goto = (async (...args: Parameters<Page["goto"]>) => {
    (page as unknown as { goto: Page["goto"] }).goto = orig;
    await seedScript(page, JSON.stringify(buildDuoState(world)));
    return orig(...args);
  }) as Page["goto"];
}

/* --------------------------------------------------------- 分享連結編碼 */

export function encodePayload(payload: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodePayload(url: string): { kind?: string; state?: UserState; sender_name?: string | null; schema_version?: number } & Partial<UserState> {
  const at = url.indexOf("d=");
  const json = LZString.decompressFromEncodedURIComponent(at >= 0 ? url.slice(at + 2) : url);
  return JSON.parse(json ?? "null");
}

/** 以待載入同伴資料編成「個人分享連結」（schema_version 3；相對網址，由 page.goto 以 baseURL 解析） */
export function buildPersonalLink(world: WebWorld, senderName: string | null): string {
  const p = pendingToPartner(world, senderName ?? "") as unknown as { daily_limit: number | null; film_preferences: PrefV3[]; availability: DayAvail[] };
  const state = {
    schema_version: 3,
    daily_limit: p.daily_limit,
    manual_order: null,
    updated_at: "2026-10-24T00:00:00+08:00",
    film_preferences: p.film_preferences,
    availability: p.availability,
    ...(duoOf(world).partnerNotes.length
      ? { film_notes: Object.fromEntries(duoOf(world).partnerNotes.map((n) => [partnerFilmId(world, n.title), n.note])) }
      : {}),
    ticket_marks: [],
  };
  return `/${SHARE_HASH_PREFIX}${encodePayload({ kind: "personal", schema_version: 3, sender_name: senderName, state })}`;
}

/** 001 版本格式的個人分享連結：內容為 schema_version 1 的使用者狀態，沒有 kind 欄位 */
export function buildV1Link(state: UserState): string {
  const v1 = { ...state, schema_version: 1 } as Record<string, unknown>;
  delete v1.self_name;
  delete v1.partner;
  return `/${SHARE_HASH_PREFIX}${encodePayload(v1)}`;
}

/* ------------------------------------------------------------ 畫面定位 */

export const duoBanner = (page: Page): Locator => page.getByTestId("duo-banner");
export const duoBannerText = (page: Page): Locator => page.getByTestId("duo-banner-text");
export const removePartnerButton = (page: Page): Locator => page.getByRole("button", { name: "移除同伴", exact: true });
export const nameDialog = (page: Page): Locator => page.getByTestId("name-dialog");
export const replacePartnerDialog = (page: Page): Locator => page.getByTestId("replace-partner-dialog");

export async function waitLinkDialogOrError(page: Page): Promise<void> {
  await page.getByRole("dialog").or(page.getByText(BROKEN_LINK_TEXT, { exact: true })).first().waitFor({ state: "visible" });
}

export async function waitNameOrReplace(page: Page): Promise<void> {
  await nameDialog(page).or(replacePartnerDialog(page)).first().waitFor({ state: "visible" });
}

/** 完整重新載入一個網址（先離開再進入，避免只改 hash 不重新讀取） */
export async function openLinkFresh(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

export async function expectBanner(page: Page, text: string): Promise<void> {
  await expect(duoBannerText(page)).toHaveText(text);
  await expect(removePartnerButton(page)).toBeVisible();
}

/* ------------------------------------------------------------ 權威狀態 */

export async function readState(page: Page): Promise<UserState | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
  return raw ? (JSON.parse(raw) as UserState) : null;
}

export const hasPartner = (s: UserState | null): boolean => Boolean(s && s.partner);

/** 同伴分層 → `片名|層級[|是]` 以便比對 */
export function partnerPrefLines(world: WebWorld, partner: PartnerData | null | undefined, withHot: boolean): string[] {
  return sortPrefs(partner?.film_preferences ?? [])
    .map((p) => [titleOfFilmId(world, p.film_id), TIER_ENUM_TO_LABEL[p.tier], ...(withHot ? [p.is_hot ? "是" : ""] : [])].join("|"))
    .sort();
}

/** 同伴有空時段的補集（不可看時段），`日期|時段` */
export function partnerSlotLines(partner: PartnerData | null | undefined): string[] {
  return complementLines(availOf(partner)).sort();
}

/* ------------------------------------------------- 行程／搶票清單快照 */

export interface ItineraryRow {
  date: string;
  tier: string;
  text: string;
  /** 「一起」或「{名字} 自己」；個人模式沒有標示 = 空字串 */
  participant: string;
}

export async function snapshotItinerary(page: Page): Promise<ItineraryRow[]> {
  const entries = page.getByTestId("itinerary-entry");
  await entries.first().waitFor({ state: "visible" });
  return entries.evaluateAll((els) =>
    els.map((e) => ({
      date: e.getAttribute("data-date") ?? "",
      tier: e.getAttribute("data-tier") ?? "",
      text: (e.textContent ?? "").replace(/\s+/g, " ").trim(),
      participant: (e.querySelector('[data-testid="participant-tag"]')?.textContent ?? "").replace(/\s+/g, " ").trim(),
    })),
  );
}

/** 搶票頁每一列的張數文字（沒有則空字串），順序同 ticket-row */
export async function ticketQuantities(page: Page): Promise<string[]> {
  const rows = page.getByTestId("ticket-row");
  await rows.first().waitFor({ state: "visible" });
  return rows.evaluateAll((els) =>
    els.map((e) => /買\s*\d+\s*張/.exec((e.textContent ?? "").replace(/\s+/g, " "))?.[0] ?? ""),
  );
}

export interface DesktopDuo {
  itinerary: ItineraryRow[];
  quantities: string[];
  state: UserState;
  selfName: string | null;
  partnerName: string | null;
}

const desktopSnaps = new WeakMap<Page, DesktopDuo>();
export const setDesktopDuo = (page: Page, d: DesktopDuo): void => void desktopSnaps.set(page, d);
export const desktopDuo = (page: Page): DesktopDuo | undefined => desktopSnaps.get(page);

export function sameSelfFields(actual: UserState, expected: UserState, label: string): void {
  expect(sortPrefs(prefsOf(actual)), `${label}分層、層內名次與熱門`).toEqual(sortPrefs(prefsOf(expected)));
  expect(sortAvail(availOf(actual)), `${label}有空時段`).toEqual(sortAvail(availOf(expected)));
  expect(actual.daily_limit ?? null, `${label}每日上限`).toEqual(expected.daily_limit ?? null);
}

export function samePartnerFields(actual: UserState, expected: UserState, label: string): void {
  expect(actual.self_name ?? null, `${label}自己名稱`).toEqual(expected.self_name ?? null);
  expect(actual.partner?.display_name ?? null, `${label}同伴名稱`).toEqual(expected.partner?.display_name ?? null);
  expect(sortPrefs(prefsOf(actual.partner)), `${label}同伴分層與層內名次`).toEqual(sortPrefs(prefsOf(expected.partner)));
  expect(sortAvail(availOf(actual.partner)), `${label}同伴有空時段`).toEqual(sortAvail(availOf(expected.partner)));
  expect(actual.partner?.daily_limit ?? null, `${label}同伴每日上限`).toEqual(expected.partner?.daily_limit ?? null);
}

export { norm };
