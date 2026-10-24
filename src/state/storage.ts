import type { UserState } from "../domain/types";

/** 寫入一律 2；讀取接受 1（001，個人模式）與 2 */
export const SCHEMA_VERSION = 2;
const READABLE_VERSIONS = [1, 2];
export const STORAGE_KEY = "ghff-picker:user-state";

function isPartnerData(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.display_name === "string" &&
    (p.daily_limit === null || (typeof p.daily_limit === "number" && Number.isInteger(p.daily_limit) && p.daily_limit >= 0)) &&
    Array.isArray(p.film_preferences) &&
    Array.isArray(p.unavailable_slots)
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
    Array.isArray(v.unavailable_slots) &&
    Array.isArray(v.ticket_marks)
  );
}

export function loadState(): UserState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isUserState(parsed) ? { ...parsed, schema_version: SCHEMA_VERSION } : null;
  } catch {
    return null;
  }
}

export function saveState(state: UserState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, schema_version: SCHEMA_VERSION }));
  } catch {
    // 儲存空間不可用（隱私模式等）時，本次操作仍在記憶體內有效
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
