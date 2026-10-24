import type {
  Catalog,
  CinemaId,
  DayAvailability,
  FilmPreference,
  ItineraryEntry,
  PinnedChoice,
  Session,
  SessionPref,
  TicketMark,
  Tier,
  UnavailableSlot,
  UnscheduledMustFilm,
  UserState,
} from "./types";
import { areSessionsCompatibleEitherOrder, cinemaResolver } from "./compat";
import { availabilityOf, isSessionAvailable } from "./availability";
import { sessionStartAbs } from "./time";
import { makeMarkView, type MarkView } from "./session-marks";

export interface ScheduleResult {
  itinerary: ItineraryEntry[];
  unscheduled: UnscheduledMustFilm[];
}

export const TIER_RANK: Record<Tier, number> = { must: 0, want: 1, maybe: 2 };

export function isGuestSession(s: Session): boolean {
  return s.marks.includes("guest_attending");
}

/** 場次偏好順序：影人出席優先，其次較早，最後 session_id（確保可重現） */
export function compareSessionsPreferred(a: Session, b: Session): number {
  const star = Number(isGuestSession(b)) - Number(isGuestSession(a));
  if (star !== 0) return star;
  const t = sessionStartAbs(a) - sessionStartAbs(b);
  if (t !== 0) return t;
  return a.session_id < b.session_id ? -1 : a.session_id > b.session_id ? 1 : 0;
}

// ───────────────────────── 排程輸入與準備 ─────────────────────────

/** 一個人的排程輸入（自己或同伴）：分層含層內名次、有空時段、每日上限、搶票標記 */
export interface PersonInput {
  film_preferences: FilmPreference[];
  availability: DayAvailability[];
  daily_limit: number | null;
  ticket_marks: TicketMark[];
  /** 場次偏好（005）：優先／只看這場 */
  session_marks?: Record<string, SessionPref>;
  /** 取捨決定（005）：該片限定在優先場 */
  pinned_choices?: Record<string, PinnedChoice>;
}

/** 由使用者狀態或同伴資料取出排程輸入（有空時段缺省時由舊不可看時段即時相減） */
export function personInputOf(p: {
  film_preferences: FilmPreference[];
  availability?: DayAvailability[];
  unavailable_slots?: UnavailableSlot[];
  daily_limit: number | null;
  ticket_marks?: TicketMark[];
  session_marks?: Record<string, SessionPref>;
  pinned_choices?: Record<string, PinnedChoice>;
}): PersonInput {
  return {
    film_preferences: p.film_preferences,
    availability: availabilityOf(p),
    daily_limit: p.daily_limit,
    ticket_marks: p.ticket_marks ?? [],
    session_marks: p.session_marks,
    pinned_choices: p.pinned_choices,
  };
}

export interface EngineContext {
  catalog: Catalog;
  filmOrder: Map<string, number>;
  sessionsOf: Map<string, Session[]>;
  cinemaOf: (venueName: string) => CinemaId;
  compat: (a: Session, b: Session) => boolean;
}

export function makeContext(catalog: Catalog): EngineContext {
  const cinemaOf = cinemaResolver(catalog);
  const sessionsOf = new Map<string, Session[]>();
  for (const s of catalog.sessions) {
    const arr = sessionsOf.get(s.film_id);
    if (arr) arr.push(s);
    else sessionsOf.set(s.film_id, [s]);
  }
  return {
    catalog,
    filmOrder: new Map(catalog.films.map((f, i) => [f.film_id, i])),
    sessionsOf,
    cinemaOf,
    compat: (a, b) => areSessionsCompatibleEitherOrder(a, b, cinemaOf),
  };
}

export interface Cand {
  session: Session;
  filmId: string;
  star: boolean;
  /** 標為優先的場次（005） */
  pref: boolean;
  fixed: boolean;
  /** 與此候選不相容的候選索引（同一個人的候選之間） */
  conflicts: number[];
}

export interface PFilm {
  filmId: string;
  tier: Tier;
  /** 在同層內的次序（層內名次由小到大；沒有名次者依場次表影片順序） */
  pos: number;
  /** 場次表影片順序 */
  order: number;
  cands: number[];
}

