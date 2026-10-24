import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, Session, Tier, TicketListItem, UserState } from "../domain/types";
import { buildTicketList, clearMark, markSession } from "../domain/tickets";
import { CatalogGate } from "./CatalogGate";
import { TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime, isGuest } from "./format";
import { ensureSchedule, runSchedule, updateUser, useStore } from "./store";

type RowState = "pending" | "got" | "dead";

export function TicketsPage() {
  return <CatalogGate>{(catalog) => <TicketsContent catalog={catalog} />}</CatalogGate>;
}

/** 觸控裝置用上下箭頭，其餘用拖曳把手 */
const IS_TOUCH = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

function TicketsContent({ catalog }: { catalog: Catalog }) {
  const { user, schedule, scheduling } = useStore();
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number>(0);
  const dragFilm = useRef<string | null>(null);
  useEffect(ensureSchedule, [schedule, scheduling]);

  const sessionById = useMemo(() => new Map(catalog.sessions.map((s) => [s.session_id, s])), [catalog]);
  const filmById = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f])), [catalog]);
  const items = useMemo(
    () => (schedule ? buildTicketList(catalog, user, schedule.itinerary) : []),
    [catalog, user, schedule],
  );

  if (!schedule) {
    return (
      <div className="banner" role="status">
        排程中…
      </div>
    );
  }

  const tierOf = new Map<string, Tier>(user.film_preferences.map((p) => [p.film_id, p.tier]));
  const hotOf = new Map(user.film_preferences.map((p) => [p.film_id, p.is_hot]));
  const gotSessionOf = (filmId: string): string | undefined =>
    user.ticket_marks.find((m) => m.result === "got" && sessionById.get(m.session_id)?.film_id === filmId)?.session_id;
  const stateOf = (it: TicketListItem): RowState => (gotSessionOf(it.film_id) ? "got" : it.exhausted ? "dead" : "pending");

  const apply = (change: (s: UserState) => UserState, film: string | null = null) => {
    updateUser(change);
    if (film) {
      setFlash(film);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1200);
    }
  };

  const onGot = (it: TicketListItem) => apply((s) => markSession(s, it.current_session_id, "got"));
  const onMiss = (it: TicketListItem) => apply((s) => markSession(s, it.current_session_id, "missed"), it.film_id);
  const onUndo = (it: TicketListItem) => {
    const got = gotSessionOf(it.film_id);
    if (got) return apply((s) => clearMark(s, got));
    // 已無可用場次：撤銷該片最近一次「沒搶到」
    apply((s) => {
      const missed = s.ticket_marks.filter((m) => m.result === "missed" && sessionById.get(m.session_id)?.film_id === it.film_id);
      const last = missed[missed.length - 1];
      return last ? clearMark(s, last.session_id) : s;
    });
  };
  // 手動順序存成完整的片單順序（含已搶到的片）：把該片移到指定名次，其餘維持目前順序
  const moveTo = (filmId: string, targetOrder: number) =>
    apply((s) => {
      const order = items.map((it) => it.film_id).filter((id) => id !== filmId);
      order.splice(Math.max(0, targetOrder - 1), 0, filmId);
      return { ...s, manual_order: order };
    });

  const pending = items.filter((it) => stateOf(it) !== "got");
  const done = items.filter((it) => stateOf(it) === "got");
  const gotCount = done.length;
  const deadCount = items.filter((it) => stateOf(it) === "dead").length;
  const allHandled = items.length > 0 && gotCount + deadCount === items.length;

  const renderRow = (it: TicketListItem, idx: number, list: TicketListItem[]) => {
    const state = stateOf(it);
    const film = filmById.get(it.film_id);
    const current = sessionById.get(it.current_session_id);
    const backups = it.backup_session_ids.map((id) => sessionById.get(id)).filter((s): s is Session => !!s);
    const tier = tierOf.get(it.film_id);
    const prev = list[idx - 1];
    const next = list[idx + 1];
    return (
      <article
        key={it.film_id}
        className={`card t ${state === "got" ? "got" : state === "dead" ? "dead" : "pend"}${flash === it.film_id ? " flash" : ""}`}
        data-testid="ticket-row"
        data-film={film?.title ?? ""}
        data-state={state}
        onDragOver={state === "pending" ? (e) => e.preventDefault() : undefined}
        onDrop={
          state === "pending"
            ? (e) => {
                e.preventDefault();
                if (dragFilm.current && dragFilm.current !== it.film_id) moveTo(dragFilm.current, it.order);
                dragFilm.current = null;
              }
            : undefined
        }
      >
        <div className="thead">
          <span className="ord mono" data-testid="ticket-order">
            {it.order}
          </span>
          <div className="tinfo">
            <h2>{film?.title}</h2>
            {tier && <span className={`tag ${TIER_TAG_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>}
            {hotOf.get(it.film_id) && <span className="tag tag-star">熱門</span>}
          </div>
          {state === "pending" && (
            <div className="tmove">
              {IS_TOUCH ? (
                <>
                  <button className="mv" aria-label="上移" disabled={!prev} onClick={() => prev && moveTo(it.film_id, prev.order)}>
                    ↑
                  </button>
                  <button className="mv" aria-label="下移" disabled={!next} onClick={() => next && moveTo(it.film_id, next.order)}>
                    ↓
                  </button>
                </>
              ) : (
                <span
                  className="mv handle"
                  data-testid="ticket-drag-handle"
                  role="img"
                  aria-label="拖曳調整順序"
                  draggable
                  onDragStart={(e) => {
                    dragFilm.current = it.film_id;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", it.film_id);
                  }}
                >
                  ⋮⋮
                </span>
              )}
            </div>
          )}
        </div>

        {state === "dead" ? (
          <>
            <p className="deadmsg">已無可用場次</p>
            <button className="btn" onClick={() => onUndo(it)}>
              撤銷
            </button>
          </>
        ) : (
          current && (
            <p className="cur" data-testid="ticket-session">
              {state === "got" && <span className="tag tag-ok">已搶到</span>}{" "}
              <span className="mono">{dateLabel(current.date)}</span> <b className="mono">{formatTime(current.start_min)}</b>{" "}
              <span className="venue">{current.venue_name}</span>
              {isGuest(current) && <span className="tag tag-star">★ 影人出席</span>}
            </p>
          )
        )}

        {state === "got" && (
          <button className="btn" onClick={() => onUndo(it)}>
            撤銷
          </button>
        )}
        {state === "pending" && (
          <>
            <div className="acts">
              <button className="btn btn-ok" onClick={() => onGot(it)}>
                搶到
              </button>
              <button className="btn btn-miss" onClick={() => onMiss(it)}>
                沒搶到
              </button>
            </div>
            <details open={backups.length === 0}>
              <summary>全部備案（{backups.length}）</summary>
              <ul className="bk">
                {backups.map((s) => (
                  <li key={s.session_id} data-testid="ticket-backup">
                    <span className="mono">{dateLabel(s.date)}</span> <b className="mono">{formatTime(s.start_min)}</b>{" "}
                    <span className="venue">{s.venue_name}</span>
                    {isGuest(s) && <span className="tag tag-star">★ 影人出席</span>}
                  </li>
                ))}
                {backups.length === 0 && <li>無不衝堂備案</li>}
              </ul>
            </details>
          </>
        )}
      </article>
    );
  };

  return (
    <>
      {(allHandled || user.ticket_marks.length > 0) && (
        <div className="sumbar">
          {allHandled && (
            <b data-testid="tickets-summary">
              搶到 {gotCount} 部、未搶到 {deadCount} 部
            </b>
          )}
          <a className="btn btn-primary btn-block" href="#/itinerary" onClick={() => runSchedule(true)} style={allHandled ? { marginTop: 10 } : undefined}>
            依搶到結果重新排程
          </a>
        </div>
      )}
      {items.length === 0 && <p className="empty">行程裡沒有需要搶票的片，先到選片頁標記並排行程</p>}
      <div data-testid="ticket-pending">{pending.map(renderRow)}</div>
      {done.length > 0 && <h3>已完成</h3>}
      <div data-testid="ticket-done">{done.map(renderRow)}</div>
    </>
  );
}
