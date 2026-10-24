import { createBdd } from "playwright-bdd";
import type {
  Catalog,
  DayAvailability,
  Film,
  ItineraryEntry,
  Session,
  Tier,
  TicketListItem,
  UnavailableSlot,
  UserState,
  Venue,
} from "../../src/domain/types";
import { cinemaOfVenue, createPlannerWorld, type PlannerWorld } from "./planner-world";
import { hhmmToMin, marksFromSymbols, TIER_LABEL_TO_ENUM } from "./tables";
import { availableForSession } from "./availability-oracle";

/**
 * planner 共用 context（module 層級單例，每個 scenario 的 Before 重置）。
 * planner 其他 steps 檔也可 import { getCtx } 共用同一個世界。
 */
export interface PlannerCtx {
  world: PlannerWorld;
  ticketList: TicketListItem[] | null;
  /** 兩人模式：分給同伴的列（同伴的順序，004）；個人模式 = null */
  partnerList: TicketListItem[] | null;
  /** session_id -> 可看與否（最近一次「查看場次可看狀態」） */
  watchability: Map<string, boolean> | null;
  /** 查看可看狀態當下的使用者狀態快照（JSON） */
  stateSnapshotAtQuery: string | null;
  /** 最近一次相容判定結果 */
  compat: CompatRow[] | null;
}

export interface CompatRow {
  front: string;
  back: string;
  compatible: boolean;
  swappedCompatible: boolean;
  buffer: number;
  a: Session;
  b: Session;
}

let ctx: PlannerCtx = freshCtx();

function freshCtx(): PlannerCtx {
  return { world: createPlannerWorld(), ticketList: null, partnerList: null, watchability: null, stateSnapshotAtQuery: null, compat: null };
}

export function getCtx(): PlannerCtx {
  return ctx;
}

export const { Given, When, Then, Before } = createBdd();

Before(async () => {
  ctx = freshCtx();
});

export function emptyState(): UserState {
  return {
    schema_version: 1,
    daily_limit: null,
    manual_order: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    film_preferences: [],
    unavailable_slots: [],
    availability: [],
    ticket_marks: [],
  };
}

export function requireCatalog(): Catalog {
  if (!ctx.world.catalog) throw new Error("world 尚無場次快照（缺少 Given 影展場次表）");
  return ctx.world.catalog;
}

export function ensureState(): UserState {
  if (!ctx.world.state) ctx.world.state = emptyState();
  return ctx.world.state;
}

export function filmIdOf(title: string): string {
  const f = requireCatalog().films.find((x) => x.title === title);
  if (!f) throw new Error(`場次表中找不到片名: ${title}`);
  return f.film_id;
}

export function titleOf(filmId: string): string {
  const f = requireCatalog().films.find((x) => x.film_id === filmId);
  if (!f) throw new Error(`找不到 film_id: ${filmId}`);
  return f.title;
}

export function sessionById(id: string): Session {
  const s = requireCatalog().sessions.find((x) => x.session_id === id);
  if (!s) throw new Error(`找不到 session_id: ${id}`);
  return s;
}

export function normTime(t: string): string {
  const [h, m] = t.trim().split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/** 以片名 + 日期 + 開演找場次 */
export function findSession(title: string, date: string, start: string): Session {
  const cat = requireCatalog();
  const fid = filmIdOf(title);
  const startMin = hhmmToMin(start);
  const s = cat.sessions.find((x) => x.film_id === fid && x.date === date && x.start_min === startMin);
  if (!s) throw new Error(`找不到場次: ${title} ${date} ${start}`);
  return s;
}

/** "片名 日期 開演" */
export function parseFilmSessionRef(text: string): { title: string; date: string; start: string } {
  const m = /^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`格式應為「片名 日期 開演」: ${text}`);
  return { title: m[1], date: m[2], start: m[3] };
}

