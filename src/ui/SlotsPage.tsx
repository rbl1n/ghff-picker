import { useMemo, useState } from "react";
import { addInterval, complementOf, hourCellState, subtractInterval, toggleHour, type HourCellState } from "../domain/availability";
import { formatTime, parseTime } from "../domain/time";
import type { DayAvailability, UnavailableSlot } from "../domain/types";
import { dateLabel, weekdayLabel } from "./format";
import { updateUser, useStore } from "./store";

/** 影展預設日期範圍（11/06–11/22）；金馬影展每年大致落在這段期間 */
const FESTIVAL_START = "11-06";
const FESTIVAL_END = "11-22";

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 日曆格日期：預設影展範圍，加上場次快照與已設定時段超出範圍的日期 */
function festivalDates(year: number, extraDates: string[]): string[] {
  const all = [`${year}-${FESTIVAL_START}`, `${year}-${FESTIVAL_END}`, ...extraDates].sort();
  const out: string[] = [];
  for (let d = all[0]; d <= all[all.length - 1] && out.length < 120; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 24 小時制 HH:MM → 分鐘；格式不符回傳 null */
function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return parseTime(text);
}

const slotLabel = (s: UnavailableSlot): string =>
  s.start_min === null || s.end_min === null ? "整天不可看" : `${formatTime(s.start_min)}–${formatTime(s.end_min)}`;

const NONE: DayAvailability[] = [];

const HOUR_TEXT: Record<HourCellState, string> = { available: "有空", unavailable: "沒空", partial: "部分沒空" };
const HOUR_ATTR: Record<HourCellState, string> = { available: "free", unavailable: "busy", partial: "partial" };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** 單日 24 小時格子：點擊切換有空／沒空（多日選取時同步各日同一小時），格子同時以文字標示狀態 */
function HourGrid({ date, availability, onToggle }: { date: string; availability: DayAvailability[]; onToggle: (hour: number) => void }) {
  return (
    <div className="hourday">
      <p className="hint" style={{ margin: "10px 0 6px" }}>
        {dateLabel(date)}
      </p>
      <div className="hours" role="group" aria-label={`${dateLabel(date)} 小時格子`}>
        {HOURS.map((h) => {
          const st = hourCellState(availability, date, h);
          return (
            <button key={h} className="hour" data-testid="hour-cell" data-date={date} data-hour={h} data-state={HOUR_ATTR[st]} onClick={() => onToggle(h)}>
              <b className="mono">{String(h).padStart(2, "0")}:00</b>
              <span>{HOUR_TEXT[st]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SlotsPage() {
  const { user, catalog } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [startText, setStartText] = useState("09:00");
  const [endText, setEndText] = useState("18:00");
  const [limitText, setLimitText] = useState(user.daily_limit === null ? "" : String(user.daily_limit));
  const [limitError, setLimitError] = useState(false);

  const sessionDates = useMemo(
    () => (catalog.status === "ready" ? [...new Set(catalog.catalog.sessions.map((s) => s.date))] : []),
    [catalog],
  );
  const year = catalog.status === "ready" ? catalog.catalog.festival_year : new Date().getFullYear();
  const availability = user.availability ?? NONE;
  const dates = useMemo(
    () => festivalDates(year, [...sessionDates, ...availability.map((d) => d.date)]),
    [year, sessionDates, availability],
  );

  const start = parseClock(startText);
  const end = parseClock(endText);
  const formatBad = start === null || end === null;
  const orderBad = !formatBad && end <= start;
  const canApply = !formatBad && !orderBad && picked.length > 0;

  const togglePicked = (d: string) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const setAvailability = (change: (a: DayAvailability[]) => DayAvailability[]) =>
    updateUser((s) => ({ ...s, availability: change(s.availability ?? NONE) }));

  /** 把不可看時段（分鐘精度）從已選日期的有空時段扣掉；null = 整天 */
  const addSlots = (slot: { start_min: number | null; end_min: number | null }) =>
    setAvailability((a) => picked.reduce((acc, d) => subtractInterval(acc, d, slot.start_min ?? 0, slot.end_min ?? 1440), a));

  const apply = () => {
    if (!canApply) return;
    addSlots({ start_min: start, end_min: end });
  };

  /** 刪除不可看時段 = 把該區間還給有空時段 */
  const removeSlot = (slot: UnavailableSlot) =>
    setAvailability((a) => addInterval(a, slot.date, slot.start_min ?? 0, slot.end_min ?? 1440));

  const pickedSorted = useMemo(() => [...picked].sort(), [picked]);
  const toggleHourOnPicked = (hour: number) => setAvailability((a) => pickedSorted.reduce((acc, d) => toggleHour(acc, d, hour), a));

  const commitLimit = () => {
    const text = limitText.trim();
    if (text === "") {
      setLimitError(false);
      updateUser((s) => ({ ...s, daily_limit: null }));
    } else if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) {
      setLimitError(false);
      updateUser((s) => ({ ...s, daily_limit: Number(text) }));
    } else {
      setLimitError(true);
    }
  };

  /** 不可看時段 = 有空時段的補集 */
  const slotsByDate = useMemo(() => {
    const map = new Map<string, UnavailableSlot[]>();
    for (const s of complementOf(availability)) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()];
  }, [availability]);

  return (
    <>
      <section className="card">
        <h2>選擇日期</h2>
        <p className="hint" style={{ margin: 0 }}>
          可多選
        </p>
        <div className="grid" role="group" aria-label="影展日期">
          {dates.map((d) => (
            <button
              key={d}
              className="day"
              data-testid="day-cell"
              data-date={d}
              aria-pressed={picked.includes(d)}
              aria-label={dateLabel(d)}
              onClick={() => togglePicked(d)}
            >
              <span className="hint">{weekdayLabel(d)}</span>
              <b className="mono">{Number(d.slice(8))}</b>
              {availability.some((r) => r.date === d) && <i />}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn sp" disabled={picked.length === 0} onClick={() => addSlots({ start_min: null, end_min: null })}>
            整天不可看
          </button>
        </div>
      </section>

      <section className="card">
        <h2>小時格子</h2>
        <p className="hint" style={{ margin: 0 }}>
          {pickedSorted.length > 0 ? "點一格切換有空／沒空；選了多天會一起切換" : "先在上方選擇日期，就會出現當天的 24 格"}
        </p>
        {pickedSorted.map((d) => (
          <HourGrid key={d} date={d} availability={availability} onToggle={toggleHourOnPicked} />
        ))}
      </section>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <h2>加入不可看時段</h2>
        <p className="hint" style={{ margin: 0 }}>
          {picked.length > 0 ? `套用到已選的 ${picked.length} 天` : "先在上方選擇日期"}（24 小時制，例如 09:00）
        </p>
        <div className="fields">
          <label>
            開始時間
            <input
              className={`input mono${start === null ? " bad" : ""}`}
              type="text"
              inputMode="numeric"
              placeholder="09:00"
              maxLength={5}
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
            />
          </label>
          <label>
            結束時間
            <input
              className={`input mono${end === null || orderBad ? " bad" : ""}`}
              type="text"
              inputMode="numeric"
              placeholder="18:00"
              maxLength={5}
              value={endText}
              onChange={(e) => setEndText(e.target.value)}
            />
          </label>
        </div>
        {orderBad && <p className="err">結束時間需晚於開始時間</p>}
        {formatBad && <p className="err">請用 24 小時制輸入時間，例如 09:00</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!canApply} style={{ marginTop: 10 }}>
          套用到已選日期
        </button>
      </form>

      <section className="card">
        <h2>已設定的不可看時段</h2>
        {slotsByDate.length === 0 && <p className="hint" style={{ margin: 0 }}>還沒有設定，未設定的時段都視為可看</p>}
        {slotsByDate.map(([date, slots]) => (
          <div key={date}>
            <p className="hint" style={{ margin: "8px 0 4px" }}>
              {dateLabel(date)}
            </p>
            {slots.map((s) => (
              <div key={`${s.start_min}-${s.end_min}`} className="slot" data-testid="slot-item" data-date={date}>
                <span className="mono sp" data-testid="slot-range">
                  {slotLabel(s)}
                </span>
                <button className="del" aria-label={`刪除 ${dateLabel(date)} ${slotLabel(s)}`} onClick={() => removeSlot(s)}>
                  刪除
                </button>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>每日場數上限</h2>
        <label className="hint" htmlFor="daily-limit">
          每天最多看幾場（空白＝不設上限）
        </label>
        <input
          id="daily-limit"
          data-testid="daily-limit-input"
          className={`input mono${limitError ? " bad" : ""}`}
          inputMode="numeric"
          placeholder="不設上限"
          style={{ marginTop: 6 }}
          value={limitText}
          onChange={(e) => setLimitText(e.target.value)}
          onBlur={commitLimit}
        />
        {limitError && (
          <p className="err" data-testid="daily-limit-error">
            每日上限只接受 0 以上的整數
          </p>
        )}
      </section>

      <a className="btn btn-primary btn-block" href="#/pick">
        下一步：選片
      </a>
    </>
  );
}