export interface PersonPlan {
  limit: number | null;
  cands: Cand[];
  /** 已搶到（固定）的影片，各只有一個固定候選 */
  fixed: PFilm[];
  /** 其餘有可行候選的影片 */
  free: PFilm[];
  /** 所有有效分層影片（依場次表影片順序） */
  prefs: { filmId: string; tier: Tier }[];
  fixedDay: Map<string, number>;
  base: [number, number, number];
  gotFilms: Set<string>;
  /** 該片可看（有空且未標沒搶到）的場次，依偏好順序 */
  watchable: (filmId: string) => Session[];
  tierOf: Map<string, Tier>;
  /** 候選場次受限的影片（有只看場次，或已選看優先場；005） */
  restricted: Set<string>;
  marks: MarkView;
}

export function preparePerson(ctx: EngineContext, input: PersonInput): PersonPlan {
  const { catalog, filmOrder, sessionsOf, compat } = ctx;
  const limit = input.daily_limit;
  const missed = new Set(input.ticket_marks.filter((m) => m.result === "missed").map((m) => m.session_id));
  const sessionById = new Map(catalog.sessions.map((s) => [s.session_id, s]));
  const marks = makeMarkView(input, sessionsOf);
  const restricted = new Set<string>();
  if (!marks.empty) for (const filmId of sessionsOf.keys()) if (marks.restricted(filmId)) restricted.add(filmId);
  const gotByFilm = new Map<string, Session>();
  for (const m of input.ticket_marks) {
    if (m.result !== "got") continue;
    const s = sessionById.get(m.session_id);
    if (s && !gotByFilm.has(s.film_id)) gotByFilm.set(s.film_id, s);
  }

  // 去重後的已分層影片（後者覆蓋前者）
  const prefMap = new Map<string, FilmPreference>();
  for (const p of input.film_preferences) if (filmOrder.has(p.film_id)) prefMap.set(p.film_id, p);
  const prefList = [...prefMap.values()].sort((a, b) => filmOrder.get(a.film_id)! - filmOrder.get(b.film_id)!);
  const prefs = prefList.map((p) => ({ filmId: p.film_id, tier: p.tier }));
  const tierOf = new Map(prefs.map((p) => [p.filmId, p.tier]));

  // 層內次序：同層依名次由小到大，沒有名次者依場次表影片順序接在後面
  const pos = new Map<string, number>();
  for (const tier of ["must", "want", "maybe"] as Tier[]) {
    prefList
      .filter((p) => p.tier === tier)
      .sort(
        (a, b) =>
          (a.tier_rank ?? Number.MAX_SAFE_INTEGER) - (b.tier_rank ?? Number.MAX_SAFE_INTEGER) ||
          filmOrder.get(a.film_id)! - filmOrder.get(b.film_id)!,
      )
      .forEach((p, k) => pos.set(p.film_id, k));
  }

  const watchable = (filmId: string): Session[] =>
    (sessionsOf.get(filmId) ?? [])
      .filter((s) => !missed.has(s.session_id) && isSessionAvailable(s, input.availability) && marks.allowed(s))
      .sort(compareSessionsPreferred);

  const cands: Cand[] = [];
  const fixed: PFilm[] = [];
  const base: [number, number, number] = [0, 0, 0];
  const fixedDay = new Map<string, number>();
  for (const p of prefs) {
    const g = gotByFilm.get(p.filmId);
    if (!g) continue;
    fixed.push({ filmId: p.filmId, tier: p.tier, pos: pos.get(p.filmId)!, order: filmOrder.get(p.filmId)!, cands: [cands.length] });
    cands.push({ session: g, filmId: p.filmId, star: isGuestSession(g), pref: marks.pref(g.session_id), fixed: true, conflicts: [] });
    base[TIER_RANK[p.tier]]++;
    fixedDay.set(g.date, (fixedDay.get(g.date) ?? 0) + 1);
  }
  const fixedSessions = fixed.map((f) => cands[f.cands[0]].session);

  const free: PFilm[] = [];
  for (const p of prefs) {
    if (gotByFilm.has(p.filmId)) continue;
    const idxs: number[] = [];
    for (const s of watchable(p.filmId)) {
      if (limit !== null && (fixedDay.get(s.date) ?? 0) >= limit) continue;
      if (!fixedSessions.every((f) => compat(s, f))) continue;
      idxs.push(cands.length);
      cands.push({ session: s, filmId: p.filmId, star: isGuestSession(s), pref: marks.pref(s.session_id), fixed: false, conflicts: [] });
    }
    if (idxs.length > 0) free.push({ filmId: p.filmId, tier: p.tier, pos: pos.get(p.filmId)!, order: filmOrder.get(p.filmId)!, cands: idxs });
  }
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      if (cands[i].filmId === cands[j].filmId) continue;
      if (!compat(cands[i].session, cands[j].session)) {
        cands[i].conflicts.push(j);
        cands[j].conflicts.push(i);
      }
    }
  }
  return { limit, cands, fixed, free, prefs, fixedDay, base, gotFilms: new Set(gotByFilm.keys()), watchable, tierOf, restricted, marks };
}

