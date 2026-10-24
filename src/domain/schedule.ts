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
import { Budget, addEdge, addResource, components, createGraph, fullMask, solveMis, useResource, type MisGraph } from "./mis";

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
  /** 輸入內容指紋（與是誰無關）：決定兩人頂點順序，也是個人最佳的快取鍵 */
  sig: string;
  catalog: Catalog;
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
  const sig = JSON.stringify([
    prefList.map((p) => [p.film_id, p.tier, pos.get(p.film_id)]),
    input.availability,
    limit,
    input.ticket_marks,
    Object.entries(input.session_marks ?? {}).sort(),
    Object.entries(input.pinned_choices ?? {}).sort(),
  ]);
  return { limit, cands, fixed, free, prefs, fixedDay, base, gotFilms: new Set(gotByFilm.keys()), watchable, tierOf, restricted, marks, sig, catalog };
}

type Counts = [number, number, number];

// ───────────────────────── 求解器共用：場次選擇圖 ─────────────────────────

/** 層級權重（字典序：必看 > 想看 > 有空再看；每層影片數不超過 1023） */
const TIER_WEIGHT = [1024 * 1024, 1024, 1];
/** 決定「已收進的影片全部排入」時加在這些影片頂點上的獎勵，必須大於層級權重的總和 */
const COMMIT_BONUS = 2 ** 30;

/**
 * 個人排程的節點預算（決定性，與時間無關）。一般資料（含 60 部以上、時段受限）只用到零頭；
 * 預算只在極端稠密的輸入才會用完，此時不證明最佳，改回傳目前最佳解（貪婪解為起點）。
 */
export const PERSONAL_NODE_BUDGET = 150_000;
export const PERSONAL_NODE_BUDGET_PER_CALL = 50_000;
/** 場次指派（個人／兩人）的節點預算 */
export const ASSIGN_NODE_BUDGET = 200_000;
export const ASSIGN_NODE_BUDGET_PER_CALL = 100_000;
/** 同分偏好（場次較早者）的小預算 */
export const ASSIGN_TIE_NODE_BUDGET = 30_000;
export const ASSIGN_TIE_NODE_BUDGET_PER_CALL = 8_000;

interface PersonGraph {
  g: MisGraph;
  /** 頂點 -> plan.cands 索引 */
  vCand: number[];
  /** 頂點 -> plan.free 索引 */
  vFilm: number[];
  filmVerts: number[][];
}

/** 頂點 = 非固定影片的候選場次；邊 = 衝堂或同一部片；資源 = 每日上限 */
function buildPersonGraph(plan: PersonPlan): PersonGraph {
  const vCand: number[] = [];
  const vFilm: number[] = [];
  const filmVerts: number[][] = plan.free.map(() => []);
  const vOfCand = new Map<number, number>();
  plan.free.forEach((f, i) => {
    for (const c of f.cands) {
      vOfCand.set(c, vCand.length);
      filmVerts[i].push(vCand.length);
      vCand.push(c);
      vFilm.push(i);
    }
  });
  const g = createGraph(vCand.length);
  vCand.forEach((c, v) => {
    for (const j of plan.cands[c].conflicts) {
      const u = vOfCand.get(j);
      if (u !== undefined && u > v) addEdge(g, v, u);
    }
  });
  for (const vs of filmVerts) for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) addEdge(g, vs[a], vs[b]);
  if (plan.limit !== null) {
    const byDate = new Map<string, number>();
    vCand.forEach((c, v) => {
      const date = plan.cands[c].session.date;
      let r = byDate.get(date);
      if (r === undefined) {
        r = addResource(g, plan.limit!, plan.fixedDay.get(date) ?? 0);
        byDate.set(date, r);
      }
      useResource(g, v, r);
    });
  }
  return { g, vCand, vFilm, filmVerts };
}

export interface PersonalSolution {
  /** 層級數（含已搶到固定的影片）：必看、想看、有空再看 */
  counts: Counts;
  /** 個人最佳的影片集合（不含已搶到固定的影片） */
  films: Set<string>;
  /** 影片 -> 一組可行的候選索引（plan.cands）；供場次指派當起始解 */
  pick: Map<string, number>;
}

function tierWeights(plan: PersonPlan, pg: PersonGraph): number[] {
  return pg.vFilm.map((fi) => TIER_WEIGHT[TIER_RANK[plan.free[fi].tier]]);
}

