import type { Session, UnavailableSlot } from "./types";

export function isSessionWatchable(_session: Session, _slots: UnavailableSlot[]): boolean {
  throw new Error("not implemented");
}

export function applySlotToDates(_slot: { start_min: number | null; end_min: number | null }, _dates: string[]): UnavailableSlot[] {
  throw new Error("not implemented");
}
