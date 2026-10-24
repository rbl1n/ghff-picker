import { useSyncExternalStore } from "react";
import { sortFilmsByCatalogOrder } from "../domain/catalog-order";
import type { Catalog, DuoItineraryEntry, FilmPreference, ItineraryEntry, PartnerData, PersonSide, SessionPref, UnscheduledMustFilm, UserState } from "../domain/types";
import { buildTradeoffs, type Tradeoff } from "../domain/tradeoff";
import { buildItinerary } from "../domain/schedule";
import { scheduleDuo } from "../domain/duo";
import { initTierRanks } from "../domain/order";
import { migrateToV3 } from "../state/migrate";
import { SCHEMA_VERSION, loadState, saveState } from "../state/storage";

export type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; catalog: Catalog };

export interface Schedule {
  /** 排程當下的輸入條件；與目前條件不同代表「條件已變更」 */
  sig: string;
  /** 自己的行程（個人模式即整份行程；兩人模式 = 一起與自己看的場次） */
  itinerary: ItineraryEntry[];
  /** 兩人模式的完整兩人行程；個人模式 = null */
  duo: DuoItineraryEntry[] | null;
  unscheduled: UnscheduledMustFilm[];
  /** 兩人模式的取捨卡片（005）；個人模式 = 空 */
  tradeoffs: Tradeoff[];
}

interface Snapshot {
  user: UserState;
  catalog: CatalogState;
  schedule: Schedule | null;
  scheduling: boolean;
}

export function emptyUserState(): UserState {
  return {
    schema_version: SCHEMA_VERSION,
    daily_limit: null,
    manual_order: null,
    updated_at: new Date().toISOString(),
    film_preferences: [],
    availability: [],
    ticket_marks: [],
  };
}

/** 讀到 1、2 版的保存：在記憶體轉成 3（不可看時段相減）；層內名次待場次表就緒後依影片順序初始化，下次保存才寫回 3 */
const stored = loadState();
const storedLegacy = stored !== null && stored.schema_version < SCHEMA_VERSION;
/** 開啟時本機是否已有保存的設定（第一次使用的判斷） */
export const hadStoredState = stored !== null;
let pendingSelfRanks = storedLegacy;
let pendingPartnerRanks = storedLegacy && !!stored?.partner;

let snap: Snapshot = {
  user: stored ? migrateToV3(stored) : emptyUserState(),
  catalog: { status: "loading" },
  schedule: null,
  scheduling: false,
};
let wantSchedule = false;
let wantMarks = false;
const listeners = new Set<() => void>();

function set(patch: Partial<Snapshot>): void {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
}

export function useStore(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
  );
}

/* ------------------------------ 使用者狀態 ------------------------------ */

function ranked(prefs: FilmPreference[], catalog: Catalog): FilmPreference[] {
  return initTierRanks(
    prefs,
    catalog.films.map((f) => f.film_id),
  );
}

/** 場次表就緒時，把尚待初始化的層內名次依場次表影片順序補上 */
function withPendingRanks(user: UserState): UserState {
  if (snap.catalog.status !== "ready" || (!pendingSelfRanks && !pendingPartnerRanks)) return user;
  const { catalog } = snap.catalog;
  const next: UserState = { ...user };
  if (pendingSelfRanks) next.film_preferences = ranked(user.film_preferences, catalog);
  if (pendingPartnerRanks && user.partner) next.partner = { ...user.partner, film_preferences: ranked(user.partner.film_preferences, catalog) };
  pendingSelfRanks = false;
  pendingPartnerRanks = false;
  return next;
}

function commit(next: UserState, patch: Partial<Snapshot> = {}): void {
  const done = withPendingRanks(next);
  saveState(done);
  set({ user: done, ...patch });
}

export function updateUser(change: (s: UserState) => UserState): void {
  commit({ ...change(snap.user), updated_at: new Date().toISOString() });
}

/** 以另一台裝置分享來的設定取代本機設定；legacy = 連結是 1、2 版（名次待初始化） */
export function replaceUser(next: UserState, legacy = false): void {
  pendingSelfRanks = legacy;
  pendingPartnerRanks = legacy && !!next.partner;
  commit(next, { schedule: null, scheduling: false });
}

/** 加入／取代同伴：同伴資料另存，自己的設定一律不動 */
export function setPartner(partner: PartnerData, selfName: string, legacy = false): void {
  pendingPartnerRanks = legacy;
  commit({ ...snap.user, self_name: selfName, partner, updated_at: new Date().toISOString() }, { schedule: null, scheduling: false });
}

/** 移除同伴：清除同伴與兩人名稱；自己的設定與搶票標記保留 */
export function removePartner(): void {
  pendingPartnerRanks = false;
  // 取捨決定只在兩人模式有意義：一併清除自己的（005，FR-516）
  const { pinned_choices: _pins, ...rest } = snap.user;
  commit({ ...rest, self_name: null, partner: null, updated_at: new Date().toISOString() }, { schedule: null, scheduling: false });
}

/** 場次標記（005）：一般 = null 取消；沒有任何標記時整個欄位移除 */
export function setSessionMark(sessionId: string, mark: SessionPref | null): void {
  updateUser((s) => {
    const { session_marks: prev, ...rest } = s;
    const marks = { ...(prev ?? {}) };
    if (mark === null) delete marks[sessionId];
    else marks[sessionId] = mark;
    return Object.keys(marks).length ? { ...rest, session_marks: marks } : rest;
  });
}

