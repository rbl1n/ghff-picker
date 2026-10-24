import type { Catalog, FilmPreference, MergedView, PartnerData, SingleSideCounts, Tier, UserState } from "./types";

const TIER_RANK: Record<Tier, number> = { must: 0, want: 1, maybe: 2 };

function higherTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function snapshotFilmIds(catalog: Catalog): Set<string> {
  return new Set(catalog.films.map((f) => f.film_id));
}

/** 兩人合併（FR-205～FR-208）。純函式；不修改輸入。 */
export function mergePartner(catalog: Catalog, self: UserState, partner: PartnerData): MergedView {
  const inCatalog = snapshotFilmIds(catalog);
  const partnerPrefs = new Map(partner.film_preferences.map((p) => [p.film_id, p]));
  const film_preferences: FilmPreference[] = [];
  for (const mine of self.film_preferences) {
    const theirs = partnerPrefs.get(mine.film_id);
    if (!theirs || !inCatalog.has(mine.film_id)) continue;
    film_preferences.push({
      film_id: mine.film_id,
      tier: higherTier(mine.tier, theirs.tier),
      is_hot: mine.is_hot || theirs.is_hot,
    });
  }
  const limits = [self.daily_limit, partner.daily_limit].filter((l): l is number => l !== null && l !== undefined);
  return {
    film_preferences,
    unavailable_slots: [...self.unavailable_slots, ...partner.unavailable_slots].map((s) => ({ ...s })),
    daily_limit: limits.length ? Math.min(...limits) : null,
    single_side_counts: singleSideCounts(catalog, self, partner),
  };
}

/** 只有單方標記而不排入的影片數（FR-210）。 */
export function singleSideCounts(catalog: Catalog, self: UserState, partner: PartnerData): SingleSideCounts {
  const inCatalog = snapshotFilmIds(catalog);
  const mine = new Set(self.film_preferences.map((p) => p.film_id));
  const theirs = new Set(partner.film_preferences.map((p) => p.film_id));
  const only = (a: Set<string>, b: Set<string>) => [...a].filter((id) => !b.has(id) && inCatalog.has(id)).length;
  return { self: only(mine, theirs), partner: only(theirs, mine) };
}