function solvePersonal(plan: PersonPlan, withRanks: boolean): PersonalSolution {
  const pg = buildPersonGraph(plan);
  const { g } = pg;
  const w = tierWeights(plan, pg);
  const budget = new Budget(PERSONAL_NODE_BUDGET, PERSONAL_NODE_BUDGET_PER_CALL);
  const counts: Counts = [...plan.base];
  const films = new Set<string>();
  const pick = new Map<string, number>();
  const comps = components(g, fullMask(g));
  const tierDigits = [0, 1, 2].map((t) => ({ w: pg.vFilm.map((fi) => (TIER_RANK[plan.free[fi].tier] === t ? 1 : 0)), mult: TIER_WEIGHT[t] }));
  for (const mask of comps) {
    // 第 1～3 項：層級數（字典序）最大
    const first = solveMis(g, w, mask, budget, undefined, [], compGroups(pg, mask), tierDigits);
    for (const v of first.set) counts[TIER_RANK[plan.free[pg.vFilm[v]].tier]]++;
    if (!withRanks) continue;
    // 第 4 項：層內名次。依 (層級, 名次) 逐片「能排就排」，可行條件是已收進的全部排入後仍湊得出最大層級數
    const filmIdx = [...new Set(bitsToList(mask).map((v) => pg.vFilm[v]))].sort((a, b) => {
      const fa = plan.free[a];
      const fb = plan.free[b];
      return TIER_RANK[fa.tier] - TIER_RANK[fb.tier] || fa.pos - fb.pos || fa.order - fb.order;
    });
    const committed = new Set<number>();
    let witness = first.set;
    let witnessFilms = new Set(witness.map((v) => pg.vFilm[v]));
    for (const fi of filmIdx) {
      if (witnessFilms.has(fi)) {
        committed.add(fi);
        continue;
      }
      const w2 = w.slice();
      const bonus = w.map(() => 0);
      for (const v of bitsToList(mask)) {
        if (committed.has(pg.vFilm[v]) || pg.vFilm[v] === fi) {
          w2[v] += COMMIT_BONUS;
          bonus[v] = 1;
        }
      }
      const target = (committed.size + 1) * COMMIT_BONUS + first.weight;
      const res = solveMis(g, w2, mask, budget, target, [witness], compGroups(pg, mask), [...tierDigits, { w: bonus, mult: COMMIT_BONUS }]);
      if (res.weight >= target) {
        committed.add(fi);
        witness = res.set;
        witnessFilms = new Set(witness.map((v) => pg.vFilm[v]));
      }
    }
    for (const v of witness) {
      const fi = pg.vFilm[v];
      if (!committed.has(fi)) continue;
      pick.set(plan.free[fi].filmId, pg.vCand[v]);
    }
    for (const fi of committed) films.add(plan.free[fi].filmId);
  }
  return { counts, films, pick };
}

function compGroups(pg: PersonGraph, mask: Uint32Array): number[][] {
  const inMask = new Set(bitsToList(mask));
  return pg.filmVerts.map((vs) => vs.filter((v) => inMask.has(v))).filter((vs) => vs.length > 0);
}

function bitsToList(m: Uint32Array): number[] {
  const out: number[] = [];
  for (let wi = 0; wi < m.length; wi++) {
    for (let b = 0; b < 32; b++) if (m[wi] & (1 << b)) out.push((wi << 5) + b);
  }
  return out;
}

/** 層級數最大值：必看數、想看數、有空再看數的字典序最大值（含已搶到固定的影片） */
export function bestCounts(plan: PersonPlan): Counts {
  return solvePersonal(plan, false).counts;
}

const solutionCache = new WeakMap<Catalog, Map<string, PersonalSolution>>();

/**
 * 個人目標第 1～4 項：先求層級數最大值，再在其中取層內排序最佳的影片集合。
 * 層內排序（各層排入影片的名次由小到大逐一比較）在層級數相同時等價於：
 * 依 (層級, 層內名次) 逐片「能排就排」；可行條件是「已收進的影片全部排入後，仍能湊成最大層級數」。
 * 同一輸入的結果會快取（取捨重跑時，另一個人的個人最佳不必重算）。
 */
