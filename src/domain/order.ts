import type { FilmPreference, Tier } from "./types";

const TIERS: Tier[] = ["must", "want", "maybe"];

/** 層內排序（003）：名次 1 = 該層最前；未帶名次者排在該層最後，保持原順序 */
function sortedTier(prefs: FilmPreference[], tier: Tier): FilmPreference[] {
  return prefs
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.tier === tier)
    .sort((a, b) => (a.p.tier_rank ?? Number.MAX_SAFE_INTEGER) - (b.p.tier_rank ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((x) => x.p);
}

/** 每層依目前順序重編名次為 1, 2, 3…；保持原陣列順序 */
function renumber(prefs: FilmPreference[]): FilmPreference[] {
  const rank = new Map<FilmPreference, number>();
  for (const t of TIERS) sortedTier(prefs, t).forEach((p, k) => rank.set(p, k + 1));
  return prefs.map((p) => ({ ...p, tier_rank: rank.get(p)! }));
}

/** 新標記或改層的影片排到該層最後；回傳新的偏好清單（名次已重編） */
export function appendToTier(prefs: FilmPreference[], filmId: string, tier: Tier): FilmPreference[] {
  const existing = prefs.find((p) => p.film_id === filmId);
  const rest = prefs.filter((p) => p.film_id !== filmId);
  const next: FilmPreference[] = [
    ...rest,
    { film_id: filmId, tier, is_hot: existing?.is_hot ?? false, tier_rank: Number.MAX_SAFE_INTEGER },
  ];
  return renumber(next);
}

/** 在層內與相鄰名次互換（direction: -1 上移、+1 下移）；已在邊界時原樣回傳 */
export function moveWithinTier(prefs: FilmPreference[], filmId: string, direction: -1 | 1): FilmPreference[] {
  const target = prefs.find((p) => p.film_id === filmId);
  if (!target) return prefs;
  const order = sortedTier(prefs, target.tier);
  const idx = order.indexOf(target);
  const other = idx + direction;
  if (other < 0 || other >= order.length) return prefs;
  [order[idx], order[other]] = [order[other], order[idx]];
  const rank = new Map(order.map((p, k) => [p, k + 1] as const));
  return prefs.map((p) => (rank.has(p) ? { ...p, tier_rank: rank.get(p)! } : { ...p }));
}

/**
 * 拖曳（FR-305）：把影片放到指定層的指定位置（index 從 0 起，超出範圍夾到邊界）。
 * 同層 = 層內重排；跨層 = 改層並插入該位置。兩層名次皆重編為 1 起連續；熱門保留。找不到該片時原樣回傳。
 */
export function moveFilmTo(prefs: FilmPreference[], filmId: string, tier: Tier, index: number): FilmPreference[] {
  const target = prefs.find((p) => p.film_id === filmId);
  if (!target) return prefs;
  const moved: FilmPreference = { ...target, tier };
  const rest = prefs.filter((p) => p !== target);
  const dest = sortedTier(rest, tier);
  dest.splice(Math.min(Math.max(index, 0), dest.length), 0, moved);
  const rank = new Map<FilmPreference, number>();
  for (const t of TIERS) (t === tier ? dest : sortedTier(rest, t)).forEach((p, k) => rank.set(p, k + 1));
  return prefs.map((p) => {
    const next = p === target ? moved : p;
    return { ...next, tier_rank: rank.get(next)! };
  });
}

/** 舊資料初始化層內名次：每層依場次表影片順序指派 1, 2, 3…；不在場次表中的接在後面保持原順序 */
export function initTierRanks(prefs: FilmPreference[], catalogFilmIds: string[]): FilmPreference[] {
  const order = new Map(catalogFilmIds.map((id, i) => [id, i]));
  const rank = new Map<FilmPreference, number>();
  for (const t of TIERS) {
    prefs
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.tier === t)
      .sort((a, b) => (order.get(a.p.film_id) ?? Infinity) - (order.get(b.p.film_id) ?? Infinity) || a.i - b.i)
      .forEach((x, k) => rank.set(x.p, k + 1));
  }
  return prefs.map((p) => ({ ...p, tier_rank: rank.get(p)! }));
}

