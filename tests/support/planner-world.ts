import type { Catalog, ItineraryEntry, UnscheduledMustFilm, UserState, CinemaId } from "../../src/domain/types";

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
}

export function createPlannerWorld(): PlannerWorld {
  return { catalog: null, state: null, lastResult: null, elapsedMs: null };
}