/** "日期 開演 [影廳] [★]"，只比對有寫出的部分 */
export function sessionMatches(session: Session, spec: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})(?:\s+(.*))?$/.exec(spec.trim());
  if (!m) throw new Error(`場次字串格式錯誤: ${spec}`);
  if (session.date !== m[1]) return false;
  if (session.start_min !== hhmmToMin(m[2])) return false;
  let rest = (m[3] ?? "").trim();
  if (rest.includes("★")) {
    if (!session.marks.includes("guest_attending")) return false;
    rest = rest.replace(/★/g, "").trim();
  }
  if (rest && !session.venue_name.includes(rest)) return false;
  return true;
}

export function describeSession(s: Session): string {
  return `${s.date} ${String(Math.floor(s.start_min / 60)).padStart(2, "0")}:${String(s.start_min % 60).padStart(2, "0")} ${s.venue_name}`;
}

/** "HH:MM–HH:MM" 或 "整天不可看" → 時段 */
export function parseSlotText(date: string, text: string): UnavailableSlot {
  const t = text.trim();
  if (t === "整天不可看") return { date, start_min: 0, end_min: 1440 };
  const m = /^(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})$/.exec(t);
  if (!m) throw new Error(`時段格式錯誤: ${text}`);
  return { date, start_min: hhmmToMin(m[1]), end_min: hhmmToMin(m[2]) };
}

export function slotToText(slot: UnavailableSlot): string {
  if (slot.start_min === null || slot.end_min === null) return "整天不可看";
  if (slot.start_min === 0 && slot.end_min === 1440) return "整天不可看";
  const f = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return `${f(slot.start_min)}–${f(slot.end_min)}`;
}

export function dayNumber(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, mo - 1, d) / 86_400_000);
}

/** 獨立於產品碼的絕對分鐘數 */
export function absMin(date: string, minutes: number): number {
  return dayNumber(date) * 1440 + minutes;
}

export interface TableRowInput {
  片名: string;
  日期: string;
  開演: string;
  片長: string;
  分級?: string;
  影廳: string;
  標記?: string;
}

/** 影展場次表 Data Table → Catalog */
export function buildCatalogFromRows(rows: Record<string, string>[]): Catalog {
  const films: Film[] = [];
  const venues: Venue[] = [];
  const sessions: Session[] = [];
  rows.forEach((r, i) => {
    let film = films.find((f) => f.title === r["片名"]);
    if (!film) {
      film = {
        film_id: `f${String(films.length + 1).padStart(3, "0")}`,
        title: r["片名"],
        runtime_min: Number(r["片長"]),
        rating: r["分級"] && r["分級"].trim() ? r["分級"].trim() : "普",
      };
      films.push(film);
    }
    const venueName = r["影廳"];
    if (!venues.some((v) => v.venue_name === venueName)) {
      venues.push({ venue_name: venueName, cinema: cinemaOfVenue(venueName) });
    }
    const start = hhmmToMin(r["開演"]);
    sessions.push({
      session_id: `s${String(i + 1).padStart(4, "0")}`,
      film_id: film.film_id,
      date: r["日期"].trim(),
      start_min: start,
      end_min: start + Number(r["片長"]),
      venue_name: venueName,
      marks: marksFromSymbols(r["標記"] ?? ""),
    });
  });
  return { festival_year: 2026, source_url: "test://planner", fetched_at: "2026-01-01T00:00:00.000Z", films, venues, sessions };
}

