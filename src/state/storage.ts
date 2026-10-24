import { BUILD_NUMBER, noteStoredBuild, noteWriteBlocked } from "./build";
import type { DayAvailability, PartnerData, UserState } from "../domain/types";

/** 寫入一律 3；讀取接受 1（001，個人模式）、2（002）與 3；高於 3 視為版本不符 */
export const SCHEMA_VERSION = 3;
/** 003 的保存格式版本 */
export const SCHEMA_VERSION_V3 = 3;
const READABLE_VERSIONS = [1, 2, 3];
export const STORAGE_KEY = "ghff-picker:user-state";
/** 每次寫入前把前一版保存另存於此（只留一份），供「復原上一版設定」 */
export const PREV_KEY = "ghff-picker:state:prev";

function isAvailability(value: unknown): value is DayAvailability[] {
  return (
    Array.isArray(value) &&
    value.every(
      (d) =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as DayAvailability).date === "string" &&
        Array.isArray((d as DayAvailability).intervals) &&
        (d as DayAvailability).intervals.every(
          (i) => typeof i === "object" && i !== null && Number.isFinite(i.start_min) && Number.isFinite(i.end_min),
        ),
    )
  );
}

/** 有空時段（v3）或舊版不可看時段（v1、v2）至少要有一種，且有的那種格式正確 */
function hasTimeSettings(v: Record<string, unknown>): boolean {
  return (v.availability === undefined || isAvailability(v.availability)) && (Array.isArray(v.unavailable_slots) || isAvailability(v.availability));
}

function isSkipped(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((x) => typeof x === "string"));
}

function isNotes(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((x) => typeof x === "string"))
  );
}

function isTopPins(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([k, v]) => ["must", "want", "maybe"].includes(k) && Array.isArray(v) && v.every((x) => typeof x === "string"));
}

function isRecordOf(value: unknown, ok: (v: unknown) => boolean): boolean {
  return value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(ok));
}

/** 場次標記（005）：session_id → prefer／only */
function isSessionMarks(value: unknown): boolean {
  return isRecordOf(value, (x) => x === "prefer" || x === "only");
}

/** 取捨決定（005）：film_id → prefer_session */
function isPinnedChoices(value: unknown): boolean {
  return isRecordOf(value, (x) => x === "prefer_session");
}

/** 院線標記：film_id → boolean */
function isTheatricalOverrides(value: unknown): boolean {
  return isRecordOf(value, (x) => typeof x === "boolean");
}

function isPartnerData(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.display_name === "string" &&
    (p.daily_limit === null || (typeof p.daily_limit === "number" && Number.isInteger(p.daily_limit) && p.daily_limit >= 0)) &&
    Array.isArray(p.film_preferences) &&
    hasTimeSettings(p) &&
    isSkipped(p.skipped_film_ids) &&
    isSessionMarks(p.session_marks) &&
    isPinnedChoices(p.pinned_choices)
  );
}

/** 判斷未知資料是否為可用的 UserState（localStorage 與分享連結共用） */
export function isUserState(value: unknown): value is UserState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schema_version === "number" &&
    READABLE_VERSIONS.includes(v.schema_version) &&
    (v.self_name === undefined || v.self_name === null || typeof v.self_name === "string") &&
    (v.partner === undefined || v.partner === null || isPartnerData(v.partner)) &&
    (v.daily_limit === null || (typeof v.daily_limit === "number" && Number.isInteger(v.daily_limit) && v.daily_limit >= 0)) &&
    (v.manual_order === null || (Array.isArray(v.manual_order) && v.manual_order.every((x) => typeof x === "string"))) &&
    Array.isArray(v.film_preferences) &&
    hasTimeSettings(v) &&
    isSkipped(v.skipped_film_ids) &&
    isNotes(v.film_notes) &&
    isSessionMarks(v.session_marks) &&
    isPinnedChoices(v.pinned_choices) &&
    isTheatricalOverrides(v.theatrical_overrides) &&
    isTopPins(v.top_pins) &&
    isSkipped(v.pending_hot_film_ids) &&
    (v.revision === undefined || (typeof v.revision === "number" && Number.isInteger(v.revision) && v.revision >= 0)) &&
    Array.isArray(v.ticket_marks)
  );
}

