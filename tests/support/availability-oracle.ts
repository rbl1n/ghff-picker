import type { DayAvailability, UnavailableSlot } from "../../src/domain/types";

// 有空時段的測試端獨立實作（不呼叫 src/domain；葉節點模組，避免循環 import）

/** 從有空時段扣掉 [start, end)，回傳正規化新陣列（相鄰合併、由早到晚；全天有空的日期不保留） */
export function subtractAvailability(avail: DayAvailability[], date: string, start: number, end: number): DayAvailability[] {
  const day = avail.find((d) => d.date === date) ?? { date, intervals: [{ start_min: 0, end_min: 1440 }] };
  const next: { start_min: number; end_min: number }[] = [];
  for (const iv of day.intervals) {
    if (end <= iv.start_min || start >= iv.end_min) {
      next.push({ ...iv });
      continue;
    }
    if (iv.start_min < start) next.push({ start_min: iv.start_min, end_min: start });
    if (iv.end_min > end) next.push({ start_min: end, end_min: iv.end_min });
  }
  const others = avail.filter((d) => d.date !== date).map((d) => ({ date: d.date, intervals: d.intervals.map((i) => ({ ...i })) }));
  const merged = mergeIntervals(next);
  const isFull = merged.length === 1 && merged[0].start_min === 0 && merged[0].end_min === 1440;
  const result = isFull ? others : [...others, { date, intervals: merged }];
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function mergeIntervals(ivs: { start_min: number; end_min: number }[]): { start_min: number; end_min: number }[] {
  const sorted = ivs.filter((i) => i.end_min > i.start_min).sort((a, b) => a.start_min - b.start_min);
  const out: { start_min: number; end_min: number }[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start_min <= last.end_min) last.end_min = Math.max(last.end_min, iv.end_min);
    else out.push({ ...iv });
  }
  return out;
}

/** 有空時段的補集（顯示用的不可看時段）；整天沒空 = 整天不可看 */
export function unavailableSlotsOf(avail: DayAvailability[]): UnavailableSlot[] {
  const slots: UnavailableSlot[] = [];
  for (const day of avail) {
    let cursor = 0;
    for (const iv of day.intervals) {
      if (iv.start_min > cursor) slots.push({ date: day.date, start_min: cursor, end_min: iv.start_min });
      cursor = iv.end_min;
    }
    if (cursor < 1440) slots.push({ date: day.date, start_min: cursor, end_min: 1440 });
  }
  return slots;
}

/** 獨立於產品碼：場次開演到散場每一分鐘都有空（跨午夜部分以隔日有空時段判斷） */
export function availableForSession(
  session: { date: string; start_min: number; end_min: number },
  avail: DayAvailability[] | undefined,
): boolean {
  const days = avail ?? [];
  let from = session.start_min;
  let to = session.end_min;
  let date = session.date;
  while (from < to) {
    const segEnd = Math.min(to, 1440);
    const day = days.find((d) => d.date === date);
    const ivs = day ? day.intervals : [{ start_min: 0, end_min: 1440 }];
    if (!ivs.some((iv) => iv.start_min <= from && segEnd <= iv.end_min)) return false;
    from = 0;
    to -= 1440;
    date = nextDate(date);
  }
  return true;
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