/** 一個人的搜尋狀態：被選中候選造成的封鎖與每日場次數 */
export class PersonState {
  readonly blocked: Int32Array;
  readonly dayCount: Map<string, number>;
  constructor(readonly plan: PersonPlan, initDay?: Map<string, number>) {
    this.blocked = new Int32Array(plan.cands.length);
    this.dayCount = new Map(initDay ?? []);
  }
  feasible(c: number): boolean {
    const cand = this.plan.cands[c];
    if (cand.fixed) return true;
    return this.blocked[c] === 0 && (this.plan.limit === null || (this.dayCount.get(cand.session.date) ?? 0) < this.plan.limit);
  }
  take(c: number): void {
    const cand = this.plan.cands[c];
    this.dayCount.set(cand.session.date, (this.dayCount.get(cand.session.date) ?? 0) + 1);
    for (const x of cand.conflicts) this.blocked[x]++;
  }
  undo(c: number): void {
    const cand = this.plan.cands[c];
    this.dayCount.set(cand.session.date, this.dayCount.get(cand.session.date)! - 1);
    for (const x of cand.conflicts) this.blocked[x]--;
  }
}

type Counts = [number, number, number];

function compareCounts(a: Counts, b: Counts): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// ───────────────────────── 個人最佳：第 1～3 項（層級數） ─────────────────────────

/** 精確搜尋：必看數、想看數、有空再看數的字典序最大值（含已搶到固定的影片） */
export function bestCounts(plan: PersonPlan): Counts {
  return searchCounts(plan).counts;
}

