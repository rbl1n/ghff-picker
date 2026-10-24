import { useSyncExternalStore } from "react";
import type { Catalog, ItineraryEntry, UnscheduledMustFilm, UserState } from "../domain/types";
import { buildItinerary } from "../domain/schedule";
import { SCHEMA_VERSION, loadState, saveState } from "../state/storage";

export type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; catalog: Catalog };

export interface Schedule {
  /** 排程當下的輸入條件；與目前條件不同代表「條件已變更」 */
  sig: string;
  itinerary: ItineraryEntry[];
  unscheduled: UnscheduledMustFilm[];
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
    unavailable_slots: [],
    ticket_marks: [],
  };
}

let snap: Snapshot = {
  user: loadState() ?? emptyUserState(),
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

export function updateUser(change: (s: UserState) => UserState): void {
  const next = { ...change(snap.user), updated_at: new Date().toISOString() };
  saveState(next);
  set({ user: next });
}

/** 以另一台裝置分享來的設定取代本機設定 */
export function replaceUser(next: UserState): void {
  saveState(next);
  set({ user: next, schedule: null, scheduling: false });
}

/* ------------------------------ 場次快照 ------------------------------ */

export async function loadCatalog(): Promise<void> {
  set({ catalog: { status: "loading" } });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/sessions.json`);
    if (!res.ok) throw new Error("bad status");
    const data = (await res.json()) as Catalog;
    if (!Array.isArray(data.films) || !Array.isArray(data.sessions)) throw new Error("bad shape");
    set({ catalog: { status: "ready", catalog: data } });
    if (wantSchedule) compute();
  } catch {
    wantSchedule = false;
    set({ catalog: { status: "error" }, scheduling: false });
  }
}

/* ------------------------------ 排程 ------------------------------ */

/** 影響行程的輸入條件指紋（分層、不可看時段、每日上限）；搶票標記由搶票頁即時處理，不算條件變更 */
export function scheduleSignature(u: UserState): string {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify([
    u.film_preferences.map((p) => `${p.film_id}:${p.tier}`).sort(cmp),
    u.unavailable_slots.map((s) => `${s.date}|${s.start_min}|${s.end_min}`).sort(cmp),
    u.daily_limit,
  ]);
}

function compute(): void {
  wantSchedule = false;
  if (snap.catalog.status !== "ready") return;
  const { catalog } = snap.catalog;
  const user = snap.user;
  // 一般排程只看分層、時段與上限；「依搶到結果重新排程」才把搶票標記納入
  const result = buildItinerary(catalog, wantMarks ? user : { ...user, ticket_marks: [] });
  wantMarks = false;
  set({ schedule: { sig: scheduleSignature(user), ...result }, scheduling: false });
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
