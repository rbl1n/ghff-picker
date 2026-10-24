import type { Catalog, DuoItineraryEntry, ItineraryEntry, UnscheduledMustFilm, UserState } from "./types";
import { buildItinerary } from "./schedule";
import { scheduleDuo } from "./duo";
import { buildTradeoffs, type Tradeoff } from "./tradeoff";

export interface PlanResult {
  /** 自己的行程（個人模式即整份行程；兩人模式 = 一起與自己看的場次） */
  itinerary: ItineraryEntry[];
  /** 兩人模式的完整兩人行程；個人模式 = null */
  duo: DuoItineraryEntry[] | null;
  unscheduled: UnscheduledMustFilm[];
  /** 兩人模式的取捨卡片（005）；個人模式 = 空 */
  tradeoffs: Tradeoff[];
}

/** 畫面用的完整排程（個人或兩人，含取捨卡片）；純函式，主執行緒與 Web Worker 共用，相同輸入必得相同結果 */
export function computePlan(catalog: Catalog, input: UserState): PlanResult {
  if (input.partner) {
    const duo = scheduleDuo(catalog, input, input.partner);
    const mine: ItineraryEntry[] = duo.entries
      .filter((e) => e.participant !== "partner")
      .map((e) => ({ session_id: e.session_id, tier: e.tier!, is_non_ticketed: e.is_non_ticketed, participant: e.participant, partner_tier: e.partner_tier }));
    return { itinerary: mine, duo: duo.entries, unscheduled: duo.unscheduled, tradeoffs: buildTradeoffs(catalog, input, input.partner, duo) };
  }
  return { ...buildItinerary(catalog, input), duo: null, tradeoffs: [] };
}
