import type { Film, Session, Venue } from "../../src/domain/types";

export interface ParsedSchedule {
  films: Film[];
  venues: Venue[];
  sessions: Session[];
}

/** 解析官網某日場次頁 HTML（date = YYYY-MM-DD） */
export function parseSchedulePage(_html: string, _date: string): ParsedSchedule {
  throw new Error("not implemented");
}
