import { useMemo, useState } from "react";
import { applySlotToDates } from "../domain/availability";
import { formatTime, parseTime } from "../domain/time";
import type { UnavailableSlot } from "../domain/types";
import { dateLabel, weekdayLabel } from "./format";
import { runSchedule, updateUser, useStore } from "./store";

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

const sameSlot = (a: UnavailableSlot, b: UnavailableSlot): boolean =>
  a.date === b.date && a.start_min === b.start_min && a.end_min === b.end_min;

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
  const dates = useMemo(
    () => festivalDates(year, [...sessionDates, ...user.unavailable_slots.map((s) => s.date)]),
    [year, sessionDates, user.unavailable_slots],
  );

  const start = parseClock(startText);
  const end = parseClock(endText);
  const formatBad = start === null || end === null;
  const orderBad = !formatBad && end <= start;
  const canApply = !formatBad && !orderBad && picked.length > 0;

  const togglePicked = (d: string) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const addSlots = (slot: { start_min: number | null; end_min: number | null }) => {
    const added = applySlotToDates(slot, picked);
    updateUser((s) => ({
      ...s,
      unavailable_slots: [...s.unavailable_slots, ...added.filter((a) => !s.unavailable_slots.some((x) => sameSlot(x, a)))],
    }));
  };

  const apply = () => {
    if (!canApply) return;
    addSlots({ start_min: start, end_min: end });
  };

  const removeSlot = (slot: UnavailableSlot) =>
    updateUser((s) => ({ ...s, unavailable_slots: s.unavailable_slots.filter((x) => !sameSlot(x, slot)) }));

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

  const slotsByDate = useMemo(() => {
    const map = new Map<string, UnavailableSlot[]>();
    for (const s of user.unavailable_slots) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    for (const arr of map.values()) arr.sort((a, b) => (a.start_min ?? -1) - (b.start_min ?? -1));
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [user.unavailable_slots]);

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
              {user.unavailable_slots.some((s) => s.date === d) && <i />}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn sp" disabled={picked.length === 0} onClick={() => addSlots({ start_min: null, end_min: null })}>
            整天不可看
          </button>
        </div>
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

      <a className="btn btn-primary btn-block" href="#/itinerary" onClick={() => runSchedule()}>
        排行程
      </a>
    </>
  );
}
