import type { SessionMark, Tier } from "../../src/domain/types";

/** "HH:MM" → 當日分鐘數 */
export function hhmmToMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`invalid time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 驗證 YYYY-MM-DD */
export function parseDate(text: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) throw new Error(`invalid date: ${text}`);
  return text.trim();
}

export const MARK_SYMBOL_TO_ENUM: Record<string, SessionMark> = {
  "★": "guest_attending",
  "◆": "mandarin_no_subtitle",
  "▲": "no_english_subtitle",
  "⊚": "non_ticketed",
};

export function marksFromSymbols(text: string): SessionMark[] {
  return [...text].flatMap((c) => (MARK_SYMBOL_TO_ENUM[c] ? [MARK_SYMBOL_TO_ENUM[c]] : []));
}

export function symbolsFromMarks(marks: SessionMark[]): string {
  const rev = Object.entries(MARK_SYMBOL_TO_ENUM);
  return rev.filter(([, e]) => marks.includes(e)).map(([s]) => s).join("");
}

export const TIER_LABEL_TO_ENUM: Record<string, Tier> = { 必看: "must", 想看: "want", 有空再看: "maybe" };
export const TIER_ENUM_TO_LABEL: Record<Tier, string> = { must: "必看", want: "想看", maybe: "有空再看" };
