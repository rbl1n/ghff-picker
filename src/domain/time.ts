import type { Session } from "./types";

/** "HH:MM" → 當日分鐘數 */
export function parseTime(_hhmm: string): number {
  throw new Error("not implemented");
}

/** 當日分鐘數 → "HH:MM"（>1440 跨午夜時的顯示規則待定） */
export function formatTime(_minutes: number): string {
  throw new Error("not implemented");
}

/** 散場 = 開演 + 片長 */
export function computeEndMin(_startMin: number, _runtimeMin: number): number {
  throw new Error("not implemented");
}

/** 將 (date, minutes) 轉成可比較的絕對分鐘數 */
export function toAbsoluteMinutes(_date: string, _minutes: number): number {
  throw new Error("not implemented");
}

export function sessionStartAbs(_session: Session): number {
  throw new Error("not implemented");
}
