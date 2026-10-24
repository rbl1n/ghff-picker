import { memo, useMemo, useState } from "react";
import type { Catalog, DayAvailability, Film, FilmPreference, Session, Tier, UserState } from "../domain/types";
import { isSessionAvailable } from "../domain/availability";
import { appendToTier, moveWithinTier, removeFromTier, tierOrder } from "../domain/order";
import { sessionStartAbs } from "../domain/time";
import { CatalogGate } from "./CatalogGate";
import { CatNo } from "./CatNo";
import { filmDetailUrl } from "./links";
import { LEGEND, MARK_LABEL, TIERS, TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime } from "./format";
import { runSchedule, updateUser, useStore } from "./store";

const NO_NOTES: Record<string, string> = {};
const NO_AVAILABILITY: DayAvailability[] = [];

type Filter = "all" | "marked" | "none" | "skipped";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "marked", label: "已標記" },
  { key: "none", label: "未標記" },
  { key: "skipped", label: "不看" },
];

export function PickPage() {
  return <CatalogGate>{(catalog) => <PickContent catalog={catalog} />}</CatalogGate>;
}

/** 去掉某部片的不看；沒有不看紀錄時回傳原物件，避免多寫一個空欄位 */
function without(skipped: string[] | undefined, filmId: string): string[] | undefined {
  return skipped?.includes(filmId) ? skipped.filter((id) => id !== filmId) : skipped;
}

/** 新標記或改層的影片排在目標層最後，原層與取消標記後名次遞補（domain/order）；標任一層級會清除該片的不看 */
function setTier(filmId: string, tier: Tier | null): void {
  updateUser((s) => {
    const next: UserState = {
      ...s,
      film_preferences: tier === null ? removeFromTier(s.film_preferences, filmId) : appendToTier(s.film_preferences, filmId, tier),
    };
    const skipped = tier === null ? s.skipped_film_ids : without(s.skipped_film_ids, filmId);
    if (skipped !== s.skipped_film_ids) next.skipped_film_ids = skipped;
    return next;
  });
}

/** 不看與三個層級互斥：標為不看會移除層級紀錄（原層名次遞補）；再按一次取消不看 */
function setSkipped(filmId: string, skip: boolean): void {
  updateUser((s) => {
    if (!skip) return { ...s, skipped_film_ids: without(s.skipped_film_ids, filmId) ?? [] };
    const ids = s.skipped_film_ids ?? [];
    return {
      ...s,
      film_preferences: removeFromTier(s.film_preferences, filmId),
      skipped_film_ids: ids.includes(filmId) ? ids : [...ids, filmId],
    };
  });
}

/** 寫入或清除某部片的備註（空白 = 刪除；沒有任何備註時整個欄位移除） */
function setNote(filmId: string, text: string): void {
  updateUser((s) => {
    const { film_notes: prev, ...rest } = s;
    const notes = { ...(prev ?? {}) };
    const value = text.trim();
    if (value) notes[filmId] = value;
    else delete notes[filmId];
    return Object.keys(notes).length ? { ...rest, film_notes: notes } : rest;
  });
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
  const filmOf = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f])), [catalog]);
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
              <div key={p.film_id} className="oitem" data-testid="tier-order-item" data-title={filmOf.get(p.film_id)?.title ?? p.film_id}>
                <span className="rk mono">{i + 1}</span>
                <span className="ttl">
                  <CatNo no={filmOf.get(p.film_id)?.catalog_no} />
                  <span data-testid="film-title">{filmOf.get(p.film_id)?.title ?? p.film_id}</span>
                </span>
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