function searchCounts(plan: PersonPlan): { counts: Counts; films: Set<string> } {
  const st = new PersonState(plan, plan.fixedDay);
  const free = [...plan.free].sort(
    (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.cands.length - b.cands.length || a.order - b.order,
  );
  const cur: Counts = [...plan.base];
  const chosen: string[] = [];
  let best: Counts | null = null;
  let bestFilms: string[] = [];

  const bound = (from: number): Counts => {
    const b: Counts = [cur[0], cur[1], cur[2]];
    for (let i = from; i < free.length; i++) if (free[i].cands.some((c) => st.feasible(c))) b[TIER_RANK[free[i].tier]]++;
    return b;
  };
  const dfs = (i: number): void => {
    if (i === free.length) {
      if (best === null || compareCounts(cur, best) > 0) {
        best = [cur[0], cur[1], cur[2]];
        bestFilms = [...chosen];
      }
      return;
    }
    if (best !== null && compareCounts(bound(i), best) <= 0) return;
    const film = free[i];
    const rank = TIER_RANK[film.tier];
    for (const c of film.cands) {
      if (!st.feasible(c)) continue;
      st.take(c);
      cur[rank]++;
      chosen.push(film.filmId);
      dfs(i + 1);
      chosen.pop();
      cur[rank]--;
      st.undo(c);
    }
    dfs(i + 1); // 不排此片
  };
  dfs(0);
  return { counts: best ?? [...plan.base], films: new Set(bestFilms) };
}

/**
 * 在層級數恰為 counts 的前提下，找一組「committed 全部排入、其餘 optional 影片可排可不排」的可行影片集合。
 * 回傳其中一組解的影片 id（不含固定影片）；找不到回傳 null。committed 先依候選少者排、optional 依 (層級, 候選數) 排。
 */
function findSolution(plan: PersonPlan, committed: PFilm[], optional: PFilm[], counts: Counts, budget: { nodes: number }): Set<string> | null {
  const st = new PersonState(plan, plan.fixedDay);
  const req = [...committed].sort((a, b) => a.cands.length - b.cands.length || a.order - b.order);
  const opt = [...optional].sort(
    (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.cands.length - b.cands.length || a.order - b.order,
  );
  const films = [...req, ...opt];
  const nReq = req.length;
  const cur: Counts = [...plan.base];
  const chosen: string[] = [];

  const viable = (from: number): boolean => {
    const rem: Counts = [0, 0, 0];
    for (let i = from; i < films.length; i++) {
      const any = films[i].cands.some((c) => st.feasible(c));
      if (!any) {
        if (i < nReq) return false;
        continue;
      }
      rem[TIER_RANK[films[i].tier]]++;
    }
    for (let t = 0; t < 3; t++) if (cur[t] > counts[t] || cur[t] + rem[t] < counts[t]) return false;
    return true;
  };
  const dfs = (i: number): boolean => {
    if (--budget.nodes < 0) return false;
    if (!viable(i)) return false;
    if (i === films.length) return cur[0] === counts[0] && cur[1] === counts[1] && cur[2] === counts[2];
    const film = films[i];
    const rank = TIER_RANK[film.tier];
    for (const c of film.cands) {
      if (!st.feasible(c)) continue;
      st.take(c);
      cur[rank]++;
      chosen.push(film.filmId);
      if (dfs(i + 1)) return true;
      chosen.pop();
      cur[rank]--;
      st.undo(c);
    }
    return i >= nReq ? dfs(i + 1) : false;
  };
  return dfs(0) ? new Set(chosen) : null;
}

/** 層內排序可行性檢查的總節點預算（決定性）：用完後尚未確認可行的影片視為排不進去，層級數不受影響 */
export const SET_NODE_BUDGET = 6_000_000;

export interface FilmSetResult {
  /** 層級數（含已搶到固定的影片）：必看、想看、有空再看 */
  counts: Counts;
  /** 個人最佳的影片集合（不含已搶到固定的影片） */
  films: Set<string>;
}

/**
 * 個人目標第 1～4 項：先求層級數最大值，再在其中取層內排序最佳的影片集合。
 * 層內排序（各層排入影片的名次由小到大逐一比較，名次較小者勝）在層級數相同時等價於：
 * 依 (層級, 層內名次) 逐片「能排就排」；可行條件是「已收進的影片全部排入後，仍能湊成最大層級數」。
 */
export function bestFilmSet(plan: PersonPlan): FilmSetResult {
  const { counts, films: first } = searchCounts(plan);
  const order = [...plan.free].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.pos - b.pos || a.order - b.order);
  const committed: PFilm[] = [];
  const budget = { nodes: SET_NODE_BUDGET };
  let witness: Set<string> = first;
  order.forEach((f, i) => {
    if (witness.has(f.filmId)) {
      committed.push(f);
      return;
    }
    const w = findSolution(plan, [...committed, f], order.slice(i + 1), counts, budget);
    if (w) {
      committed.push(f);
      witness = w;
    }
  });
  return { counts, films: new Set(committed.map((f) => f.filmId)) };
}

// ───────────────────────── 場次指派（第 5 項 ★；兩人時先比一起看） ─────────────────────────

interface JointFilm {
  filmId: string;
  /** 各人的候選索引；該人沒有這部片 = null */
  per: (number[] | null)[];
  /** 兩人都有這部片時，同一場次的候選配對 [人0 索引, 人1 索引] */
  pairs: [number, number][];
  key: [number, number, number, number];
}

/** 場次指派的搜尋節點預算（找到第一個可行解之後才生效） */
export const ASSIGN_NODE_BUDGET = 1_500_000;
/** 有優先場候選時的預算（005）：優先場影片數的上界很鬆，證明最佳要窮舉，改用較小的決定性預算以守住 NFR-501（取捨還要重跑排程） */
export const ASSIGN_NODE_BUDGET_WITH_PREFS = 300_000;

export interface Assignment {
  /** 各人排入的場次 */
  sessions: Session[][];
  /** 兩人排入同一場次的數量（單人 = 0） */
  together: number;
  /** 排在優先場的影片數（各人加總；005） */
  prefs: number;
  stars: number;
}

/**
 * 每人已決定要排的影片（sets，不含固定影片，固定影片一律排入）：
 * 單人 -> 先最大化優先場影片數（005），再最大化 ★ 場次數；兩人 -> 先最大化一起看的場次數，再最大化優先場影片數合計（005），最後最大化兩人 ★ 合計。
 * 同分時先找到者勝（候選依 ★、時間排序），所以固定為場次較早者。
 */
export function assignSessions(plans: PersonPlan[], sets: Set<string>[]): Assignment {
  const states = plans.map((p) => new PersonState(p));
  const budget = plans.some((p) => p.cands.some((c) => c.pref)) ? ASSIGN_NODE_BUDGET_WITH_PREFS : ASSIGN_NODE_BUDGET;
  const filmMap = new Map<string, JointFilm>();
  plans.forEach((plan, p) => {
    const add = (f: PFilm) => {
      let jf = filmMap.get(f.filmId);
      if (!jf) {
        jf = { filmId: f.filmId, per: plans.map(() => null), pairs: [], key: [1, 0, 0, f.order] };
        filmMap.set(f.filmId, jf);
      }
      jf.per[p] = f.cands;
    };
    for (const f of plan.fixed) add(f);
    for (const f of plan.free) if (sets[p].has(f.filmId)) add(f);
  });
  const films = [...filmMap.values()];
  for (const jf of films) {
    const idx = jf.per.map((c) => c);
    const hasFixed = idx.some((c, p) => c !== null && plans[p].cands[c[0]].fixed);
    const tiers = idx.map((_, p) => plans[p].tierOf.get(jf.filmId)).filter((t): t is Tier => !!t).map((t) => TIER_RANK[t]);
    const counts = idx.filter((c): c is number[] => c !== null).map((c) => c.length);
    jf.key = [hasFixed ? 0 : 1, Math.min(...tiers), Math.min(...counts), jf.key[3]];
    if (plans.length === 2 && idx[0] && idx[1]) {
      for (const a of idx[0]) for (const b of idx[1]) if (plans[0].cands[a].session.session_id === plans[1].cands[b].session.session_id) jf.pairs.push([a, b]);
    }
  }
  films.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.key[3] - b.key[3]);

  const chosen: number[][] = plans.map(() => []);
  let together = 0;
  let prefs = 0;
  let stars = 0;
  let best: { together: number; prefs: number; stars: number; chosen: number[][] } | null = null;

  /** 字典序比較 (一起看, 優先場, ★)；> 0 表示 a 較佳 */
  const cmp = (a: { t: number; p: number; s: number }, b: { t: number; p: number; s: number }): number => a.t - b.t || a.p - b.p || a.s - b.s;

  const bound = (from: number): { t: number; p: number; s: number } | null => {
    let t = together;
    let p = prefs;
    let s = stars;
    for (let i = from; i < films.length; i++) {
      const jf = films[i];
      for (let q = 0; q < plans.length; q++) {
        const list = jf.per[q];
        if (!list) continue;
        let any = false;
        let anyStar = false;
        let anyPref = false;
        for (const c of list) {
          if (!states[q].feasible(c)) continue;
          any = true;
          const cand = plans[q].cands[c];
          if (cand.star) anyStar = true;
          if (cand.pref) anyPref = true;
          if (anyStar && anyPref) break;
        }
        if (!any) return null; // 這部必排的片已無可行場次
        if (anyStar) s++;
        if (anyPref) p++;
      }
      if (jf.pairs.some(([a, b]) => states[0].feasible(a) && states[1].feasible(b))) t++;
    }
    return { t, p, s };
  };

  const place = (p: number, c: number) => {
    states[p].take(c);
    chosen[p].push(c);
    if (plans[p].cands[c].star) stars++;
    if (plans[p].cands[c].pref) prefs++;
  };
  const unplace = (p: number, c: number) => {
    if (plans[p].cands[c].pref) prefs--;
    if (plans[p].cands[c].star) stars--;
    chosen[p].pop();
    states[p].undo(c);
  };

  // 決定性的節點預算：極端難的資料（大量互相衝堂的候選）不證明最佳，改回傳目前最佳解，確保回應時間；一般資料遠低於此預算
  let nodes = 0;
  const dfs = (i: number): void => {
    if (best !== null && ++nodes > budget) return;
    if (i === films.length) {
      if (best === null || cmp({ t: together, p: prefs, s: stars }, { t: best.together, p: best.prefs, s: best.stars }) > 0) {
        best = { together, prefs, stars, chosen: chosen.map((c) => [...c]) };
      }
      return;
    }
    const ub = bound(i);
    if (ub === null) return;
    if (best !== null && cmp(ub, { t: best.together, p: best.prefs, s: best.stars }) <= 0) return;
    const jf = films[i];
    if (plans.length === 1 || !jf.per[0] || !jf.per[1]) {
      const p = jf.per[0] ? 0 : 1;
      for (const c of jf.per[p]!) {
        if (!states[p].feasible(c)) continue;
        place(p, c);
        dfs(i + 1);
        unplace(p, c);
      }
      return;
    }
    // 兩人都要看這部：先試一起（同一場次），再試各自不同場次
    for (const [a, b] of jf.pairs) {
      if (!states[0].feasible(a) || !states[1].feasible(b)) continue;
      place(0, a);
      place(1, b);
      together++;
      dfs(i + 1);
      together--;
      unplace(1, b);
      unplace(0, a);
    }
    for (const a of jf.per[0]) {
      if (!states[0].feasible(a)) continue;
      place(0, a);
      for (const b of jf.per[1]) {
        if (!states[1].feasible(b)) continue;
        if (plans[0].cands[a].session.session_id === plans[1].cands[b].session.session_id) continue;
        place(1, b);
        dfs(i + 1);
        unplace(1, b);
      }
      unplace(0, a);
    }
  };
  dfs(0);

  const result = best as { together: number; prefs: number; stars: number; chosen: number[][] } | null;
  const sel = result ? result.chosen : plans.map(() => [] as number[]);
  return {
    sessions: sel.map((list, p) => list.map((c) => plans[p].cands[c].session)),
    together: result?.together ?? 0,
    prefs: result?.prefs ?? 0,
    stars: result?.stars ?? 0,
  };
}

