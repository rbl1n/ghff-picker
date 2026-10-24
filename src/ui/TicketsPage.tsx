import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, PersonSide, Session, Tier, TicketListItem, UserState } from "../domain/types";
import { buildTicketList, clearMark, markSession } from "../domain/tickets";
import { buildDuoDivision, type DuoTicketRow } from "../domain/division";
import { CatalogGate } from "./CatalogGate";
import { decidingKey, type OrderKeyName } from "../domain/order-keys";
import { CatNo } from "./CatNo";
import { TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime, isGuest } from "./format";
import { FastMode } from "./FastMode";
import { copyText } from "./clipboard";
import { buildExportTable, downloadCsv, toCsv, toTsv } from "./ticketExport";
import { ensureSchedule, runSchedule, updateUser, useStore } from "./store";

type RowState = "pending" | "got" | "dead";

const ORDER_RULES: [string, string][] = [
  ["層級", "必看先於想看、想看先於有空再看，最重要的片最先搶。"],
  ["熱門", "熱門＝容易秒殺，同層級先搶。"],
  ["你的層內順序", "同層、同熱門時，照你在選片頁排的順序，越前面越先。"],
  ["場次少", "剩下可看的場次越少、沒有備案，越要先搶。"],
  ["有影人場", "排定場次有 ★ 影人出席，通常較快賣完，先搶。"],
  ["專刊順序", "以上都一樣時，依專刊（場次表）上的順序。"],
];

const KEY_LABEL: Record<OrderKeyName, string> = {
  tier: "層級",
  hot: "熱門",
  rank: "層內順序",
  remaining: "場次少",
  star: "有影人場",
  film_index: "專刊順序",
};

function whyFacts(it: TicketListItem): string | null {
  const k = it.order_keys;
  if (!k) return null;
  return [
    TIER_LABEL[k.tier],
    k.hot ? "熱門" : "非熱門",
    k.rank !== null && k.rank < Number.MAX_SAFE_INTEGER ? `層內第 ${k.rank}` : "層內未排",
    `剩 ${k.remaining} 場`,
    k.star ? "有影人場" : "無影人場",
  ].join("・");
}