/** 搜尋：片名、片號、備註，短片單元另含每部短片的片名與頁碼（包含即符合） */
function matchesQuery(f: Film, q: string, note: string | undefined): boolean {
  return (
    f.title.includes(q) ||
    (f.catalog_no ?? "").includes(q) ||
    (note ?? "").includes(q) ||
    (f.shorts ?? []).some((s) => s.title.includes(q) || (s.catalog_no ?? "").includes(q))
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
  const notes = user.film_notes ?? NO_NOTES;
  const skipped = useMemo(() => new Set(user.skipped_film_ids ?? []), [user.skipped_film_ids]);
  const counts = TIERS.map((t) => user.film_preferences.filter((p) => p.tier === t).length);
  const q = query.trim();
  const shown = catalog.films.filter((f) => {
    if (q && !matchesQuery(f, q, notes[f.film_id])) return false;
    const isSkipped = skipped.has(f.film_id);
    if (filter === "skipped") return isSkipped;
    if (isSkipped) return false; // 不看的片只在「不看」篩選列出
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
        <div>
          <b>{catalog.films.filter((f) => skipped.has(f.film_id)).length}</b>
          不看
        </div>
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
        placeholder="搜尋片名、片號或備註"
        aria-label="搜尋片名、片號或備註"
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
          skipped={skipped.has(f.film_id)}
          note={notes[f.film_id]}
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
  skipped: boolean;
  note: string | undefined;
  availability: DayAvailability[];
}) {
  const { film, sessions, pref, skipped, note, availability } = props;
  return (
    <article className="card film" data-testid="film-card" data-title={film.title} data-tier={pref?.tier ?? ""} data-skipped={skipped ? "true" : undefined}>
      <div className="row">
        <CatNo no={film.catalog_no} />
        <h2>{film.title}</h2>
        <span className="tag">{film.rating}</span>
        {pref?.is_hot && (
          <span className="tag tag-star" data-testid="hot-badge">
            熱門
          </span>
        )}
        <span className="sp" />
        {filmDetailUrl(film.film_id) && (
          <a className="offlink" data-testid="film-official-link" href={filmDetailUrl(film.film_id)} target="_blank" rel="noopener noreferrer">
            官網介紹
          </a>
        )}
        <span className="hint">{sessions.length} 場</span>
      </div>
      {film.shorts && film.shorts.length > 0 && (
        <p className="shorts hint" data-testid="film-shorts">
          {film.shorts.map((s, i) => (
            <span key={`${i}-${s.title}`}>
              {i > 0 && "・"}
              {s.catalog_no && <span className="mono">{s.catalog_no} </span>}
              {s.title}
            </span>
          ))}
        </p>
      )}
      <NoteBlock filmId={film.film_id} note={note} />
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
        <button className="tier skip" aria-pressed={skipped} onClick={() => setSkipped(film.film_id, !skipped)}>
          不看
        </button>
      </div>
      {!skipped && (
        <label className="hotrow">
          <input type="checkbox" checked={pref?.is_hot ?? false} onChange={(e) => setHot(film.film_id, e.target.checked)} />
          熱門（搶票優先）
        </label>
      )}
      <details>
        <summary>展開全部場次</summary>
        <ul className="sessions">
          {sessions.map((s) => (
            <SessionRow key={s.session_id} session={s} runtime={film.runtime_min} watchable={isSessionAvailable(s, availability)} />
          ))}
        </ul>
      </details>
    </article>
  );
});

/** 備註：片名下方的灰色小字（預設兩行，點擊展開）；「備註」按鈕開啟輸入框，按確定或離開輸入框儲存，清空即刪除 */
function NoteBlock({ filmId, note }: { filmId: string; note: string | undefined }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const save = () => {
    setNote(filmId, draft);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="noteedit">
        <textarea
          className="input"
          aria-label="備註內容"
          rows={3}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
        />
        <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={save}>
          確定
        </button>
      </div>
    );
  }
  return (
    <div className="noterow">
      {note && (
        <button className="note" data-testid="film-note" aria-expanded={open} data-expanded={open} onClick={() => setOpen(!open)}>
          {note}
        </button>
      )}
      <button
        className="noteadd"
        onClick={() => {
          setDraft(note ?? "");
          setEditing(true);
        }}
      >
        {note ? "編輯備註" : "備註"}
      </button>
    </div>
  );
}

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
