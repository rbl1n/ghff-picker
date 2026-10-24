import type { Session } from "./types";

const MIN_PER_DAY = 1440;

/** "HH:MM" → 當日分鐘數 */
export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`invalid time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 當日分鐘數 → "HH:MM"；超過 1440（跨午夜）以隔日時間顯示 */
export function formatTime(minutes: number): string {
  const m = ((minutes % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 散場 = 開演 + 片長 */
export function computeEndMin(startMin: number, runtimeMin: number): number {
  return startMin + runtimeMin;
}

/** 將 (date, minutes) 轉成可比較的絕對分鐘數 */
export function toAbsoluteMinutes(date: string, minutes: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`invalid date: ${date}`);
  const days = Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
  return days * MIN_PER_DAY + minutes;
}

export function sessionStartAbs(session: Session): number {
  return toAbsoluteMinutes(session.date, session.start_min);
}

export function sessionEndAbs(session: Session): number {
  return toAbsoluteMinutes(session.date, session.end_min);
}
