import type { Catalog, DuoItineraryEntry, PartnerData, PersonSide, Session, Tier, UserState } from "./types";
import { scheduleDuo, type DuoSchedule } from "./duo";
import { formatTime } from "./time";

/** 取捨卡片最多處理的衝突片數（FR-514）：超過時只處理影片順序最前的幾部 */
export const MAX_TRADEOFF_FILMS = 8;
/** 差異清單最多的行數（FR-513） */
export const MAX_DIFF_LINES = 6;

export type TradeoffChange =
  | { kind: "lose_together"; film_id: string }
  | { kind: "gain_together"; film_id: string }
  | { kind: "moved"; who: PersonSide | "together"; film_id: string; session_id: string }
  | { kind: "dropped" | "gained"; who: PersonSide; film_id: string; tier: Tier }
  | { kind: "stars"; delta: number };

export interface TradeoffOption {
  /** 這部片在該選項下，負責人看的場次 */
  session_id: string;
  /** 這部片在該選項下是否與同伴一起看 */
  together: boolean;
}

/** 取捨（005，CL-504）：衍生資料，不保存 */
export interface Tradeoff {
  /** 優先場被犧牲的人（self = 本裝置使用者） */
  owner: PersonSide;
  film_id: string;
  /** 預設：一起看（不含這部片的取捨決定） */
  a: TradeoffOption;
  /** 看優先場：把負責人的這部片鎖定在優先場 */
  b: TradeoffOption;
  /** 目前生效的選項：已選看優先場 = b */
  chosen: "a" | "b";
  /** A 放棄的優先場（負責人對這部片標為優先的場次） */
  preferred_session_ids: string[];
  /** B 相對 A 的差異（兩人） */
  changes: TradeoffChange[];
}

interface FilmPlacement {
  session: Session;
  tier: Tier;
}

interface View {
  self: Map<string, FilmPlacement>;
  partner: Map<string, FilmPlacement>;
  together: Set<string>;
  stars: number;
}