export function personalSolution(plan: PersonPlan): PersonalSolution {
  let perCatalog = solutionCache.get(plan.catalog);
  if (!perCatalog) {
    perCatalog = new Map();
    solutionCache.set(plan.catalog, perCatalog);
  }
  const hit = perCatalog.get(plan.sig);
  if (hit) return hit;
  const sol = solvePersonal(plan, true);
  if (perCatalog.size > 64) perCatalog.clear();
  perCatalog.set(plan.sig, sol);
  return sol;
}

export interface FilmSetResult {
  counts: Counts;
  films: Set<string>;
}

export function bestFilmSet(plan: PersonPlan): FilmSetResult {
  const { counts, films } = personalSolution(plan);
  return { counts, films };
}

// ───────────────────────── 場次指派（第 5 項 ★；兩人時先比一起看） ─────────────────────────

export interface Assignment {
  /** 各人排入的場次 */
  sessions: Session[][];
  /** 兩人排入同一場次的數量（單人 = 0） */
  together: number;
  /** 排在優先場的影片數（各人加總；005） */
  prefs: number;
  stars: number;
}

// 場次指派權重（高位 -> 低位）：每個 (人, 片) 都要排到 > 一起看 > 優先場 > ★ > 場次較前（同分時的固定偏好）
const W_TIE = 1;
const W_STAR = 16384;
const W_PREF = W_STAR * 1024;
const W_TOGETHER = W_PREF * 1024;
const W_COVER = W_TOGETHER * 1024;
/** 同分偏好：候選順序（★ 先、較早先）越前面越好；超過這個名次不再區分 */
const TIE_RANKS = 15;

interface AVertex {
  /** [人, plan.cands 索引]；已固定的一側不列入 */
  touch: [number, number][];
  together: boolean;
  film: number;
}

/**
 * 每人已決定要排的影片（sets，不含固定影片，固定影片一律排入）：
 * 單人 -> 先最大化優先場影片數（005），再最大化 ★ 場次數；兩人 -> 先最大化一起看的場次數，再最大化優先場影片數合計（005），最後最大化兩人 ★ 合計。
 * 同分時偏好候選順序較前者（★、場次較早）。hints：各人的一組可行場次（個人求解的見證解），當作起始解。
 * 兩人的頂點順序以個人輸入的內容指紋排定（不看誰是 self），所以兩台裝置、或對調兩人，算出的是同一份行程。
 */