/** 固定種子亂數 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 壓力資料：N 部已分層影片、每部 M 場次，日期散布 11/06–11/22 */
export function buildStressData(filmCount: number, sessionsPerFilm: number): { catalog: Catalog; state: UserState } {
  const rand = mulberry32(20261106);
  const tiers: Tier[] = ["must", "want", "maybe"];
  const venueNames = ["台北信義威秀 10廳", "TITAN"];
  const rows: Record<string, string>[] = [];
  for (let f = 0; f < filmCount; f++) {
    const runtime = 80 + Math.floor(rand() * 8) * 10;
    for (let k = 0; k < sessionsPerFilm; k++) {
      const day = 6 + Math.floor(rand() * 17); // 6..22
      const startMin = 10 * 60 + Math.floor(rand() * 25) * 30; // 10:00..22:00
      const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const mm = String(startMin % 60).padStart(2, "0");
      rows.push({
        片名: `壓力片${String(f + 1).padStart(3, "0")}`,
        日期: `2026-11-${String(day).padStart(2, "0")}`,
        開演: `${hh}:${mm}`,
        片長: String(runtime),
        影廳: venueNames[(f * sessionsPerFilm + k) % 2],
      });
    }
  }
  const catalog = buildCatalogFromRows(rows);
  const state = emptyState();
  // 層內名次依影片順序（每層 1 起連續）
  const seen: Record<string, number> = { must: 0, want: 0, maybe: 0 };
  state.film_preferences = catalog.films.map((film, i) => ({
    film_id: film.film_id,
    tier: tiers[i % 3],
    is_hot: false,
    tier_rank: ++seen[tiers[i % 3]],
  }));
  return { catalog, state };
}

export { TIER_LABEL_TO_ENUM };

// ---------- 獨立 oracle（不呼叫 src/domain）----------

export function oracleBuffer(a: Session, b: Session): number {
  const ca = cinemaOfVenue(a.venue_name);
  const cb = cinemaOfVenue(b.venue_name);
  return ca === cb && ca !== "unknown" ? 5 : 15;
}

export function oracleCompatible(a: Session, b: Session): boolean {
  return absMin(b.date, b.start_min) - absMin(a.date, a.end_min) >= oracleBuffer(a, b);
}

/** 場次開演到散場每一分鐘都有空（獨立實作，以有空時段判斷） */
export function oracleAvailable(s: Session, availability: DayAvailability[] | undefined): boolean {
  return availableForSession(s, availability);
}

export function pairwiseCompatible(sessions: Session[]): boolean {
  const sorted = [...sessions].sort((x, y) => absMin(x.date, x.start_min) - absMin(y.date, y.start_min));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (!oracleCompatible(sorted[i], sorted[j])) return false;
    }
  }
  return true;
}

/** 排程目標（003）：必看／想看／有空再看數、各層排入影片的層內名次（由小到大）、★ 場次數 */
export interface Objective {
  counts: [number, number, number];
  /** 依 must、want、maybe 各層把排入影片的名次由小到大排列 */
  ranks: [number[], number[], number[]];
  stars: number;
}

const TIERS: Tier[] = ["must", "want", "maybe"];

export function emptyObjective(): Objective {
  return { counts: [0, 0, 0], ranks: [[], [], []], stars: 0 };
}

/** 影片層內名次；沒帶名次 = 排在最後 */
export function tierRankOf(state: { film_preferences: { film_id: string; tier_rank?: number }[] }, filmId: string): number {
  return state.film_preferences.find((p) => p.film_id === filmId)?.tier_rank ?? Number.MAX_SAFE_INTEGER;
}

/** 由排入的 (層級, 名次, 是否 ★) 清單算出目標值 */
export function objectiveFrom(chosen: { tier: Tier; rank: number; star: boolean }[]): Objective {
  const o = emptyObjective();
  for (const c of chosen) {
    const i = TIERS.indexOf(c.tier);
    o.counts[i]++;
    o.ranks[i].push(c.rank);
    if (c.star) o.stars++;
  }
  for (const r of o.ranks) r.sort((x, y) => x - y);
  return o;
}

/** 前三項字典序：>0 表示 a 較佳 */
export function compareCounts(a: Objective, b: Objective): number {
  for (let i = 0; i < 3; i++) if (a.counts[i] !== b.counts[i]) return a.counts[i] - b.counts[i];
  return 0;
}

