import { memo, useMemo, useState } from "react";
import type { Catalog, DayAvailability, Film, FilmPreference, Session, Tier } from "../domain/types";
import { isSessionAvailable } from "../domain/availability";
import { appendToTier, moveWithinTier, removeFromTier, tierOrder } from "../domain/order";
import { sessionStartAbs } from "../domain/time";
import { CatalogGate } from "./CatalogGate";
import { LEGEND, MARK_LABEL, TIERS, TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime } from "./format";
import { runSchedule, updateUser, useStore } from "./store";

const NO_AVAILABILITY: DayAvailability[] = [];

type Filter = "all" | "marked" | "none";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "marked", label: "已標記" },
  { key: "none", label: "未標記" },
];

export function PickPage() {
  return <CatalogGate>{(catalog) => <PickContent catalog={catalog} />}</CatalogGate>;
}

/** 新標記或改層的影片排在目標層最後，原層與取消標記後名次遞補（domain/order） */
function setTier(filmId: string, tier: Tier | null): void {
  updateUser((s) => ({
    ...s,
    film_preferences: tier === null ? removeFromTier(s.film_preferences, filmId) : appendToTier(s.film_preferences, filmId, tier),
  }));
}

/** 熱門屬於已分層的片；未標記的片被標熱門時以「想看」排在該層最後建立紀錄 */
function setHot(filmId: string, hot: boolean): void {
  updateUser((s) => {
    const prev = s.film_preferences.find((p) => p.film_id === filmId);
    if (!prev && !hot) return s;
    const base = prev ? s.film_preferences : appendToTier(s.film_preferences, filmId, "want");
    return { ...s, film_preferences: base.map((p) => (p.film_id === filmId ? { ...p, is_hot: hot } : p)) };
  });
}

function moveInTier(filmId: string, direction: -1 | 1): void {
  updateUser((s) => ({ ...s, film_preferences: moveWithinTier(s.film_preferences, filmId, direction) }));
}

/** 層內順序檢視：依三層列出已標記影片，上移／下移調整自己的順序（兩人模式也只調整自己的） */
function TierOrderView({ catalog, prefs }: { catalog: Catalog; prefs: FilmPreference[] }) {
  const titleOf = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f.title])), [catalog]);
  if (prefs.length === 0) return null;
  return (
    <details className="card tierorder" open>
      <summary>層內順序</summary>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        同層影片排前面的優先排進行程
      </p>
      {TIERS.map((t) => {
        const list = tierOrder(prefs, t);
        return (
          <div key={t} className="tgroup" data-testid="tier-order-group" data-tier={t}>
            <h3>
              <span className={`tag ${TIER_TAG_CLASS[t]}`}>{TIER_LABEL[t]}</span>
            </h3>
            {list.length === 0 && <p className="hint">這一層還沒有影片</p>}
            {list.map((p, i) => (
              <div key={p.film_id} className="oitem" data-testid="tier-order-item" data-title={titleOf.get(p.film_id) ?? p.film_id}>
                <span className="rk mono">{i + 1}</span>
                <span className="ttl">{titleOf.get(p.film_id) ?? p.film_id}</span>
                <button className="mv" aria-label="上移" disabled={i === 0} onClick={() => moveInTier(p.film_id, -1)}>
                  ↑
                </button>
                <button className="mv" aria-label="下移" disabled={i === list.length - 1} onClick={() => moveInTier(p.film_id, 1)}>
                  ↓
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </details>
  );
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
      <TierOrderView catalog={catalog} prefs={user.film_preferences} />
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
          availability={user.availability ?? NO_AVAILABILITY}
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
  availability: DayAvailability[];
}) {
  const { film, sessions, pref, availability } = props;
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
            <SessionRow key={s.session_id} session={s} runtime={film.runtime_min} watchable={isSessionAvailable(s, availability)} />
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