/** 保存／分享前的整理：版本一律 3、不再寫入舊的不可看時段、一律帶有空時段 */
export function toStored(state: UserState): UserState {
  const { unavailable_slots: _legacy, written_by_build: _wb, ...rest } = state;
  const out: UserState = { ...rest, schema_version: SCHEMA_VERSION, availability: state.availability ?? [] };
  if (state.partner) {
    const { unavailable_slots: _p, ...partner } = state.partner;
    const p: PartnerData = { ...partner, availability: state.partner.availability ?? [] };
    out.partner = p;
  }
  return out;
}

/** 讀出原樣驗證通過的內容（版本未升級；遷移由 migrateToV3 負責，下一次保存才以 3 寫回） */
export function loadState(): UserState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isUserState(parsed)) return null;
    noteStoredBuild(parsed.written_by_build);
    return parsed;
  } catch {
    return null;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** 本版本認得的頂層欄位；其餘（較新版本加的）一律從最新保存原樣保留 */
const USER_KEYS = [
  "schema_version", "self_name", "partner", "daily_limit", "manual_order", "updated_at", "film_preferences", "unavailable_slots",
  "availability", "skipped_film_ids", "film_notes", "session_marks", "pinned_choices", "theatrical_overrides", "top_pins", "pending_hot_film_ids", "revision",
  "written_by_build", "ticket_marks",
];
const PARTNER_KEYS = [
  "display_name", "daily_limit", "film_preferences", "unavailable_slots", "availability", "skipped_film_ids", "session_marks", "pinned_choices",
];

/** 以最新保存為底，只覆寫本版本認得的欄位；影片層級項目依 film_id 保留未知欄位 */
function mergeKnown(latest: unknown, next: Obj, keys: string[]): Obj {
  const out: Obj = isObj(latest) ? { ...latest } : {};
  for (const k of keys) delete out[k];
  Object.assign(out, next);
  const oldPrefs = isObj(latest) && Array.isArray(latest.film_preferences) ? latest.film_preferences : [];
  if (Array.isArray(next.film_preferences)) {
    out.film_preferences = next.film_preferences.map((p: unknown) => {
      const old = isObj(p) ? oldPrefs.find((o) => isObj(o) && o.film_id === p.film_id) : undefined;
      return isObj(old) && isObj(p) ? { ...old, ...p } : p;
    });
  }
  return out;
}

/** 寫入保存；回傳是否寫入。保存內容由更新的版本寫入時，過期的分頁不寫入 */
export function saveState(state: UserState): boolean {
  try {
    const prev = window.localStorage.getItem(STORAGE_KEY);
    let latest: unknown = null;
    if (prev !== null) {
      try {
        latest = JSON.parse(prev);
      } catch {
        latest = null;
      }
    }
    if (isObj(latest) && noteStoredBuild(latest.written_by_build)) {
      noteWriteBlocked();
      return false;
    }
    const stored = toStored(state) as unknown as Obj;
    const merged = mergeKnown(latest, stored, USER_KEYS);
    if (isObj(stored.partner)) merged.partner = mergeKnown(isObj(latest) ? latest.partner : null, stored.partner, PARTNER_KEYS);
    merged.written_by_build = BUILD_NUMBER;
    const json = JSON.stringify(merged);
    if (prev !== null && prev !== json) window.localStorage.setItem(PREV_KEY, prev);
    window.localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    // 儲存空間不可用（隱私模式等）時，本次操作仍在記憶體內有效
    return true;
  }
}

/** 讀出備份的上一版保存（沒有或損毀 = null） */
export function loadPreviousState(): UserState | null {
  try {
    const raw = window.localStorage.getItem(PREV_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isUserState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