export function assignSessions(plans: PersonPlan[], sets: Set<string>[], hints: (Map<string, number> | undefined)[] = []): Assignment {
  // 內部人序：依輸入指紋排序（與 self/partner 無關）
  const ord = plans.map((_, i) => i).sort((a, b) => (plans[a].sig < plans[b].sig ? -1 : plans[a].sig > plans[b].sig ? 1 : a - b));
  const P = ord.map((i) => plans[i]);
  const S = ord.map((i) => sets[i]);
  const H = ord.map((i) => hints[i]);

  // 影片（兩人聯集），依場次表影片順序
  interface JFilm {
    filmId: string;
    order: number;
    per: (number[] | null)[];
  }
  const filmMap = new Map<string, JFilm>();
  P.forEach((plan, p) => {
    const add = (f: PFilm) => {
      let jf = filmMap.get(f.filmId);
      if (!jf) {
        jf = { filmId: f.filmId, order: f.order, per: P.map(() => null) };
        filmMap.set(f.filmId, jf);
      }
      jf.per[p] = f.cands;
    };
    for (const f of plan.fixed) add(f);
    for (const f of plan.free) if (S[p].has(f.filmId)) add(f);
  });
  const films = [...filmMap.values()].sort((a, b) => a.order - b.order);

  const verts: AVertex[] = [];
  const touching: Map<number, number[]>[] = P.map(() => new Map());
  const filmVerts: number[][] = films.map(() => []);
  const sid = (p: number, c: number) => P[p].cands[c].session.session_id;
  const addVertex = (film: number, touch: [number, number][], together: boolean) => {
    const v = verts.length;
    verts.push({ touch, together, film });
    filmVerts[film].push(v);
    for (const [p, c] of touch) {
      const m = touching[p].get(c);
      if (m) m.push(v);
      else touching[p].set(c, [v]);
    }
  };
  const sameSession: [number, number][][] = []; // 頂點對：同片兩人各自排同一場（禁止，必須用「一起看」頂點）
  films.forEach((jf, fi) => {
    const lists = jf.per;
    if (P.length === 2 && lists[0] && lists[1]) {
      const [l0, l1] = lists;
      for (const a of l0) {
        for (const b of l1) {
          if (sid(0, a) !== sid(1, b)) continue;
          const fa = P[0].cands[a].fixed;
          const fb = P[1].cands[b].fixed;
          if (fa && fb) continue;
          const touch: [number, number][] = [];
          if (!fa) touch.push([0, a]);
          if (!fb) touch.push([1, b]);
          addVertex(fi, touch, true);
        }
      }
      const fixedSession = [0, 1].map((p) => (P[p].cands[lists[p]![0]].fixed ? sid(p, lists[p]![0]) : null));
      for (let p = 0; p < 2; p++) {
        for (const c of lists[p]!) {
          if (P[p].cands[c].fixed) continue;
          if (fixedSession[1 - p] !== null && fixedSession[1 - p] === sid(p, c)) continue;
          addVertex(fi, [[p, c]], false);
        }
      }
    } else {
      for (let p = 0; p < P.length; p++) {
        if (!lists[p]) continue;
        for (const c of lists[p]!) if (!P[p].cands[c].fixed) addVertex(fi, [[p, c]], false);
      }
    }
  });
  void sameSession;

  const g = createGraph(verts.length);
  // 同一部片：碰到同一個 (人, 片) 的頂點互斥；兩人各自排同一場次也互斥（要一起看就用「一起看」頂點）
  filmVerts.forEach((vs) => {
    for (let a = 0; a < vs.length; a++) {
      for (let b = a + 1; b < vs.length; b++) {
        const ta = verts[vs[a]].touch;
        const tb = verts[vs[b]].touch;
        let clash = ta.some(([p]) => tb.some(([q]) => p === q));
        if (!clash && !verts[vs[a]].together && !verts[vs[b]].together) {
          clash = sid(ta[0][0], ta[0][1]) === sid(tb[0][0], tb[0][1]);
        }
        if (clash) addEdge(g, vs[a], vs[b]);
      }
    }
  });
  // 各人的衝堂
  P.forEach((plan, p) => {
    for (const [c, vs] of touching[p]) {
      for (const j of plan.cands[c].conflicts) {
        if (j < c) continue;
        const us = touching[p].get(j);
        if (!us) continue;
        for (const v of vs) for (const u of us) addEdge(g, v, u);
      }
    }
  });
  // 每日上限（每人各自）
  P.forEach((plan, p) => {
    if (plan.limit === null) return;
    const byDate = new Map<string, number>();
    verts.forEach((vx, v) => {
      for (const [q, c] of vx.touch) {
        if (q !== p) continue;
        const date = plan.cands[c].session.date;
        let r = byDate.get(date);
        if (r === undefined) {
          r = addResource(g, plan.limit!, plan.fixedDay.get(date) ?? 0);
          byDate.set(date, r);
        }
        useResource(g, v, r);
      }
    });
  });

  // 權重
  const rankIn = (p: number, c: number, fi: number): number => Math.max(0, TIE_RANKS - Math.max(0, (films[fi].per[p] ?? []).indexOf(c)));
  const w = verts.map((vx) => {
    let x = W_COVER * vx.touch.length;
    if (vx.together) x += W_TOGETHER;
    for (const [p, c] of vx.touch) {
      const cand = P[p].cands[c];
      if (cand.pref) x += W_PREF;
      if (cand.star) x += W_STAR;
    }
    return x;
  });
  // 同分偏好另成一個較小的第二階段：主要目標證明最佳後，再用小預算改善「候選順序較前」
  const wTie = w.map((x, v) => x + verts[v].touch.reduce((acc, [p, c]) => acc + W_TIE * rankIn(p, c, verts[v].film), 0));

  // 起始解：個人見證解（各人各自排）；兩人排到同一場的片改用「一起看」頂點
  const seed: number[] = [];
  {
    const pickOf = (p: number, filmId: string): number | undefined => H[p]?.get(filmId);
    for (const [fi, jf] of films.entries()) {
      const picks = P.map((_, p) => (jf.per[p] ? pickOf(p, jf.filmId) : undefined));
      const together = picks.length === 2 && picks[0] !== undefined && picks[1] !== undefined && sid(0, picks[0]) === sid(1, picks[1]);
      if (together) {
        const v = filmVerts[fi].find((x) => verts[x].together && verts[x].touch.some(([p, c]) => p === 0 && c === picks[0]) && verts[x].touch.some(([p, c]) => p === 1 && c === picks[1]));
        if (v !== undefined) seed.push(v);
        continue;
      }
      picks.forEach((c, p) => {
        if (c === undefined) return;
        const v = touching[p].get(c)?.find((x) => !verts[x].together);
        if (v !== undefined) seed.push(v);
      });
    }
  }

  // 每個 (人, 片) 最多排一場：頂點依碰到的 (人, 片) 分組（一起看的頂點同時屬於兩組）
  const groupMap = new Map<string, number[]>();
  verts.forEach((vx, v) => {
    for (const [p, c] of vx.touch) {
      const key = `${p}:${P[p].cands[c].filmId}`;
      const arr = groupMap.get(key);
      if (arr) arr.push(v);
      else groupMap.set(key, [v]);
    }
  });
  const groupsOfComp = (comp: number[]): number[][] => {
    const inComp = new Set(comp);
    return [...groupMap.values()].map((vs) => vs.filter((v) => inComp.has(v))).filter((vs) => vs.length > 0);
  };
  const digitW = (f: (vx: AVertex) => number) => verts.map(f);
  const tieDigit = verts.map((vx) => vx.touch.reduce((acc, [p, c]) => acc + rankIn(p, c, vx.film), 0));
  const digits = [
    { w: digitW((vx) => vx.touch.length), mult: W_COVER },
    { w: digitW((vx) => (vx.together ? 1 : 0)), mult: W_TOGETHER },
    { w: digitW((vx) => vx.touch.filter(([p, c]) => P[p].cands[c].pref).length), mult: W_PREF },
    { w: digitW((vx) => vx.touch.filter(([p, c]) => P[p].cands[c].star).length), mult: W_STAR },
  ];
  const budget = new Budget(ASSIGN_NODE_BUDGET, ASSIGN_NODE_BUDGET_PER_CALL);
  const tieBudget = new Budget(ASSIGN_TIE_NODE_BUDGET, ASSIGN_TIE_NODE_BUDGET_PER_CALL);
  const chosen: number[] = [];
  for (const mask of components(g, fullMask(g))) {
    const comp = bitsToList(mask);
    const compSet = new Set(comp);
    const groups = groupsOfComp(comp);
    const main = solveMis(g, w, mask, budget, undefined, [seed.filter((v) => compSet.has(v))], groups, digits);
    const polished = solveMis(g, wTie, mask, tieBudget, undefined, [main.set], groups, [...digits, { w: tieDigit, mult: W_TIE }]);
    chosen.push(...polished.set);
  }

  const picked: Session[][] = P.map(() => []);
  const seen: Set<number>[] = P.map(() => new Set());
  const take = (p: number, c: number) => {
    if (seen[p].has(c)) return;
    seen[p].add(c);
    picked[p].push(P[p].cands[c].session);
  };
  P.forEach((plan, p) => plan.fixed.forEach((f) => take(p, f.cands[0])));
  for (const v of chosen) for (const [p, c] of verts[v].touch) take(p, c);
  // 一起看的場次若一側已固定：另一側的頂點已經涵蓋；兩側皆固定：由固定影片帶入

  let together = 0;
  let prefs = 0;
  let stars = 0;
  if (P.length === 2) {
    const ids = new Set(picked[0].map((s) => s.session_id));
    together = picked[1].filter((s) => ids.has(s.session_id)).length;
  }
  P.forEach((plan, p) => {
    for (const c of seen[p]) {
      if (plan.cands[c].pref) prefs++;
      if (plan.cands[c].star) stars++;
    }
  });
  const sessions: Session[][] = plans.map(() => []);
  ord.forEach((orig, q) => {
    sessions[orig] = picked[q];
  });
  return { sessions, together, prefs, stars };
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
  return personalSolution(plan).films;
}

/**
 * 個人排程。目標依序為：必看數、想看數、有空再看數、層內排序（各層排入影片的名次由小到大逐一比較）、★ 場次數；
 * 其餘同分固定為場次較早者。先求層級數最大值，再在其中取層內名次最佳的影片集合，最後挑場次最大化 ★。
 */
export function buildItinerary(catalog: Catalog, state: UserState): ScheduleResult {
  const ctx = makeContext(catalog);
  const plan = preparePerson(ctx, personInputOf(state));
  const sol = personalSolution(plan);
  const { sessions } = assignSessions([plan], [sol.films], [sol.pick]);
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
