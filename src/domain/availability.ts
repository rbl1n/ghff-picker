import type { Session, UnavailableSlot } from "./types";
import { sessionEndAbs, sessionStartAbs, toAbsoluteMinutes } from "./time";

/** 場次與任一不可看時段有重疊即不可看（開演到散場須完全落在可看時段內） */
export function isSessionWatchable(session: Session, slots: UnavailableSlot[]): boolean {
  const st = sessionStartAbs(session);
  const en = sessionEndAbs(session);
  for (const slot of slots) {
    const whole = slot.start_min === null || slot.end_min === null;
    const from = toAbsoluteMinutes(slot.date, whole ? 0 : slot.start_min!);
    const to = toAbsoluteMinutes(slot.date, whole ? 1440 : slot.end_min!);
    if (st < to && en > from) return false;
  }
  return true;
}

export function applySlotToDates(
  slot: { start_min: number | null; end_min: number | null },
  dates: string[],
): UnavailableSlot[] {
  return dates.map((date) => ({ date, start_min: slot.start_min, end_min: slot.end_min }));
}