/** 取捨決定（005）：看優先場 = 寫入；改回一起看 = 移除。決定存在該人的資料裡（自己 → UserState、同伴 → PartnerData） */
export function setPinnedChoice(owner: PersonSide, filmId: string, pinned: boolean): void {
  updateUser((s) => {
    const edit = <T extends { pinned_choices?: Record<string, "prefer_session"> }>(p: T): T => {
      const { pinned_choices: prev, ...rest } = p;
      const next = { ...(prev ?? {}) };
      if (pinned) next[filmId] = "prefer_session";
      else delete next[filmId];
      return (Object.keys(next).length ? { ...rest, pinned_choices: next } : rest) as T;
    };
    if (owner === "self") return edit(s);
    return s.partner ? { ...s, partner: edit(s.partner) } : s;
  });
}

/** 行程頁的篩選（只是畫面狀態：不保存、不影響排程；離開頁面再回來仍維持，重新載入回到「全部」） */
export type ItineraryFilter = "all" | "self" | "partner";
let itineraryFilter: ItineraryFilter = "all";
const filterListeners = new Set<() => void>();
export function useItineraryFilter(): [ItineraryFilter, (f: ItineraryFilter) => void] {
  const value = useSyncExternalStore(
    (l) => {
      filterListeners.add(l);
      return () => filterListeners.delete(l);
    },
    () => itineraryFilter,
  );
  return [
    value,
    (f) => {
      itineraryFilter = f;
      filterListeners.forEach((l) => l());
    },
  ];
}

/* ------------------------------ 場次快照 ------------------------------ */

export async function loadCatalog(): Promise<void> {
  set({ catalog: { status: "loading" } });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/sessions.json`);
    if (!res.ok) throw new Error("bad status");
    const data = (await res.json()) as Catalog;
    if (!Array.isArray(data.films) || !Array.isArray(data.sessions)) throw new Error("bad shape");
    set({ catalog: { status: "ready", catalog: { ...data, films: sortFilmsByCatalogOrder(data.films) } } });
    if (pendingSelfRanks || pendingPartnerRanks) {
      // 名次初始化完成後，把轉成 3 的內容寫回（測試與搶票頁都以保存內容為準）
      const done = withPendingRanks(snap.user);
      saveState(done);
      set({ user: done });
    }
    if (wantSchedule) compute();
  } catch {
    wantSchedule = false;
    set({ catalog: { status: "error" }, scheduling: false });
  }
}

/* ------------------------------ 排程 ------------------------------ */

/** 影響行程的輸入條件指紋（分層與層內名次、有空時段、每日上限）；搶票標記由搶票頁即時處理，不算條件變更 */
export function scheduleSignature(u: UserState): string {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const own = (x: Pick<UserState, "film_preferences" | "availability" | "daily_limit" | "session_marks" | "pinned_choices">) => [
    x.film_preferences.map((p) => `${p.film_id}:${p.tier}:${p.tier_rank ?? ""}`).sort(cmp),
    (x.availability ?? []).map((d) => `${d.date}|${d.intervals.map((i) => `${i.start_min}-${i.end_min}`).join(",")}`).sort(cmp),
    x.daily_limit,
    Object.entries(x.session_marks ?? {}).map(([k, v]) => `${k}=${v}`).sort(cmp),
    Object.entries(x.pinned_choices ?? {}).map(([k, v]) => `${k}=${v}`).sort(cmp),
  ];
  return JSON.stringify(u.partner ? [...own(u), own(u.partner)] : own(u));
}

function compute(): void {
  wantSchedule = false;
  if (snap.catalog.status !== "ready") return;
  const { catalog } = snap.catalog;
  // 一般排程只看分層、時段與上限；「依搶到結果重新排程」才把搶票標記納入
  const input = wantMarks ? snap.user : { ...snap.user, ticket_marks: [] };
  wantMarks = false;
  let result: Pick<Schedule, "itinerary" | "duo" | "unscheduled" | "tradeoffs">;
  if (input.partner) {
    const duo = scheduleDuo(catalog, input, input.partner);
    const mine: ItineraryEntry[] = duo.entries
      .filter((e) => e.participant !== "partner")
      .map((e) => ({ session_id: e.session_id, tier: e.tier!, is_non_ticketed: e.is_non_ticketed, participant: e.participant, partner_tier: e.partner_tier }));
    result = { itinerary: mine, duo: duo.entries, unscheduled: duo.unscheduled, tradeoffs: buildTradeoffs(catalog, input, input.partner, duo) };
  } else {
    result = { ...buildItinerary(catalog, input), duo: null, tradeoffs: [] };
  }
  set({ schedule: { sig: scheduleSignature(snap.user), ...result }, scheduling: false });
}

/** 依目前條件重新排程；先讓畫面顯示「排程中」再計算。withMarks：保留已搶到、避開沒搶到的場次 */
export function runSchedule(withMarks = false): void {
  wantSchedule = true;
  wantMarks = withMarks;
  set({ scheduling: true });
  if (snap.catalog.status === "ready") setTimeout(compute, 0);
}

/** 尚未排過程時（例如重開工具）自動依目前條件排一次 */
export function ensureSchedule(): void {
  if (snap.schedule === null && !snap.scheduling && snap.catalog.status === "ready") runSchedule();
}
