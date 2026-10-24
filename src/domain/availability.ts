import type { AvailableInterval, DayAvailability, Session, UnavailableSlot } from "./types";

// ───────── 003 有空時段（分鐘精度；未設定的日期全天有空） ─────────

export type HourCellState = "available" | "unavailable" | "partial";

const DAY_MIN = 1440;

function mergeIntervals(ivs: AvailableInterval[]): AvailableInterval[] {
  const sorted = ivs
    .map((i) => ({ start_min: Math.max(0, i.start_min), end_min: Math.min(DAY_MIN, i.end_min) }))
    .filter((i) => i.end_min > i.start_min)
    .sort((a, b) => a.start_min - b.start_min);
  const out: AvailableInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start_min <= last.end_min) last.end_min = Math.max(last.end_min, iv.end_min);
    else out.push({ ...iv });
  }
  return out;
}

function intervalsOf(availability: DayAvailability[], date: string): AvailableInterval[] {
  const day = availability.find((d) => d.date === date);
  return day ? day.intervals : [{ start_min: 0, end_min: DAY_MIN }];
}

/** 把單日有空時段正規化（排序、合併重疊與相鄰、去空）；恰為全天有空時回傳 null（回到預設） */
export function normalizeDay(day: DayAvailability): DayAvailability | null {
  const intervals = mergeIntervals(day.intervals);
  if (intervals.length === 1 && intervals[0].start_min === 0 && intervals[0].end_min === DAY_MIN) return null;
  return { date: day.date, intervals };
}

function replaceDay(availability: DayAvailability[], date: string, intervals: AvailableInterval[]): DayAvailability[] {
  const others = availability.filter((d) => d.date !== date).map((d) => ({ date: d.date, intervals: d.intervals.map((i) => ({ ...i })) }));
  const norm = normalizeDay({ date, intervals });
  const all = norm ? [...others, norm] : others;
  return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 從有空時段扣掉 [start_min, end_min)（分鐘精度），回傳新的正規化有空時段 */
export function subtractInterval(
  availability: DayAvailability[],
  date: string,
  start_min: number,
  end_min: number,
): DayAvailability[] {
  const next: AvailableInterval[] = [];
  for (const iv of intervalsOf(availability, date)) {
    if (end_min <= iv.start_min || start_min >= iv.end_min) {
      next.push({ ...iv });
      continue;
    }
    if (iv.start_min < start_min) next.push({ start_min: iv.start_min, end_min: start_min });
    if (iv.end_min > end_min) next.push({ start_min: end_min, end_min: iv.end_min });
  }
  return replaceDay(availability, date, next);
}

export function addInterval(availability: DayAvailability[], date: string, start_min: number, end_min: number): DayAvailability[] {
  return replaceDay(availability, date, [...intervalsOf(availability, date), { start_min, end_min }]);
}

/** 單一小時格子（0–23）的狀態：整小時有空 / 整小時沒空 / 部分沒空 */
export function hourCellState(availability: DayAvailability[], date: string, hour: number): HourCellState {
  const from = hour * 60;
  const to = from + 60;
  const ivs = intervalsOf(availability, date);
  if (ivs.some((iv) => iv.start_min <= from && to <= iv.end_min)) return "available";
  if (ivs.some((iv) => iv.start_min < to && iv.end_min > from)) return "partial";
  return "unavailable";
}

/** 點擊小時格子：有空 -> 整小時沒空；沒空 -> 整小時有空；部分沒空 -> 整小時沒空 */
export function toggleHour(availability: DayAvailability[], date: string, hour: number): DayAvailability[] {
  const from = hour * 60;
  const to = from + 60;
  return hourCellState(availability, date, hour) === "unavailable"
    ? addInterval(availability, date, from, to)
    : subtractInterval(availability, date, from, to);
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** 場次開演到散場每一分鐘都有空（跨午夜部分以隔日有空時段判斷） */
export function isSessionAvailable(session: Session, availability: DayAvailability[]): boolean {
  let from = session.start_min;
  let to = session.end_min;
  let date = session.date;
  while (from < to) {
    const segEnd = Math.min(to, DAY_MIN);
    if (!intervalsOf(availability, date).some((iv) => iv.start_min <= from && segEnd <= iv.end_min)) return false;
    from = 0;
    to -= DAY_MIN;
    date = nextDate(date);
  }
  return true;
}

/** 舊版不可看時段 -> 有空時段（相減遷移）：逐筆從全天有空扣除，重疊自然合併 */
export function availabilityFromUnavailable(slots: UnavailableSlot[]): DayAvailability[] {
  let avail: DayAvailability[] = [];
  for (const slot of slots) {
    const whole = slot.start_min === null || slot.end_min === null;
    avail = subtractInterval(avail, slot.date, whole ? 0 : slot.start_min!, whole ? DAY_MIN : slot.end_min!);
  }
  return avail;
}

/** 一個人的有空時段：有 availability 就用它；舊資料（尚未遷移、只有不可看時段）即時相減 */
export function availabilityOf(person: { availability?: DayAvailability[]; unavailable_slots?: UnavailableSlot[] }): DayAvailability[] {
  return person.availability ?? availabilityFromUnavailable(person.unavailable_slots ?? []);
}

/** 有空時段的補集（畫面上的「不可看時段」）：整天沒空 = start/end 皆 null；依日期、時間排序 */
export function complementOf(availability: DayAvailability[]): UnavailableSlot[] {
  const out: UnavailableSlot[] = [];
  for (const row of [...availability].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const ivs = mergeIntervals(row.intervals);
    if (ivs.length === 0) {
      out.push({ date: row.date, start_min: null, end_min: null });
      continue;
    }
    let cursor = 0;
    for (const iv of ivs) {
      if (iv.start_min > cursor) out.push({ date: row.date, start_min: cursor, end_min: iv.start_min });
      cursor = iv.end_min;
    }
    if (cursor < DAY_MIN) out.push({ date: row.date, start_min: cursor, end_min: DAY_MIN });
  }
  return out;
}
