import { useEffect, useRef, useState } from "react";
import type { Film, Session, TicketListItem } from "../domain/types";
import type { DuoTicketRow } from "../domain/division";
import { copyText } from "./clipboard";
import { dateLabel, formatTime } from "./format";

type Row = TicketListItem | DuoTicketRow;

interface Props {
  /** 目前分頁尚未處理的列（依搶票順序） */
  pending: Row[];
  total: number;
  gotCount: number;
  deadCount: number;
  filmById: Map<string, Film>;
  sessionById: Map<string, Session>;
  onGot: (it: Row) => void;
  onMiss: (it: Row) => void;
  onExit: () => void;
  /** 進入時要複製第一筆：由父層的進入按鈕 click 處理，這裡只接收結果 */
  initialToast: string | null;
  initialManual: string | null;
}

/** 搶票模式：一次只顯示一筆，標記時同一個 click／keydown 內就把下一筆的片名複製到剪貼簿 */
export function FastMode(p: Props) {
  const [idx, setIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(p.initialToast);
  const [manual, setManual] = useState<string | null>(p.initialManual);
  const i = Math.min(idx, p.pending.length - 1);
  const cur = p.pending[i];

  const titleOf = (it: Row) => p.filmById.get(it.film_id)?.title ?? "";
  const sessOf = (it: Row) => p.sessionById.get(it.current_session_id);
  const when = (s?: Session) => (s ? `${dateLabel(s.date)} ${formatTime(s.start_min)}` : "");

  /** 複製並顯示 toast；失敗時顯示可手動複製的文字框 */
  const copyAndSay = async (text: string, say: string) => {
    const ok = await copyText(text);
    setManual(ok ? null : text);
    setToast(ok ? say : `無法自動複製，請手動複製：${text}`);
  };

  const nextAfter = (): Row | undefined => (p.pending.length > 1 ? p.pending[(i + 1) % p.pending.length] : undefined);
  const nextSay = (n: Row) => `已複製下一筆：${titleOf(n)}（${dateLabel(sessOf(n)?.date ?? "1970-01-01")}）`;

  const doGot = () => {
    if (!cur) return;
    const n = nextAfter();
    if (n) void copyAndSay(titleOf(n), nextSay(n));
    else {
      setToast("全部處理完了");
      setManual(null);
    }
    setIdx(i + 1 < p.pending.length ? i : 0);
    p.onGot(cur);
  };

  const doMiss = () => {
    if (!cur) return;
    const backup = p.sessionById.get(cur.backup_session_ids[0]);
    if (backup) {
      void copyAndSay(titleOf(cur), `沒搶到，換備案 ${when(backup)}・已複製片名：${titleOf(cur)}`);
      p.onMiss(cur);
      return;
    }
    const n = nextAfter();
    if (n) void copyAndSay(titleOf(n), `沒搶到，已無備案。${nextSay(n)}`);
    else {
      setToast("沒搶到，已無備案");
      setManual(null);
    }
    setIdx(i + 1 < p.pending.length ? i : 0);
    p.onMiss(cur);
  };

  const doCopy = () => {
    if (cur) void copyAndSay(titleOf(cur), `已複製：${titleOf(cur)}（${when(sessOf(cur))}）`);
  };

  const move = (d: number) => {
    const j = Math.max(0, Math.min(p.pending.length - 1, i + d));
    if (j === i) return;
    setIdx(j);
    const t = p.pending[j];
    void copyAndSay(titleOf(t), `已複製：${titleOf(t)}（${when(sessOf(t))}）`);
  };

  // 快捷鍵永遠呼叫最新一版的處理函式
  const latest = useRef({ doGot, doMiss, doCopy, move });
  latest.current = { doGot, doMiss, doCopy, move };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const h = latest.current;
      if (k === "g") h.doGot();
      else if (k === "m") h.doMiss();
      else if (k === "c") h.doCopy();
      else if (e.key === "ArrowLeft") h.move(-1);
      else if (e.key === "ArrowRight") h.move(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toastBox = (
    <div className="fm-toast" role="status" aria-live="polite" data-testid="fast-toast">
      {toast}
    </div>
  );
  const manualBox = manual && (
    <input
      className="input fm-manual"
      readOnly
      value={manual}
      aria-label="請手動複製這段文字"
      data-testid="fast-manual-copy"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
    />
  );

  if (!cur) {
    return (
      <section className="fm" data-testid="fast-mode">
        {toastBox}
        <div className="card fm-card" data-testid="fast-summary">
          <h2>搶票完成</h2>
          <p className="fm-title">
            搶到 {p.gotCount} 部、未搶到 {p.deadCount} 部
          </p>
          <a className="btn btn-primary btn-block" href="#/itinerary">
            依搶到結果重新排程
          </a>
          <button className="btn btn-block fm-exit" onClick={p.onExit}>
            結束搶票模式
          </button>
        </div>
      </section>
    );
  }

  const film = p.filmById.get(cur.film_id);
  const s = sessOf(cur);
  const qty = cur.ticket_quantity;
  const upcoming = p.pending.slice(i + 1, i + 3);

  return (
    <section className="fm" data-testid="fast-mode">
      {toastBox}
      {manualBox}
      <div className="card fm-card" data-testid="fast-current" data-film={film?.title ?? ""}>
        <div className="fm-top">
          <span className="fm-prog mono" data-testid="fast-progress">
            {cur.order}/{p.total}
          </span>
          <div className="fm-nav">
            <button className="mv" aria-label="上一筆" disabled={i === 0} onClick={() => move(-1)}>
              ←
            </button>
            <button className="mv" aria-label="下一筆" disabled={i >= p.pending.length - 1} onClick={() => move(1)}>
              →
            </button>
          </div>
        </div>
        {s && (
          <p className="fm-date mono" data-testid="fast-date">
            {dateLabel(s.date)}
          </p>
        )}
        {s && (
          <p className="fm-meta" data-testid="fast-meta">
            <b className="mono">{formatTime(s.start_min)}</b> <span className="venue">{s.venue_name}</span>
            {qty !== undefined && <span className="tag tag-want"> 買 {qty} 張</span>}
          </p>
        )}
        <h2 className="fm-title" data-testid="fast-title">
          {film?.title}
        </h2>
        <button className="btn btn-primary btn-block fm-copy" onClick={doCopy}>
          複製片名
        </button>
      </div>
      <div className="acts fm-acts">
        <button className="btn btn-ok" onClick={doGot}>
          搶到
        </button>
        <button className="btn btn-miss" onClick={doMiss}>
          沒搶到
        </button>
      </div>
      <p className="fm-hint note" data-testid="fast-hint">
        快捷鍵：G 搶到・M 沒搶到・C 複製片名・← → 切換
      </p>
      {upcoming.length > 0 && (
        <div className="fm-next" data-testid="fast-upcoming">
          <h3>接下來</h3>
          {upcoming.map((n) => (
            <div className="fm-nrow" key={n.film_id} data-testid="fast-upcoming-item">
              <span className="mono">{n.order}</span> <b>{titleOf(n)}</b> <span className="mono">{when(sessOf(n))}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-block fm-exit" onClick={p.onExit}>
        結束搶票模式
      </button>
    </section>
  );
}
