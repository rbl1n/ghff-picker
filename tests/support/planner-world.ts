import type { Catalog, ItineraryEntry, MergedView, PartnerData, UnscheduledMustFilm, UserState, CinemaId } from "../../src/domain/types";
import { mergePartner } from "../../src/domain/merge";

/** 影廳 → 影城對照 */
export function cinemaOfVenue(venueName: string): CinemaId {
  if (venueName.includes("信義威秀")) return "xinyi_vieshow";
  if (venueName.includes("TITAN") || venueName.includes("松仁威秀")) return "songren_muvie";
  return "unknown";
}

export interface PlannerWorld {
  /** 場次快照 */
  catalog: Catalog | null;
  /** 使用者狀態 */
  state: UserState | null;
  /** 最後一次排程結果 */
  lastResult: { itinerary: ItineraryEntry[]; unscheduled: UnscheduledMustFilm[] } | null;
  /** 最後一次排程耗時（毫秒） */
  elapsedMs: number | null;
  /** 同伴資料（選配）：沒有 = 個人模式；有 = 兩人模式 */
  partner: PartnerData | null;
  /** 最近一次兩人合併結果 */
  lastMerged: MergedView | null;
  /** 查看合併結果前記下的雙方設定快照（JSON） */
  baseline: string | null;
}

/** 純合併情境（Given 未建立場次表）使用的空場次快照 */
export const EMPTY_CATALOG: Catalog = {
  festival_year: 0,
  source_url: "",
  fetched_at: "",
  films: [],
  venues: [],
  sessions: [],
};

export function createPlannerWorld(): PlannerWorld {
  return { catalog: null, state: null, lastResult: null, elapsedMs: null, partner: null, lastMerged: null, baseline: null };
}

/**
 * 排程／搶票清單的輸入狀態。
 * 沒有同伴：原樣回傳自己的使用者狀態（同一個物件，001 行為不變）。
 * 有同伴：以合併結果取代分層、不可看時段、每日上限；手動順序與搶票標記仍是自己的。
 */
export function effectiveState(world: PlannerWorld): UserState {
  if (!world.state) throw new Error("world 缺少使用者狀態");
  if (!world.partner) return world.state;
  const merged = mergePartner(world.catalog ?? EMPTY_CATALOG, world.state, world.partner);
  return {
    ...world.state,
    film_preferences: merged.film_preferences,
    unavailable_slots: merged.unavailable_slots,
    daily_limit: merged.daily_limit,
  };
}