/** 取消標記：移除該片，所在層的名次遞補、仍從 1 連續 */
export function removeFromTier(prefs: FilmPreference[], filmId: string): FilmPreference[] {
  return renumber(prefs.filter((p) => p.film_id !== filmId));
}

/** 依層內名次由前到後列出某層的偏好 */
export function tierOrder(prefs: FilmPreference[], tier: Tier): FilmPreference[] {
  return sortedTier(prefs, tier);
}

/** 插播（置頂）：每層一份有序的片單，永遠等於該層順序的開頭連續一段 */
export type TopPins = Partial<Record<Tier, string[]>>;

/** 整理置頂：每層只保留「該層順序開頭連續、且在原置頂單內」的片；空層與空欄位移除（回傳 undefined = 沒有置頂） */
export function sanitizePins(prefs: FilmPreference[], pins: TopPins | undefined): TopPins | undefined {
  if (!pins) return undefined;
  const out: TopPins = {};
  for (const t of TIERS) {
    const set = new Set(pins[t] ?? []);
    const kept: string[] = [];
    for (const p of sortedTier(prefs, t)) {
      if (!set.has(p.film_id)) break;
      kept.push(p.film_id);
    }
    if (kept.length) out[t] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 置頂：排到該層已置頂的片之後（第一部 = 第 1 名，第二部 = 第 2 名…）；已置頂或找不到時原樣回傳 */
export function pinToTop(prefs: FilmPreference[], pins: TopPins | undefined, filmId: string): { prefs: FilmPreference[]; pins: TopPins } | null {
  const target = prefs.find((p) => p.film_id === filmId);
  if (!target) return null;
  const pinned = (pins?.[target.tier] ?? []).filter((id) => id !== filmId);
  if ((pins?.[target.tier] ?? []).includes(filmId)) return null;
  return { prefs: moveFilmTo(prefs, filmId, target.tier, pinned.length), pins: { ...pins, [target.tier]: [...pinned, filmId] } };
}

/** 取消置頂：從置頂單移除，放在其餘置頂的片之後，其他順序不變 */
export function unpin(prefs: FilmPreference[], pins: TopPins | undefined, filmId: string): { prefs: FilmPreference[]; pins: TopPins | undefined } | null {
  const target = prefs.find((p) => p.film_id === filmId);
  if (!target || !(pins?.[target.tier] ?? []).includes(filmId)) return null;
  const rest = (pins![target.tier] ?? []).filter((id) => id !== filmId);
  const next = moveFilmTo(prefs, filmId, target.tier, rest.length);
  return { prefs: next, pins: sanitizePins(next, { ...pins, [target.tier]: rest }) };
}

/**
 * 拖曳後重算置頂：被拖的片若原本沒置頂、放進置頂區中間（後面還有置頂的片）就變成置頂；
 * 原本置頂的片被拖到未置頂的片後面就取消。換層一律先移除原層置頂。
 */
export function pinsAfterDrag(prefs: FilmPreference[], pins: TopPins | undefined, draggedId: string): TopPins | undefined {
  if (!pins) return undefined;
  const dragged = prefs.find((p) => p.film_id === draggedId);
  const base: TopPins = {};
  for (const t of TIERS) {
    const list = (pins[t] ?? []).filter((id) => id !== draggedId || dragged?.tier === t);
    if (list.length) base[t] = list;
  }
  if (!dragged) return sanitizePins(prefs, base);
  const t = dragged.tier;
  const old = base[t] ?? [];
  if (old.includes(draggedId) || old.length === 0) return sanitizePins(prefs, base);
  const order = sortedTier(prefs, t).map((p) => p.film_id);
  const idx = order.indexOf(draggedId);
  const pinnedAfter = old.some((id) => order.indexOf(id) > idx);
  return sanitizePins(prefs, pinnedAfter ? { ...base, [t]: [...old, draggedId] } : base);
}