/** 層內名次（第 4 項）：依必看、想看、有空再看逐層逐一比較，名次較小者勝；>0 表示 a 較佳。需在前三項相同時使用 */
export function compareRanks(a: Objective, b: Objective): number {
  for (let t = 0; t < 3; t++) {
    const n = Math.min(a.ranks[t].length, b.ranks[t].length);
    for (let i = 0; i < n; i++) if (a.ranks[t][i] !== b.ranks[t][i]) return b.ranks[t][i] - a.ranks[t][i];
  }
  return 0;
}

/** 個人目標字典序：必看、想看、有空再看數 > 層內名次 > ★ 數；>0 表示 a 較佳 */
export function compareObjective(a: Objective, b: Objective): number {
  return compareCounts(a, b) || compareRanks(a, b) || a.stars - b.stars;
}

export function objectiveOf(entries: ItineraryEntry[], catalog: Catalog, state: UserState): Objective {
  return objectiveFrom(
    entries.map((e) => {
      const s = catalog.sessions.find((x) => x.session_id === e.session_id)!;
      return { tier: e.tier, rank: tierRankOf(state, s.film_id), star: s.marks.includes("guest_attending") };
    }),
  );
}

export interface FeasibleInput {
  catalog: Catalog;
  film_preferences: { film_id: string; tier: Tier; tier_rank?: number }[];
  availability?: DayAvailability[];
  daily_limit: number | null;
}

/** 窮舉單人所有可行組合（每片至多一場、兩兩相容、有空、符合每日上限）；回傳每個組合的場次與層級 */
export function enumerateFeasible(input: FeasibleInput): { s: Session; tier: Tier; rank: number }[][] {
  const { catalog, daily_limit: limit } = input;
  const prefs = input.film_preferences.filter((p) => catalog.films.some((f) => f.film_id === p.film_id));
  const filmOptions = prefs.map((p) => ({
    tier: p.tier,
    rank: p.tier_rank ?? Number.MAX_SAFE_INTEGER,
    sessions: catalog.sessions.filter((s) => s.film_id === p.film_id && oracleAvailable(s, input.availability)),
  }));
  const out: { s: Session; tier: Tier; rank: number }[][] = [];
  let nodes = 0;
  const chosen: { s: Session; tier: Tier; rank: number }[] = [];
  const perDay = new Map<string, number>();
  const dfs = (i: number) => {
    if (++nodes > 5_000_000) throw new Error("窮舉節點過多，測試資料超出 oracle 能力");
    if (i === filmOptions.length) {
      out.push([...chosen]);
      return;
    }
    dfs(i + 1); // 不排此片
    for (const s of filmOptions[i].sessions) {
      if (limit !== null && (perDay.get(s.date) ?? 0) >= limit) continue;
      if (!chosen.every((c) => (absMin(c.s.date, c.s.start_min) <= absMin(s.date, s.start_min) ? oracleCompatible(c.s, s) : oracleCompatible(s, c.s)))) continue;
      chosen.push({ s, tier: filmOptions[i].tier, rank: filmOptions[i].rank });
      perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
      dfs(i + 1);
      perDay.set(s.date, (perDay.get(s.date) ?? 0) - 1);
      chosen.pop();
    }
  };
  dfs(0);
  return out;
}

/** 窮舉所有可行組合，回傳最大目標值（含層內名次） */
export function bruteForceBest(catalog: Catalog, state: UserState): Objective {
  let best: Objective | null = null;
  for (const combo of enumerateFeasible({
    catalog,
    film_preferences: state.film_preferences,
    availability: state.availability,
    daily_limit: state.daily_limit,
  })) {
    const o = objectiveFrom(combo.map((c) => ({ tier: c.tier, rank: c.rank, star: c.s.marks.includes("guest_attending") })));
    if (!best || compareObjective(o, best) > 0) best = o;
  }
  return best ?? emptyObjective();
}