// ───────────────────────── 未排入必看片原因 ─────────────────────────

export function explainUnscheduled(
  ctx: EngineContext,
  plan: PersonPlan,
  pickedSessions: Session[],
  owner?: "self" | "partner",
): UnscheduledMustFilm[] {
  const { compat, filmOrder } = ctx;
  const scheduledFilms = new Set(pickedSessions.map((s) => s.film_id));
  const mustLike = new Set<string>([...plan.prefs.filter((p) => p.tier === "must").map((p) => p.filmId), ...plan.gotFilms]);
  const out: UnscheduledMustFilm[] = [];
  const own = owner ? { owner } : {};
  for (const p of plan.prefs) {
    if (p.tier !== "must" || scheduledFilms.has(p.filmId)) continue;
    // 005：候選場次受限（只看這場／已選看優先場）的片，排不進去一律是「指定場次都排不進去」
    if (plan.restricted.has(p.filmId)) {
      out.push({ ...own, film_id: p.filmId, reason: "only_session_unfit", conflict_film_ids: null });
      continue;
    }
    const options = plan.watchable(p.filmId);
    if (options.length === 0) {
      out.push({ ...own, film_id: p.filmId, reason: "no_available_session", conflict_film_ids: null });
      continue;
    }
    const blockers = new Set<string>();
    let limitBlocked = false;
    for (const s of options) {
      const blocking = pickedSessions.filter((q) => !compat(s, q));
      if (blocking.length === 0) {
        limitBlocked = true;
        break;
      }
      for (const q of blocking) if (mustLike.has(q.film_id)) blockers.add(q.film_id);
    }
    if (limitBlocked || blockers.size === 0) {
      out.push({ ...own, film_id: p.filmId, reason: "daily_limit", conflict_film_ids: null });
    } else {
      const ids = [...blockers].sort((a, b) => filmOrder.get(a)! - filmOrder.get(b)!);
      out.push({ ...own, film_id: p.filmId, reason: "conflicts_with_must", conflict_film_ids: ids });
    }
  }
  return out;
}

