import type {
  Catalog,
  DayAvailability,
  DuoItineraryEntry,
  FilmPreference,
  ItineraryEntry,
  PartnerData,
  Tier,
  UnscheduledMustFilm,
  UserState,
} from "../../src/domain/types";
import { buildItinerary } from "../../src/domain/schedule";
import { scheduleDuo } from "../../src/domain/duo";
import { buildTicketList } from "../../src/domain/tickets";
import { getCtx } from "./planner-a-helpers";
import { EMPTY_CATALOG, effectiveState, type PlannerWorld } from "./planner-world";

/** 取得（必要時建立）world 的同伴資料；呼叫即進入兩人模式。 */
export function ensurePartner(): PartnerData {
  const w = getCtx().world;
  if (!w.partner) {
    w.partner = { display_name: "同伴", daily_limit: null, film_preferences: [], unavailable_slots: [], availability: [] };
  }
  return w.partner;
}

/** 同伴可標不在場次表的影片：找不到片名時用合成 id（排程時會因快照沒有而被忽略）。 */
export function partnerFilmIdOf(title: string): string {
  const cat = getCtx().world.catalog ?? EMPTY_CATALOG;
  return cat.films.find((f) => f.title === title)?.film_id ?? `__not_in_catalog__:${title}`;
}

/** 純兩人情境可以沒有場次表：此時視為空快照（所有同伴影片都被忽略） */
export function catalogOrEmpty() {
  return getCtx().world.catalog ?? EMPTY_CATALOG;
}

// ───────── 層內名次（獨立於產品碼的測試端實作） ─────────

/** 把影片標到某層：同層內依呼叫順序排在最後；重標同一部先移除舊的；回傳名次已重編（每層 1 起連續）的新清單 */
export function upsertPreference(prefs: FilmPreference[], film_id: string, tier: Tier, is_hot: boolean): FilmPreference[] {
  const rest = prefs.filter((p) => p.film_id !== film_id);
  const next: FilmPreference[] = [...rest, { film_id, tier, is_hot, tier_rank: Number.MAX_SAFE_INTEGER }];
  return renumberTierRanks(next);
}

/** 每層依現有名次（同名次保持原順序）重編為 1, 2, 3… */
export function renumberTierRanks(prefs: FilmPreference[]): FilmPreference[] {
  const out = prefs.map((p) => ({ ...p }));
  for (const tier of ["must", "want", "maybe"] as Tier[]) {
    out
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.tier === tier)
      .sort((a, b) => (a.p.tier_rank ?? Number.MAX_SAFE_INTEGER) - (b.p.tier_rank ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
      .forEach((x, k) => {
        x.p.tier_rank = k + 1;
      });
  }
  return out;
}

/** 影片的層內名次（沒帶名次 = 排在最後） */
export function rankOf(prefs: FilmPreference[], filmId: string): number {
  return prefs.find((p) => p.film_id === filmId)?.tier_rank ?? Number.MAX_SAFE_INTEGER;
}

export { subtractAvailability, unavailableSlotsOf, availableForSession } from "./availability-oracle";

// ───────── 排程與搶票清單（個人／兩人共用） ─────────

export interface Computed {
  result: { itinerary: ItineraryEntry[]; unscheduled: UnscheduledMustFilm[] };
  duo: { entries: DuoItineraryEntry[]; unscheduled: UnscheduledMustFilm[] } | null;
}

/** 觀眾自己的行程列（一起、觀眾自己）→ 個人行程列 */
export function ownItineraryOf(entries: DuoItineraryEntry[]): ItineraryEntry[] {
  return entries
    .filter((e) => e.participant === "self" || e.participant === "together")
    .map((e) => ({
      session_id: e.session_id,
      tier: e.tier!,
      is_non_ticketed: e.is_non_ticketed,
      participant: e.participant,
      partner_tier: e.partner_tier,
    }));
}

/** 以目前世界狀態排程；有同伴資料 = 兩人行程，沒有 = 001 個人排程。不寫入 world。 */
export function computeSchedule(world: PlannerWorld, catalog: Catalog): Computed {
  const input: UserState = effectiveState(world);
  if (world.partner) {
    const duo = scheduleDuo(catalog, input, world.partner);
    return {
      result: {
        itinerary: ownItineraryOf(duo.entries),
        unscheduled: duo.unscheduled.filter((u) => (u.owner ?? "self") === "self"),
      },
      duo: { entries: duo.entries, unscheduled: duo.unscheduled },
    };
  }
  return { result: buildItinerary(catalog, input), duo: null };
}

/** 由目前行程產生搶票清單；兩人模式只含觀眾自己的行程並帶兩人行程與同伴資料 */
export function computeTicketList(world: PlannerWorld, catalog: Catalog) {
  if (!world.lastResult) throw new Error("尚未排程");
  const input = effectiveState(world);
  const duo = world.partner && world.lastDuo ? { entries: world.lastDuo.entries, partner: world.partner } : undefined;
  return buildTicketList(catalog, input, world.lastResult.itinerary, undefined, duo);
}

export type { UnscheduledMustFilm, DuoItineraryEntry };
