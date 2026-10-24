import { useEffect, useMemo } from "react";
import type { Catalog, ItineraryEntry, Session, UnscheduledMustFilm } from "../domain/types";
import { CatalogGate } from "./CatalogGate";
import { TIERS, TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime, isGuest } from "./format";
import { ensureSchedule, runSchedule, scheduleSignature, useStore } from "./store";

const REASON_TEXT = {
  no_available_session: () => "沒有可看場次",
  daily_limit: () => "受每日上限限制",
  conflicts_with_must: (titles: string[]) => `與${titles.map((t) => `「${t}」`).join("、")}衝堂`,
} as const;

export function ItineraryPage() {
  return <CatalogGate>{(catalog) => <ItineraryContent catalog={catalog} />}</CatalogGate>;
}

function reasonOf(u: UnscheduledMustFilm, titleOf: (id: string) => string): string {
  if (u.reason === "conflicts_with_must") return REASON_TEXT.conflicts_with_must((u.conflict_film_ids ?? []).map(titleOf));
  return REASON_TEXT[u.reason]();
}

function ItineraryContent({ catalog }: { catalog: Catalog }) {
  const { user, schedule, scheduling } = useStore();
  useEffect(ensureSchedule, [schedule, scheduling]);

  const sessionById = useMemo(() => new Map(catalog.sessions.map((s) => [s.session_id, s])), [catalog]);
  const filmById = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f])), [catalog]);

  if (user.film_preferences.length === 0 && !scheduling) {
    return (
      <>
        <p className="empty" data-testid="itinerary-empty">
          先到選片頁標記想看的片
        </p>
        <a className="btn btn-primary btn-block" href="#/pick">
          去選片
        </a>
      </>
    );
  }
  if (scheduling || !schedule) {
    return (
      <div className="banner" role="status">
        排程中…
        <div className="prog">
          <i />
        </div>
      </div>
    );
  }

  const stale = schedule.sig !== scheduleSignature(user);
  const titleOf = (id: string) => filmById.get(id)?.title ?? "";
  const days = new Map<string, { entry: ItineraryEntry; session: Session }[]>();
  for (const entry of schedule.itinerary) {
    const session = sessionById.get(entry.session_id);
    if (!session) continue;
    days.set(session.date, [...(days.get(session.date) ?? []), { entry, session }]);
  }

  return (
    <>
      {stale && (
        <div className="banner">
          <div className="row">
            <span className="sp">條件已變更，重新排程</span>
            <button className="btn btn-primary" onClick={() => runSchedule(true)}>
              重新排程
            </button>
          </div>
        </div>
      )}
      <div className="sum">
        {TIERS.map((t) => {
          const total = user.film_preferences.filter((p) => p.tier === t).length;
          const done = schedule.itinerary.filter((e) => e.tier === t).length;
          return (
            <div key={t} data-testid={`itinerary-summary-${t}`}>
              <b className="mono">
                {done}/{total}
              </b>
              排入{TIER_LABEL[t]}
            </div>
          );
        })}
      </div>
      {schedule.unscheduled.length > 0 && (
        <section className="banner banner-error" data-testid="unscheduled-box" aria-label="未排入的必看片">
          <h2>有 {schedule.unscheduled.length} 部必看排不進去</h2>
          <ul>
            {schedule.unscheduled.map((u) => (
              <li key={u.film_id}>
                <b>{titleOf(u.film_id)}</b>：{reasonOf(u, titleOf)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {[...days.entries()].map(([date, items]) => (
        <section className="daygroup" key={date}>
          <h2>{dateLabel(date)}</h2>
          <ol className="tl">
            {items.map(({ entry, session }) => (
              <li
                key={session.session_id}
                className={entry.is_non_ticketed ? "it nosale" : "it"}
                data-testid="itinerary-entry"
                data-date={date}
                data-tier={entry.tier}
              >
                <div className="tm mono">
                  <b>{formatTime(session.start_min)}</b>
                  <span>{formatTime(session.end_min)}</span>
                </div>
                <div className="info">
                  <div className="row">
                    <b className="nm">{titleOf(session.film_id)}</b>
                    <span className={`tag ${TIER_TAG_CLASS[entry.tier]}`}>{TIER_LABEL[entry.tier]}</span>
                    {isGuest(session) && <span className="tag tag-star">★</span>}
                    {entry.is_non_ticketed && <span className="tag tag-nosale">非售票</span>}
                  </div>
                  <div className="hint">{session.venue_name}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {schedule.itinerary.length === 0 && <p className="empty">目前沒有可排入的場次</p>}
      <a className="btn btn-primary btn-block" href="#/tickets" style={{ marginTop: 16 }}>
        看搶票清單
      </a>
    </>
  );
}