function whyCompare(it: TicketListItem, next: TicketListItem | undefined): string | null {
  const a = it.order_keys;
  const b = next?.order_keys;
  if (!a || !b) return null;
  const key = decidingKey(a, b);
  if (key === null) return "與下一筆比：條件全同";
  if (key === "manual") return "與下一筆比：你手動調整了順序";
  const show = (x: typeof a) =>
    key === "tier" ? TIER_LABEL[x.tier] : key === "hot" ? (x.hot ? "熱門" : "非熱門") : key === "rank" ? String(x.rank ?? "未排") : key === "remaining" ? `${x.remaining} 場` : key === "star" ? (x.star ? "有影人場" : "無影人場") : `第 ${x.film_index + 1} 部`;
  const op = key === "tier" || key === "hot" || key === "star" ? "先於" : "<";
  return `與下一筆比：${KEY_LABEL[key]} ${show(a)} ${op} ${show(b)}`;
}

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
  const [fast, setFast] = useState<{ toast: string | null; manual: string | null } | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportManual, setExportManual] = useState<string | null>(null);

  const sessionById = useMemo(() => new Map(catalog.sessions.map((s) => [s.session_id, s])), [catalog]);
  const filmById = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f])), [catalog]);
  // 兩人模式（004）：兩人共用同一套順序，一起看的片只分給一人；分頁看「我的順序」或「{同伴}的順序」
  const [tab, setTab] = useState<PersonSide>("self");
  const division = useMemo(
    () => (schedule?.duo && user.partner ? buildDuoDivision(catalog, user, schedule.duo, user.partner) : null),
    [catalog, user, schedule],
  );
  const personalItems = useMemo(() => (schedule && !division ? buildTicketList(catalog, user, schedule.itinerary) : []), [catalog, user, schedule, division]);
  const items: (TicketListItem | DuoTicketRow)[] = division ? division[tab] : personalItems;
  const selfName = user.self_name || "我";
  const partnerName = user.partner?.display_name ?? "同伴";

  if (!schedule) {
    return (
      <div className="banner" role="status">
        排程中…
      </div>
    );
  }

  const tierOf = new Map<string, Tier>(user.film_preferences.map((p) => [p.film_id, p.tier]));
  const hotOf = new Map(user.film_preferences.map((p) => [p.film_id, p.is_hot]));
  const gotSessionOf = (it: TicketListItem | DuoTicketRow): string | undefined =>
    "got_session_id" in it
      ? it.got_session_id
      : user.ticket_marks.find((m) => m.result === "got" && sessionById.get(m.session_id)?.film_id === it.film_id)?.session_id;
  const stateOf = (it: TicketListItem | DuoTicketRow): RowState => (gotSessionOf(it) ? "got" : it.exhausted ? "dead" : "pending");

  const apply = (change: (s: UserState) => UserState, film: string | null = null) => {
    updateUser(change);
    if (film) {
      setFlash(film);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1200);
    }
  };

  const onGot = (it: TicketListItem | DuoTicketRow) => apply((s) => markSession(s, it.current_session_id, "got"));
  const onMiss = (it: TicketListItem | DuoTicketRow) => apply((s) => markSession(s, it.current_session_id, "missed"), it.film_id);
  const onUndo = (it: TicketListItem | DuoTicketRow) => {
    const got = gotSessionOf(it);
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

  const listName = division && tab === "partner" ? partnerName : selfName;
  const exportTable = () => buildExportTable(items, filmById, sessionById, gotSessionOf);
  const onCopySheet = async () => {
    const tsv = toTsv(exportTable());
    const ok = await copyText(tsv);
    setExportManual(ok ? null : tsv);
    setExportMsg(ok ? `已複製${listName}的搶票清單（${items.length} 筆），到 Google 試算表按貼上即可` : "無法自動複製，請在下方文字框全選後複製");
  };
  const onDownloadCsv = () => {
    downloadCsv(`搶票清單-${listName}.csv`, toCsv(exportTable()));
    setExportMsg(`已下載 搶票清單-${listName}.csv`);
  };
  const onEnterFast = async () => {
    const first = pending[0];
    if (!first) return setFast({ toast: null, manual: null });
    const title = filmById.get(first.film_id)?.title ?? "";
    const s = sessionById.get(first.current_session_id);
    const ok = await copyText(title);
    setFast({
      toast: ok ? `已複製第一筆：${title}${s ? `（${dateLabel(s.date)}）` : ""}` : `無法自動複製，請手動複製：${title}`,
      manual: ok ? null : title,
    });
  };

  const renderRow = (it: TicketListItem | DuoTicketRow, idx: number, list: (TicketListItem | DuoTicketRow)[]) => {
    const duo = "owner" in it ? it : null;
    const state = stateOf(it);
    const film = filmById.get(it.film_id);
    const current = sessionById.get(it.current_session_id);
    const backups = it.backup_session_ids.map((id) => sessionById.get(id)).filter((s): s is Session => !!s);
    const tier = duo ? duo.tier : tierOf.get(it.film_id);
    const hot = duo ? duo.is_hot : hotOf.get(it.film_id);
    const prev = list[idx - 1];
    const next = list[idx + 1];
    const why = whyFacts(it);
    const cmp = whyCompare(it, next);
    return (
      <article
        key={`${tab}:${it.film_id}`}
        className={`card t ${state === "got" ? "got" : state === "dead" ? "dead" : "pend"}${flash === it.film_id ? " flash" : ""}`}
        data-testid="ticket-row"
        data-film={film?.title ?? ""}
        data-state={state}
        data-participant={duo?.participant}
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
            <CatNo no={film?.catalog_no} />
            <h2>{film?.title}</h2>
            {tier && <span className={`tag ${TIER_TAG_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>}
            {hot && <span className="tag tag-star">熱門</span>}
            {it.ticket_quantity !== undefined && (
              <span className="tag tag-want qty" data-testid="ticket-quantity">
                買 {it.ticket_quantity} 張
              </span>
            )}
            {duo && (
              <span className="tag tag-free" data-testid="ticket-participant">
                {duo.participant === "together" ? "一起" : "自己"}
              </span>
            )}
          </div>
          {state === "pending" && !division && (
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
            {why && (
              <details className="why" data-testid="ticket-why">
                <summary>為什麼</summary>
                <p data-testid="ticket-why-facts">{why}</p>
                {cmp && <p data-testid="ticket-why-compare">{cmp}</p>}
              </details>
            )}
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
      {division && (
        <div className="divhead">
          <div className="seg two" role="tablist" aria-label="搶票順序" data-testid="division-tabs">
            {([
              ["self", "我的順序"],
              ["partner", `${partnerName}的順序`],
            ] as [PersonSide, string][]).map(([side, label]) => (
              <button key={side} role="tab" className="segbtn" aria-selected={tab === side} onClick={() => setTab(side)}>
                {label}
              </button>
            ))}
          </div>
          <p className="divsum" data-testid="division-summary" hidden={!!fast}>
            {selfName} {division.summary.self.count} 筆 {division.summary.self.tickets} 張・{partnerName} {division.summary.partner.count} 筆{" "}
            {division.summary.partner.tickets} 張
          </p>
        </div>
      )}
      {items.length > 0 && !fast && (
        <div className="xbar" data-testid="tickets-tools">
          <button className="btn btn-primary xfast" data-testid="fast-enter" onClick={() => void onEnterFast()}>
            搶票模式
          </button>
          <div className="xexp">
            <button className="btn" data-testid="export-copy" onClick={() => void onCopySheet()}>
              複製到 Google 試算表
            </button>
            <button className="btn" data-testid="export-csv" onClick={onDownloadCsv}>
              下載 CSV
            </button>
          </div>
          {exportMsg && (
            <p className="note xmsg" role="status" data-testid="export-toast">
              {exportMsg}
            </p>
          )}
          {exportManual && <textarea className="input xmanual" readOnly rows={4} value={exportManual} aria-label="請手動複製這份清單" data-testid="export-manual" onFocus={(e) => e.currentTarget.select()} />}
        </div>
      )}
      {fast ? (
        <FastMode
          key={tab}
          pending={pending}
          total={items.length}
          gotCount={gotCount}
          deadCount={deadCount}
          filmById={filmById}
          sessionById={sessionById}
          onGot={onGot}
          onMiss={onMiss}
          onExit={() => setFast(null)}
          initialToast={fast.toast}
          initialManual={fast.manual}
        />
      ) : (
      <>
      <details className="howto" data-testid="order-explain">
        <summary>搶票順序怎麼排</summary>
        <ol data-testid="order-explain-list">
          {ORDER_RULES.map(([k, why]) => (
            <li key={k}>
              <b>{k}</b>：{why}
            </li>
          ))}
        </ol>
        <p className="note">由上往下比，前一項分得出高下就不看後面。</p>
      </details>
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
      {items.length === 0 && <p className="empty">{division ? "沒有要搶的場次" : "行程裡沒有需要搶票的片，先到選片頁標記並排行程"}</p>}
      <div data-testid="ticket-pending">{pending.map(renderRow)}</div>
      {done.length > 0 && <h3>已完成</h3>}
      <div data-testid="ticket-done">{done.map(renderRow)}</div>
      </>
      )}
    </>
  );
}
