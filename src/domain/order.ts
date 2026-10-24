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
