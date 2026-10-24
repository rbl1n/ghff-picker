import type { Catalog, ItineraryEntry, Session, Tier, UnscheduledMustFilm, UserState } from "./types";
import { areSessionsCompatibleEitherOrder, cinemaResolver } from "./compat";
import { isSessionWatchable } from "./availability";
import { sessionStartAbs } from "./time";

export interface ScheduleResult {
  itinerary: ItineraryEntry[];
  unscheduled: UnscheduledMustFilm[];
}

const TIER_RANK: Record<Tier, number> = { must: 0, want: 1, maybe: 2 };

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

type Objective = [number, number, number, number];

function compareObjective(a: Objective, b: Objective): number {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

interface Cand {
  session: Session;
  tier: Tier;
  star: boolean;
  /** 與此候選不相容的候選索引 */
  conflicts: number[];
}

interface FreeFilm {
  filmId: string;
  tier: Tier;
  cands: number[];
}

/**
 * 精確搜尋：以影片為單位選一場或不排，依 (必看數, 想看數, 有空再看數, ★數) 字典序取最大；
 * 分支界限以「剩餘影片中仍有可行場次者全部排入」為樂觀上界；同分時先找到者勝（候選依 ★、時間排序）。
 */
export function buildItinerary(catalog: Catalog, state: UserState): ScheduleResult {
  const cinemaOf = cinemaResolver(catalog);
  const limit = state.daily_limit;
  const filmOrder = new Map(catalog.films.map((f, i) => [f.film_id, i]));
  const missed = new Set(state.ticket_marks.filter((m) => m.result === "missed").map((m) => m.session_id));
  const sessionById = new Map(catalog.sessions.map((s) => [s.session_id, s]));
  const gotByFilm = new Map<string, Session>();
  for (const m of state.ticket_marks) {
    if (m.result !== "got") continue;
    const s = sessionById.get(m.session_id);
    if (s && !gotByFilm.has(s.film_id)) gotByFilm.set(s.film_id, s);
  }

  // 去重後的已分層影片（依場次表影片順序）
  const prefMap = new Map<string, Tier>();
  for (const p of state.film_preferences) if (filmOrder.has(p.film_id)) prefMap.set(p.film_id, p.tier);
  const prefs = [...prefMap.entries()]
    .map(([filmId, tier]) => ({ filmId, tier }))
    .sort((a, b) => filmOrder.get(a.filmId)! - filmOrder.get(b.filmId)!);

  const sessionsOf = new Map<string, Session[]>();
  for (const s of catalog.sessions) {
    const arr = sessionsOf.get(s.film_id);
    if (arr) arr.push(s);
    else sessionsOf.set(s.film_id, [s]);
  }

  const compat = (a: Session, b: Session) => areSessionsCompatibleEitherOrder(a, b, cinemaOf);

  // 已搶到的場次先固定
  const fixed: { session: Session; tier: Tier }[] = [];
  for (const p of prefs) {
    const g = gotByFilm.get(p.filmId);
    if (g) fixed.push({ session: g, tier: p.tier });
  }
  const fixedDay = new Map<string, number>();
  for (const f of fixed) fixedDay.set(f.session.date, (fixedDay.get(f.session.date) ?? 0) + 1);

  // 各影片的可看候選（不含 missed）
  const watchable = (filmId: string): Session[] =>
    (sessionsOf.get(filmId) ?? [])
      .filter((s) => !missed.has(s.session_id) && isSessionWatchable(s, state.unavailable_slots))
      .sort(compareSessionsPreferred);

  // 候選池（只含自由影片，已排除與固定場次衝堂、固定場次已佔滿當天者）
  const cands: Cand[] = [];
  const free: FreeFilm[] = [];
  for (const p of prefs) {
    if (gotByFilm.has(p.filmId)) continue;
    const idxs: number[] = [];
    for (const s of watchable(p.filmId)) {
      if (limit !== null && (fixedDay.get(s.date) ?? 0) >= limit) continue;
      if (!fixed.every((f) => compat(s, f.session))) continue;
      idxs.push(cands.length);
      cands.push({ session: s, tier: p.tier, star: isGuestSession(s), conflicts: [] });
    }
    if (idxs.length > 0) free.push({ filmId: p.filmId, tier: p.tier, cands: idxs });
  }
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      if (cands[i].session.film_id === cands[j].session.film_id) continue;
      if (!compat(cands[i].session, cands[j].session)) {
        cands[i].conflicts.push(j);
        cands[j].conflicts.push(i);
      }
    }
  }
  // 搜尋順序：層級、候選少者先、影片順序
  free.sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      a.cands.length - b.cands.length ||
      filmOrder.get(a.filmId)! - filmOrder.get(b.filmId)!,
  );

  const base: Objective = [0, 0, 0, 0];
  for (const f of fixed) {
    base[TIER_RANK[f.tier]]++;
    if (isGuestSession(f.session)) base[3]++;
  }

  // ---- DFS + branch and bound ----
  const blocked = new Array<number>(cands.length).fill(0);
  const dayCount = new Map(fixedDay);
  const chosen: number[] = [];
  const cur: Objective = [...base];
  let best: Objective | null = null;
  let bestChosen: number[] = [];

  const feasible = (c: number): boolean =>
    blocked[c] === 0 && (limit === null || (dayCount.get(cands[c].session.date) ?? 0) < limit);

  const bound = (from: number): Objective => {
    const b: Objective = [cur[0], cur[1], cur[2], cur[3]];
    for (let i = from; i < free.length; i++) {
      let any = false;
      let anyStar = false;
      for (const c of free[i].cands) {
        if (!feasible(c)) continue;
        any = true;
        if (cands[c].star) {
          anyStar = true;
          break;
        }
      }
      if (any) {
        b[TIER_RANK[free[i].tier]]++;
        if (anyStar) b[3]++;
      }
    }
    return b;
  };

  const dfs = (i: number): void => {
    if (i === free.length) {
      if (best === null || compareObjective(cur, best) > 0) {
        best = [cur[0], cur[1], cur[2], cur[3]];
        bestChosen = [...chosen];
      }
      return;
    }
    if (best !== null && compareObjective(bound(i), best) <= 0) return;
    const film = free[i];
    const rank = TIER_RANK[film.tier];
    for (const c of film.cands) {
      if (!feasible(c)) continue;
      const cand = cands[c];
      chosen.push(c);
      cur[rank]++;
      if (cand.star) cur[3]++;
      dayCount.set(cand.session.date, (dayCount.get(cand.session.date) ?? 0) + 1);
      for (const x of cand.conflicts) blocked[x]++;
      dfs(i + 1);
      for (const x of cand.conflicts) blocked[x]--;
      dayCount.set(cand.session.date, dayCount.get(cand.session.date)! - 1);
      if (cand.star) cur[3]--;
      cur[rank]--;
      chosen.pop();
    }
    dfs(i + 1); // 不排此片
  };
  dfs(0);

  // ---- 組合結果 ----
  const picked: { session: Session; tier: Tier }[] = [
    ...fixed,
    ...bestChosen.map((c) => ({ session: cands[c].session, tier: cands[c].tier })),
  ];
  picked.sort((a, b) => sessionStartAbs(a.session) - sessionStartAbs(b.session) || (a.session.session_id < b.session.session_id ? -1 : 1));
  const itinerary: ItineraryEntry[] = picked.map((p) => ({
    session_id: p.session.session_id,
    tier: p.tier,
    is_non_ticketed: p.session.marks.includes("non_ticketed"),
  }));

  // ---- 未排入必看片原因 ----
  const scheduledFilms = new Set(picked.map((p) => p.session.film_id));
  const mustLike = new Set<string>([...prefs.filter((p) => p.tier === "must").map((p) => p.filmId), ...gotByFilm.keys()]);
  const unscheduled: UnscheduledMustFilm[] = [];
  for (const p of prefs) {
    if (p.tier !== "must" || scheduledFilms.has(p.filmId)) continue;
    const options = watchable(p.filmId);
    if (options.length === 0) {
      unscheduled.push({ film_id: p.filmId, reason: "no_available_session", conflict_film_ids: null });
      continue;
    }
    const blockers = new Set<string>();
    let limitBlocked = false;
    for (const s of options) {
      const blocking = picked.filter((q) => !compat(s, q.session));
      if (blocking.length === 0) {
        limitBlocked = true;
        break;
      }
      for (const q of blocking) if (mustLike.has(q.session.film_id)) blockers.add(q.session.film_id);
    }
    if (limitBlocked || blockers.size === 0) {
      unscheduled.push({ film_id: p.filmId, reason: "daily_limit", conflict_film_ids: null });
    } else {
      const ids = [...blockers].sort((a, b) => filmOrder.get(a)! - filmOrder.get(b)!);
      unscheduled.push({ film_id: p.filmId, reason: "conflicts_with_must", conflict_film_ids: ids });
    }
  }
  return { itinerary, unscheduled };
}
