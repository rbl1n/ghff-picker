import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, DayAvailability, Film, FilmPreference, Session, SessionPref, Tier, UserState } from "../domain/types";
import { isSessionAvailable } from "../domain/availability";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { appendToTier, moveFilmTo, removeFromTier, tierOrder } from "../domain/order";
import { sessionStartAbs } from "../domain/time";
import { isTheatrical, type TheatricalEntry, type TheatricalMap } from "../domain/theatrical";
import { CatalogGate } from "./CatalogGate";
import { CatNo } from "./CatNo";
import { filmDetailUrl } from "./links";
import { LEGEND, MARK_LABEL, TIERS, TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime } from "./format";
import { runSchedule, setSessionMark, updateUser, useStore } from "./store";

const NO_NOTES: Record<string, string> = {};
const NO_AVAILABILITY: DayAvailability[] = [];
const NO_MARKS: Record<string, SessionPref> = {};
const NO_OVERRIDES: Record<string, boolean> = {};
const NO_IDS: ReadonlySet<string> = new Set();

type Filter = "all" | "marked" | "none" | "skipped" | "theatrical";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "marked", label: "已標記" },
  { key: "none", label: "未標記" },
  { key: "skipped", label: "不看" },
  { key: "theatrical", label: "院線" },
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