function viewOf(catalog: Catalog, entries: DuoItineraryEntry[]): View {
  const byId = new Map(catalog.sessions.map((s) => [s.session_id, s]));
  const view: View = { self: new Map(), partner: new Map(), together: new Set(), stars: 0 };
  for (const e of entries) {
    const session = byId.get(e.session_id);
    if (!session) continue;
    const star = session.marks.includes("guest_attending");
    if (e.participant !== "partner") {
      view.self.set(session.film_id, { session, tier: e.tier! });
      if (star) view.stars++;
    }
    if (e.participant !== "self") {
      view.partner.set(session.film_id, { session, tier: e.partner_tier! });
      if (star) view.stars++;
    }
    if (e.participant === "together") view.together.add(session.film_id);
  }
  return view;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

function diffViews(catalog: Catalog, a: View, b: View, owner: PersonSide, ownerFilm: string): TradeoffChange[] {
  const out: TradeoffChange[] = [];
  const filmIds = new Set([...a.self.keys(), ...a.partner.keys(), ...b.self.keys(), ...b.partner.keys()]);
  for (const film of catalog.films) {
    const f = film.film_id;
    if (!filmIds.has(f)) continue;
    const aT = a.together.has(f);
    const bT = b.together.has(f);
    if (aT && !bT) out.push({ kind: "lose_together", film_id: f });
    else if (!aT && bT) out.push({ kind: "gain_together", film_id: f });
    else if (aT && bT) {
      const sa = a.self.get(f)!.session;
      const sb = b.self.get(f)!.session;
      if (sa.session_id !== sb.session_id) out.push({ kind: "moved", who: "together", film_id: f, session_id: sb.session_id });
    }
    for (const side of ["self", "partner"] as const) {
      const pa = a[side].get(f);
      const pb = b[side].get(f);
      if (pa && !pb) out.push({ kind: "dropped", who: side, film_id: f, tier: pa.tier });
      else if (!pa && pb) out.push({ kind: "gained", who: side, film_id: f, tier: pb.tier });
      else if (pa && pb && !aT && !bT && pa.session.session_id !== pb.session.session_id && !(side === owner && f === ownerFilm)) {
        out.push({ kind: "moved", who: side, film_id: f, session_id: pb.session.session_id });
      }
    }
  }
  if (b.stars !== a.stars) out.push({ kind: "stars", delta: b.stars - a.stars });
  return out;
}

/** 有優先標記、沒有只看標記的片（依影片順序） */
function preferFilms(catalog: Catalog, person: { session_marks?: Record<string, string> }): string[] {
  const marks = person.session_marks ?? {};
  if (Object.keys(marks).length === 0) return [];
  const prefer = new Set<string>();
  const only = new Set<string>();
  for (const s of catalog.sessions) {
    if (marks[s.session_id] === "prefer") prefer.add(s.film_id);
    else if (marks[s.session_id] === "only") only.add(s.film_id);
  }
  return catalog.films.map((f) => f.film_id).filter((id) => prefer.has(id) && !only.has(id));
}

function withPin(person: UserState | PartnerData, filmId: string, pinned: boolean): { pinned_choices?: Record<string, "prefer_session"> } {
  const next = { ...(person.pinned_choices ?? {}) };
  if (pinned) next[filmId] = "prefer_session";
  else delete next[filmId];
  return Object.keys(next).length ? { pinned_choices: next } : { pinned_choices: undefined };
}

/**
 * 取捨（005，CL-504，FR-512～FR-514）。current 是以 self、partner 排出的目前兩人行程。
 * 對每個有優先標記的 (人, 片)：取預設（不含這片的取捨決定）與鎖定在優先場兩份實際排程比較；
 * 預設不是優先場、鎖定後是優先場、該人的影片集合不變、且一起看的片集合改變時成立。
 */
export function buildTradeoffs(catalog: Catalog, self: UserState, partner: PartnerData, current: DuoSchedule): Tradeoff[] {
  const cur = viewOf(catalog, current.entries);
  const candidates: { side: PersonSide; film: string }[] = [];
  const bySide: Record<PersonSide, string[]> = { self: preferFilms(catalog, self), partner: preferFilms(catalog, partner) };
  const order = new Map(catalog.films.map((f, i) => [f.film_id, i]));
  for (const side of ["self", "partner"] as const) for (const film of bySide[side]) candidates.push({ side, film });
  candidates.sort((x, y) => (order.get(x.film) ?? 0) - (order.get(y.film) ?? 0) || (x.side === "self" ? -1 : 1));

  const out: Tradeoff[] = [];
  for (const { side, film } of candidates.slice(0, MAX_TRADEOFF_FILMS)) {
    const person = side === "self" ? self : partner;
    const marks = person.session_marks ?? {};
    const pinnedNow = person.pinned_choices?.[film] === "prefer_session";
    // 目前生效的選項是 b（已選）或 a（預設）；另一份才需要重跑
    if (!pinnedNow) {
      const here = cur[side].get(film);
      if (!here || marks[here.session.session_id] === "prefer") continue;
    }
    const alt = scheduleDuo(
      catalog,
      side === "self" ? { ...self, ...withPin(self, film, !pinnedNow) } : self,
      side === "partner" ? { ...partner, ...withPin(partner, film, !pinnedNow) } : partner,
    );
    const altView = viewOf(catalog, alt.entries);
    const [aView, bView] = pinnedNow ? [altView, cur] : [cur, altView];
    const aF = aView[side].get(film);
    const bF = bView[side].get(film);
    if (!aF || !bF) continue;
    if (marks[aF.session.session_id] === "prefer" || marks[bF.session.session_id] !== "prefer") continue;
    if (!setsEqual(new Set(aView[side].keys()), new Set(bView[side].keys()))) continue;
    if (setsEqual(aView.together, bView.together)) continue;
    out.push({
      owner: side,
      film_id: film,
      a: { session_id: aF.session.session_id, together: aView.together.has(film) },
      b: { session_id: bF.session.session_id, together: bView.together.has(film) },
      chosen: pinnedNow ? "b" : "a",
      preferred_session_ids: catalog.sessions.filter((s) => s.film_id === film && marks[s.session_id] === "prefer").map((s) => s.session_id),
      changes: diffViews(catalog, aView, bView, side, film),
    });
  }
  return out;
}

// ───────────────────────── 文字（畫面與測試共用的格式） ─────────────────────────

/** 11/15 11:00 */
export function sessionText(s: Session): string {
  const [, mm, dd] = s.date.split("-");
  return `${mm}/${dd} ${formatTime(s.start_min)}`;
}

/** 11/15（只有日期） */
export function sessionDateText(s: Session): string {
  const [, mm, dd] = s.date.split("-");
  return `${mm}/${dd}`;
}

const TIER_TEXT: Record<Tier, string> = { must: "必看", want: "想看", maybe: "有空再看" };

export interface TextContext {
  titleOf: (filmId: string) => string;
  sessionOf: (sessionId: string) => Session;
  /** 兩人的顯示名稱 */
  nameOf: (side: PersonSide) => string;
}

export function optionAText(t: Tradeoff, ctx: TextContext): string {
  return `${t.a.together ? "一起看" : "目前"} ${sessionText(ctx.sessionOf(t.a.session_id))}`;
}

/** ownerLabel：觀眾自己的卡片用「你」，同伴的卡片用同伴名稱 */
export function optionBText(t: Tradeoff, ctx: TextContext, ownerLabel: string): string {
  return `看${ownerLabel}的優先場 ${sessionText(ctx.sessionOf(t.b.session_id))}`;
}

export function giveUpText(t: Tradeoff, ctx: TextContext): string {
  return `放棄：${ctx.nameOf(t.owner)} 的優先場 ${t.preferred_session_ids.map((id) => sessionText(ctx.sessionOf(id))).join("、")}`;
}

export function changeText(c: TradeoffChange, ctx: TextContext): string {
  switch (c.kind) {
    case "lose_together":
      return `《${ctx.titleOf(c.film_id)}》不再一起看`;
    case "gain_together":
      return `《${ctx.titleOf(c.film_id)}》改成一起看`;
    case "moved":
      return c.who === "together"
        ? `《${ctx.titleOf(c.film_id)}》一起看改到 ${sessionText(ctx.sessionOf(c.session_id))}`
        : `${ctx.nameOf(c.who)} 的《${ctx.titleOf(c.film_id)}》改到 ${sessionText(ctx.sessionOf(c.session_id))}`;
    case "dropped":
      return `${ctx.nameOf(c.who)} 少看《${ctx.titleOf(c.film_id)}》（${TIER_TEXT[c.tier]}）`;
    case "gained":
      return `${ctx.nameOf(c.who)} 多看《${ctx.titleOf(c.film_id)}》（${TIER_TEXT[c.tier]}）`;
    case "stars":
      return `★ 場次${c.delta < 0 ? "減少" : "增加"} ${Math.abs(c.delta)} 場`;
  }
}

/** 差異行：最多 MAX_DIFF_LINES 行，超過時前面 MAX_DIFF_LINES - 1 行加上「還有 n 項」 */
export function diffLines(t: Tradeoff, ctx: TextContext): string[] {
  const lines = t.changes.map((c) => changeText(c, ctx));
  if (lines.length <= MAX_DIFF_LINES) return lines;
  return [...lines.slice(0, MAX_DIFF_LINES - 1), `還有 ${lines.length - (MAX_DIFF_LINES - 1)} 項`];
}