// ───────────────────────── 個人排程 ─────────────────────────

/** 一個人的最佳影片集合（個人目標第 1～4 項） */
export function personalFilmSet(plan: PersonPlan): Set<string> {
  return bestFilmSet(plan).films;
}

/**
 * 個人排程。目標依序為：必看數、想看數、有空再看數、層內排序（各層排入影片的名次由小到大逐一比較）、★ 場次數；
 * 其餘同分固定為場次較早者。先求層級數最大值，再在其中取層內名次最佳的影片集合，最後挑場次最大化 ★。
 */
export function buildItinerary(catalog: Catalog, state: UserState): ScheduleResult {
  const ctx = makeContext(catalog);
  const plan = preparePerson(ctx, personInputOf(state));
  const set = personalFilmSet(plan);
  const { sessions } = assignSessions([plan], [set]);
  const sorted = [...sessions[0]].sort(
    (a, b) => sessionStartAbs(a) - sessionStartAbs(b) || (a.session_id < b.session_id ? -1 : 1),
  );
  const itinerary: ItineraryEntry[] = sorted.map((s) => ({
    session_id: s.session_id,
    tier: plan.tierOf.get(s.film_id)!,
    is_non_ticketed: s.marks.includes("non_ticketed"),
  }));
  return { itinerary, unscheduled: explainUnscheduled(ctx, plan, sorted) };
}
