import type { Session, SessionMark, Tier } from "../domain/types";
import { formatTime } from "../domain/time";

export { formatTime };

const WEEKDAY = "日一二三四五六";

/** 2026-11-15 → 11/15（日） */
export function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}（${WEEKDAY[d.getUTCDay()]}）`;
}

export function weekdayLabel(date: string): string {
  return WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export const TIER_LABEL: Record<Tier, string> = { must: "必看", want: "想看", maybe: "有空再看" };
export const TIERS: Tier[] = ["must", "want", "maybe"];
export const TIER_TAG_CLASS: Record<Tier, string> = { must: "tag-must", want: "tag-want", maybe: "tag-free" };

export const MARK_LABEL: Record<SessionMark, string> = {
  guest_attending: "★ 影人出席",
  mandarin_no_subtitle: "◆ 華語無中英字幕",
  no_english_subtitle: "▲ 非英語無英文字幕",
  non_ticketed: "⊚ 非售票活動",
  priority_screening: "優先特映場",
};

export const LEGEND: { symbol: string; meaning: string }[] = [
  { symbol: "★", meaning: "影人出席" },
  { symbol: "◆", meaning: "華語無中英字幕" },
  { symbol: "▲", meaning: "非英語無英文字幕" },
  { symbol: "⊚", meaning: "非售票活動" },
];

export function isGuest(s: Session): boolean {
  return s.marks.includes("guest_attending");
}

/** 開演–散場，跨午夜的散場以隔日時間顯示 */
export function timeRange(s: Session): string {
  return `${formatTime(s.start_min)}–${formatTime(s.end_min)}`;
}