/** 院線標記：手動切換寫入 theatrical_overrides；回到預設值時移除該筆，沒有任何筆時整個欄位移除 */
function setTheatrical(filmId: string, on: boolean, defaultOn: boolean): void {
  updateUser((s) => {
    const { theatrical_overrides: prev, ...rest } = s;
    const map = { ...(prev ?? {}) };
    if (on === defaultOn) delete map[filmId];
    else map[filmId] = on;
    return Object.keys(map).length ? { ...rest, theatrical_overrides: map } : rest;
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

const CONTAINER = "container:";
type Lists = Record<Tier, string[]>;

function listsOf(prefs: FilmPreference[]): Lists {
  return { must: tierOrder(prefs, "must").map((p) => p.film_id), want: tierOrder(prefs, "want").map((p) => p.film_id), maybe: tierOrder(prefs, "maybe").map((p) => p.film_id) };
}

/** 優先用指標所在的影片列；指標在空白處時用層容器（空層也能放） */
const baseCollide: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  const rows = hit.filter((c) => !String(c.id).startsWith(CONTAINER));
  if (rows.length) return rows;
  if (hit.length) return hit;
  return closestCorners(args);
};

const A11Y = {
  screenReaderInstructions: { draggable: "按空白鍵拿起，方向鍵移動，再按空白鍵放下，Esc 取消。" },
  announcements: {
    onDragStart: () => "已拿起",
    onDragOver: () => undefined,
    onDragEnd: () => "已放下",
    onDragCancel: () => "已取消",
  },
};

function OrderRow({ id, tier, rank, title, catNo, note, theatrical, overlay }: { id: string; tier: Tier; rank: number; title: string; catNo: string | undefined; note?: string; theatrical?: boolean; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = overlay ? undefined : { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={`oitem${isDragging && !overlay ? " dragging" : ""}${overlay ? " overlay" : ""}`}
      data-testid={overlay ? "tier-order-overlay" : "tier-order-item"}
      data-title={title}
    >
      <button
        ref={overlay ? undefined : setActivatorNodeRef}
        type="button"
        className="mv dh"
        data-testid="tier-drag-handle"
        aria-label={`拖曳排序 ${title}`}
        {...(overlay ? {} : attributes)}
        {...(overlay ? {} : listeners)}
      >
        ⋮⋮
      </button>
      <span className="rk mono">{rank}</span>
      <span className="ttl">
        <CatNo no={catNo} />
        <span data-testid="film-title">{title}</span>
        {theatrical && <span className="tag tag-theatrical" data-testid="order-theatrical">院線</span>}
        {note && <span className="onote" data-testid="order-note">{note}</span>}
      </span>
      {!overlay && (
        <div className="rowtier" role="group" aria-label={`${title} 改層級`}>
          {TIERS.map((t) => (
            <button key={t} type="button" className="rt" data-t={t} aria-pressed={tier === t} aria-label={TIER_LABEL[t]} onClick={() => tier !== t && setTier(id, t)}>
              {t === "maybe" ? "有空" : TIER_LABEL[t]}
            </button>
          ))}
          <button type="button" className="rt skip" aria-pressed={false} aria-label="不看" onClick={() => setSkipped(id, true)}>
            不看
          </button>
        </div>
      )}
    </div>
  );
}

function TierGroup({ tier, ids, filmOf, notes, theatricalIds, dragging }: { tier: Tier; ids: string[]; filmOf: Map<string, Film>; notes: Record<string, string>; theatricalIds: ReadonlySet<string>; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: CONTAINER + tier });
  return (
    <div className="tgroup" data-testid="tier-order-group" data-tier={tier}>
      <h3>
        <span className={`tag ${TIER_TAG_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>
      </h3>
      <div ref={setNodeRef} data-testid={ids.length === 0 ? "tier-drop-zone" : undefined} className={`dropzone${ids.length === 0 ? " empty" : ""}${isOver && dragging ? " over" : ""}`}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id, i) => (
            <OrderRow key={id} id={id} tier={tier} rank={i + 1} title={filmOf.get(id)?.title ?? id} catNo={filmOf.get(id)?.catalog_no} note={notes[id]} theatrical={theatricalIds.has(id)} />
          ))}
        </SortableContext>
        {ids.length === 0 && (
          <p className="hint drophint">拖到這裡</p>
        )}
      </div>
    </div>
  );
}

/** 層內順序檢視：拖曳 ⋮⋮ 把手調整順序，也能放進別層（觸控、滑鼠、鍵盤皆可；兩人模式也只調整自己的） */
function TierOrderView({ catalog, prefs, notes, theatricalIds }: { catalog: Catalog; prefs: FilmPreference[]; notes: Record<string, string>; theatricalIds: ReadonlySet<string> }) {
  const filmOf = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f])), [catalog]);
  const [draft, setDraft] = useState<Lists | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 剛跨層換位後版面會位移，下一個畫面前沿用上次碰撞結果，避免在兩層之間來回彈跳
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const justMoved = useRef(false);
  const collision = useCallback<CollisionDetection>((args) => {
    if (justMoved.current && lastOver.current !== null) return [{ id: lastOver.current }];
    const hit = baseCollide(args);
    if (hit[0]) lastOver.current = hit[0].id;
    return hit;
  }, []);
  useEffect(() => {
    if (!draft) return;
    const raf = requestAnimationFrame(() => {
      justMoved.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [draft]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (prefs.length === 0) return null;
  const lists = draft ?? listsOf(prefs);

  const containerOf = (id: string | number, from: Lists): Tier | undefined => {
    const sid = String(id);
    if (sid.startsWith(CONTAINER)) return sid.slice(CONTAINER.length) as Tier;
    return TIERS.find((t) => from[t].includes(sid));
  };

  const onDragStart = (e: DragStartEvent) => {
    lastOver.current = null;
    justMoved.current = false;
    setActiveId(String(e.active.id));
    setDraft(listsOf(prefs));
  };
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    setDraft((cur) => {
      const base = cur ?? listsOf(prefs);
      const from = containerOf(active.id, base);
      const to = containerOf(over.id, base);
      if (!from || !to || from === to) return cur;
      justMoved.current = true;
      const id = String(active.id);
      const target = base[to];
      const overIdx = target.indexOf(String(over.id));
      const rect = active.rect.current.translated;
      const below = rect && overIdx >= 0 && rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 ? 1 : 0;
      const at = overIdx >= 0 ? overIdx + below : target.length;
      return { ...base, [from]: base[from].filter((x) => x !== id), [to]: [...target.slice(0, at), id, ...target.slice(at)] };
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const base = draft ?? listsOf(prefs);
    setDraft(null);
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const tier = containerOf(id, base);
    if (!tier) return;
    let index = base[tier].indexOf(id);
    const overTier = containerOf(over.id, base);
    if (overTier === tier && !String(over.id).startsWith(CONTAINER) && over.id !== active.id) {
      index = base[tier].indexOf(String(over.id));
    }
    updateUser((s) => ({ ...s, film_preferences: moveFilmTo(s.film_preferences, id, tier, index) }));
  };
  const onDragCancel = () => {
    setDraft(null);
    setActiveId(null);
  };

  return (
    <details className="card tierorder" open>
      <summary>層內順序</summary>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        同層影片排前面的優先排進行程。按住 ⋮⋮ 拖曳調整順序，也能拖到別的層
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        accessibility={A11Y}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {TIERS.map((t) => (
          <TierGroup key={t} tier={t} ids={lists[t]} filmOf={filmOf} notes={notes} theatricalIds={theatricalIds} dragging={activeId !== null} />
        ))}
        <DragOverlay>
          {activeId ? (
            <OrderRow id={activeId} tier={TIERS.find((t) => lists[t].includes(activeId)) ?? "must"} rank={(TIERS.map((t) => lists[t].indexOf(activeId)).find((i) => i >= 0) ?? 0) + 1} title={filmOf.get(activeId)?.title ?? activeId} catNo={filmOf.get(activeId)?.catalog_no} note={notes[activeId]} theatrical={theatricalIds.has(activeId)} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>
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
  const { user, theatrical } = useStore();
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
  const overrides = user.theatrical_overrides ?? NO_OVERRIDES;
  const theatricalIds = useMemo(
    () => (theatrical.size === 0 && Object.keys(overrides).length === 0 ? NO_IDS : new Set(catalog.films.filter((f) => isTheatrical(f.film_id, overrides, theatrical)).map((f) => f.film_id))),
    [catalog, theatrical, overrides],
  );
  const guestIds = useMemo(() => new Set(catalog.sessions.filter((s) => s.marks.includes("guest_attending")).map((s) => s.film_id)), [catalog]);
  const counts = TIERS.map((t) => user.film_preferences.filter((p) => p.tier === t).length);
  const q = query.trim();
  const shown = catalog.films.filter((f) => {
    if (q && !matchesQuery(f, q, notes[f.film_id])) return false;
    const isSkipped = skipped.has(f.film_id);
    if (filter === "skipped") return isSkipped;
    if (isSkipped) return false; // 不看的片只在「不看」篩選列出
    if (filter === "theatrical") return theatricalIds.has(f.film_id);
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
      <TierOrderView catalog={catalog} prefs={user.film_preferences} notes={user.film_notes ?? NO_NOTES} theatricalIds={theatricalIds} />
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
          marks={user.session_marks ?? NO_MARKS}
          theatricalOn={theatricalIds.has(f.film_id)}
          theatricalInfo={theatrical.get(f.film_id)}
          hasGuest={guestIds.has(f.film_id)}
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
  marks: Record<string, SessionPref>;
  theatricalOn: boolean;
  theatricalInfo: TheatricalEntry | undefined;
  hasGuest: boolean;
}) {
  const { film, sessions, pref, skipped, note, availability, marks, theatricalOn, theatricalInfo, hasGuest } = props;
  const hint = markHint(sessions, marks);
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
      {hint && (
        <p className="prefhint" data-testid="session-pref-hint">
          {hint}
        </p>
      )}
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
      <TheatricalRow filmId={film.film_id} on={theatricalOn} info={theatricalInfo} hasGuest={hasGuest} />
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
            <SessionRow key={s.session_id} session={s} runtime={film.runtime_min} watchable={isSessionAvailable(s, availability)} mark={marks[s.session_id]} />
          ))}
        </ul>
      </details>
    </article>
  );
});

/** 院線：切換鈕（開 = 實心）、有影人場提醒、片商／上映日提示；只影響顯示，不影響排程 */
function TheatricalRow({ filmId, on, info, hasGuest }: { filmId: string; on: boolean; info: TheatricalEntry | undefined; hasGuest: boolean }) {
  const defaultOn = info?.status === "upcoming";
  let hint = "";
  if (info?.status === "upcoming") hint = `院線 ${info.release_date ?? info.release_note ?? "即將上映"}`;
  else if (info?.status === "released") hint = `已於 ${info.release_date ?? "先前"} 在台上映`;
  else if (!on && info?.status === "likely" && info.distributor) hint = `台灣片商：${info.distributor}`;
  else if (info?.status === "not_theatrical") hint = info.release_note ? `非院線（${info.release_note}）` : "非院線";
  return (
    <div className="theatrow">
      <button type="button" className="theatchip" data-testid="theatrical-toggle" aria-pressed={on} onClick={() => setTheatrical(filmId, !on, defaultOn)}>
        院線
      </button>
      {hasGuest && (
        <span className="guestnote" data-testid="guest-note">
          有影人場
        </span>
      )}
      {hint && (
        <span className="hint theathint" data-testid="theatrical-hint">
          {hint}
          {info?.source && /^https?:/.test(info.source) && (
            <>
              {" "}
              <a className="offlink" data-testid="theatrical-source" href={info.source} target="_blank" rel="noopener noreferrer">
                來源
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}

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

/** 收合時的短提示：優先 11/15、11/20・只看 11/20 10:50 */
function markHint(sessions: Session[], marks: Record<string, SessionPref>): string {
  const md = (s: Session) => s.date.slice(5).replace("-", "/");
  const prefer = sessions.filter((s) => marks[s.session_id] === "prefer").map(md);
  const only = sessions.filter((s) => marks[s.session_id] === "only").map((s) => `${md(s)} ${formatTime(s.start_min)}`);
  return [prefer.length ? `優先 ${prefer.join("、")}` : "", only.length ? `只看 ${only.join("、")}` : ""].filter(Boolean).join("・");
}

const PREF_OPTIONS: { value: SessionPref | null; label: string }[] = [
  { value: null, label: "一般" },
  { value: "prefer", label: "優先" },
  { value: "only", label: "只看這場" },
];

/** 三態控制（005，FR-501）：一般｜優先｜只看這場 */
function SessionPrefControl({ session, mark }: { session: Session; mark: SessionPref | undefined }) {
  return (
    <div className="seg prefseg" role="radiogroup" aria-label={`${dateLabel(session.date)} ${formatTime(session.start_min)} 場次偏好`} data-testid="session-pref">
      {PREF_OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={(mark ?? null) === o.value}
          className="segbtn"
          onClick={() => setSessionMark(session.session_id, o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SessionRow({ session, runtime, watchable, mark }: { session: Session; runtime: number; watchable: boolean; mark: SessionPref | undefined }) {
  return (
    <li className={watchable ? "sess" : "sess dim"} data-testid="session-row" data-date={session.date} data-time={formatTime(session.start_min)}>
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
      <SessionPrefControl session={session} mark={mark} />
    </li>
  );
}
