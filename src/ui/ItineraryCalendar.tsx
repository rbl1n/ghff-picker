import { useState } from "react";
import type { Tier } from "../domain/types";
import { TIER_LABEL, formatTime } from "./format";

/** 月曆用的一場：由行程頁把（已套用篩選的）行程列轉成這個形狀 */
export interface CalEntry {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  no?: string;
  title: string;
  venue: string;
  tier: Tier;
  /** 兩人模式才有：together = 一起；其餘 = 單人自己看 */
  who?: "together" | "solo";
  whoLabel?: string;
}

const HEAD = ["日", "一", "二", "三", "四", "五", "六"];

export function summarize(entries: CalEntry[]): { films: number; days: number; maxCount: number; maxDate: string } {
  const per = new Map<string, number>();
  for (const e of entries) per.set(e.date, (per.get(e.date) ?? 0) + 1);
  let maxCount = 0;
  let maxDate = "";
  for (const [d, n] of [...per.entries()].sort()) if (n > maxCount) [maxCount, maxDate] = [n, d];
  return { films: entries.length, days: per.size, maxCount, maxDate };
}

const md = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;

export function ItineraryCalendar({ entries, festivalDates }: { entries: CalEntry[]; festivalDates: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const festival = new Set(festivalDates);
  const first = [...festivalDates].sort()[0] ?? "2026-11-01";
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7));
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDate = new Map<string, CalEntry[]>();
  for (const e of [...entries].sort((a, b) => a.startMin - b.startMin)) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const sum = summarize(entries);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const panel = open ? byDate.get(open) ?? [] : null;

  return (
    <section className="cal" data-testid="calendar-view" aria-label={`${year} 年 ${month} 月行程月曆`}>
      <p className="cal-sum" data-testid="calendar-summary">
        {sum.films === 0 ? "共 0 部" : `共 ${sum.films} 部・${sum.days} 天・最多一天 ${sum.maxCount} 部（${md(sum.maxDate)}）`}
      </p>
      <h2 className="cal-title">
        {year} 年 {month} 月
      </h2>
      <div className="cal-grid" role="grid">
        {HEAD.map((h) => (
          <div key={h} className="cal-h" role="columnheader">
            {h}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} className="cal-c blank" aria-hidden="true" />;
          const day = Number(date.slice(8));
          if (!festival.has(date))
            return (
              <div key={date} className="cal-c muted" data-testid="calendar-day" data-date={date} data-count="0" data-festival="false">
                <span className="cal-d">{day}</span>
              </div>
            );
          const list = byDate.get(date) ?? [];
          return (
            <button
              key={date}
              type="button"
              className={`cal-c fest${open === date ? " sel" : ""}`}
              data-testid="calendar-day"
              data-date={date}
              data-count={list.length}
              data-festival="true"
              aria-pressed={open === date}
              aria-label={`${md(date)} ${list.length} 部`}
              onClick={() => setOpen(open === date ? null : date)}
            >
              <span className="cal-d">{day}</span>
              {list.length > 0 && (
                <b className="cal-n" data-testid="calendar-count">
                  {list.length} 部
                </b>
              )}
              <span className="cal-dots" aria-hidden="true">
                {list.map((e) => (
                  <i key={e.id} className={`dot t-${e.tier}${e.who === "together" ? " tg" : ""}`} />
                ))}
              </span>
              <span className="cal-blks">
                {list.map((e) => (
                  <span key={e.id} className={`blk t-${e.tier}${e.who === "together" ? " tg" : ""}`} data-testid="calendar-block" title={`${formatTime(e.startMin)} ${e.title}`}>
                    <span className="mono">{formatTime(e.startMin)}</span> {e.no ? `${e.no} ` : ""}
                    {e.title}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {panel && open && (
        <section className="cal-panel" data-testid="calendar-panel" data-date={open} aria-label={`${md(open)} 的場次`}>
          <h2>
            {md(open)}（{HEAD[new Date(`${open}T00:00:00Z`).getUTCDay()]}）・{panel.length} 部
          </h2>
          {panel.length === 0 && <p className="empty">這天沒有排入場次</p>}
          <ol className="cal-list">
            {panel.map((e) => (
              <li key={e.id} data-testid="calendar-panel-entry" className={`t-${e.tier}`}>
                <div className="tm mono">
                  <b>{formatTime(e.startMin)}</b>
                  <span>{formatTime(e.endMin)}</span>
                </div>
                <div className="info">
                  <div className="row">
                    {e.no && (
                      <span className="catno mono" data-testid="catalog-no">
                        {e.no}
                      </span>
                    )}
                    <b className="nm">{e.title}</b>
                    <span className={`tag ${e.tier === "must" ? "tag-must" : e.tier === "want" ? "tag-want" : "tag-free"}`}>{TIER_LABEL[e.tier]}</span>
                    {e.whoLabel && (
                      <span className={e.who === "together" ? "tag tag-together" : "tag"} data-testid="calendar-participant">
                        {e.whoLabel}
                      </span>
                    )}
                  </div>
                  <div className="hint">{e.venue}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
