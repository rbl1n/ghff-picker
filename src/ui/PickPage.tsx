import { memo, useMemo, useState } from "react";
import type { Catalog, Film, FilmPreference, Session, Tier, UnavailableSlot } from "../domain/types";
import { isSessionWatchable } from "../domain/availability";
import { sessionStartAbs } from "../domain/time";
import { CatalogGate } from "./CatalogGate";
import { LEGEND, MARK_LABEL, TIERS, TIER_LABEL, dateLabel, formatTime } from "./format";
import { runSchedule, updateUser, useStore } from "./store";

type Filter = "all" | "marked" | "none";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "marked", label: "已標記" },
  { key: "none", label: "未標記" },
];

export function PickPage() {
  return <CatalogGate>{(catalog) => <PickContent catalog={catalog} />}</CatalogGate>;
}

function setTier(filmId: string, tier: Tier | null): void {
  updateUser((s) => {
    const prev = s.film_preferences.find((p) => p.film_id === filmId);
    const rest = s.film_preferences.filter((p) => p.film_id !== filmId);
    if (tier === null) return { ...s, film_preferences: rest };
    return { ...s, film_preferences: [...rest, { film_id: filmId, tier, is_hot: prev?.is_hot ?? false }] };
  });
}

/** 熱門屬於已分層的片；未標記的片被標熱門時以「想看」建立紀錄 */
function setHot(filmId: string, hot: boolean): void {
  updateUser((s) => {
    const prev = s.film_preferences.find((p) => p.film_id === filmId);
    const rest = s.film_preferences.filter((p) => p.film_id !== filmId);
    if (!prev && !hot) return s;
    return { ...s, film_preferences: [...rest, { film_id: filmId, tier: prev?.tier ?? "want", is_hot: hot }] };
  });
}

function PickContent({ catalog }: { catalog: Catalog }) {
  const { user } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const sessionsByFilm = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of catalog.sessions) {
      const arr = map.get(s.film_id);
      if (arr) arr.push(s);
      else map.set(s.film_id, [s]);
    }
    for (const arr of map.values()) arr.sort((a, b) => sessionStartAbs(a) - sessionStartAbs(b) || (a.session_id < b.session_id ? -1 : 1));
    return map;
  }, [catalog]);

  const prefOf = useMemo(() => new Map(user.film_preferences.map((p) => [p.film_id, p])), [user.film_preferences]);
  const counts = TIERS.map((t) => user.film_preferences.filter((p) => p.tier === t).length);
  const q = query.trim();
  const shown = catalog.films.filter((f) => {
    if (q && !f.title.includes(q)) return false;
    const marked = prefOf.has(f.film_id);
    return filter === "all" || (filter === "marked" ? marked : !marked);
  });

  return (
    <>
      <div className="counts" data-testid="tier-counts" aria-label="標記統計">
        {TIERS.map((t, i) => (
          <div key={t}>
            <b>{counts[i]}</b>
            {TIER_LABEL[t]}
          </div>
        ))}
      </div>
      <details className="legend">
        <summary>標記說明</summary>
        <ul data-testid="mark-legend">
          {LEGEND.map((l) => (
            <li key={l.symbol}>
              {l.symbol} {l.meaning}
            </li>
          ))}
        </ul>
      </details>
      <input
        className="input"
        type="search"
        placeholder="搜尋片名"
        aria-label="搜尋片名"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {shown.map((f) => (
        <FilmCard
          key={f.film_id}
          film={f}
          sessions={sessionsByFilm.get(f.film_id) ?? []}
          pref={prefOf.get(f.film_id)}
          slots={user.unavailable_slots}
        />
      ))}
      {shown.length === 0 && <p className="empty">沒有符合的影片</p>}
      <a className="btn btn-primary btn-block cta" href="#/itinerary" onClick={() => runSchedule()}>
        排行程
      </a>
    </>
  );
}

const FilmCard = memo(function FilmCard(props: {
  film: Film;
  sessions: Session[];
  pref: FilmPreference | undefined;
  slots: UnavailableSlot[];
}) {
  const { film, sessions, pref, slots } = props;
  return (
    <article className="card film" data-testid="film-card" data-title={film.title} data-tier={pref?.tier ?? ""}>
      <div className="row">
        <h2>{film.title}</h2>
        <span className="tag">{film.rating}</span>
        {pref?.is_hot && (
          <span className="tag tag-star" data-testid="hot-badge">
            熱門
          </span>
        )}
        <span className="sp" />
        <span className="hint">{sessions.length} 場</span>
      </div>
      <div className="tiers" role="group" aria-label={`${film.title} 的層級`}>
        {TIERS.map((t) => (
          <button
            key={t}
            className="tier"
            data-t={t}
            aria-pressed={pref?.tier === t}
            onClick={() => setTier(film.film_id, pref?.tier === t ? null : t)}
          >
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>
      <details>
        <summary>展開全部場次</summary>
        <ul className="sessions">
          {sessions.map((s) => (
            <SessionRow key={s.session_id} session={s} runtime={film.runtime_min} watchable={isSessionWatchable(s, slots)} />
          ))}
        </ul>
        <label className="hotrow">
          <input type="checkbox" checked={pref?.is_hot ?? false} onChange={(e) => setHot(film.film_id, e.target.checked)} />
          標為熱門（搶票時優先）
        </label>
      </details>
    </article>
  );
});

function SessionRow({ session, runtime, watchable }: { session: Session; runtime: number; watchable: boolean }) {
  return (
    <li className={watchable ? "sess" : "sess dim"} data-testid="session-row">
      <span className="mono d">{dateLabel(session.date)}</span>
      <b className="mono">{formatTime(session.start_min)}</b>
      <span className="hint">{runtime} 分鐘</span>
      <span className="v">{session.venue_name}</span>
      <span className="row">
        {!watchable && <span className="tag tag-no">不可看</span>}
        {session.marks.map((m) => (
          <span key={m} className={m === "guest_attending" ? "tag tag-star" : m === "non_ticketed" ? "tag tag-nosale" : "tag"}>
            {MARK_LABEL[m]}
          </span>
        ))}
      </span>
    </li>
  );
}
