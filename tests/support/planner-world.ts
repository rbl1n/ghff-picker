import type {
  Catalog,
  CinemaId,
  DayAvailability,
  DuoItineraryEntry,
  ItineraryEntry,
  PartnerData,
  UnscheduledMustFilm,
  UserState,
} from "../../src/domain/types";

/** 影廳 → 影城對照 */
export function cinemaOfVenue(venueName: string): CinemaId {
  if (venueName.includes("信義威秀")) return "xinyi_vieshow";
  if (venueName.includes("TITAN") || venueName.includes("松仁威秀")) return "songren_muvie";
  return "unknown";
}

export interface PlannerWorld {
  /** 場次快照 */
  catalog: Catalog | null;
  /** 使用者狀態（分層含層內名次、有空時段） */
  state: UserState | null;
  /** 最後一次排程結果；兩人模式 = 觀眾自己的行程（一起、觀眾自己）與觀眾自己的未排入必看片 */
  lastResult: { itinerary: ItineraryEntry[]; unscheduled: UnscheduledMustFilm[] } | null;
  /** 最後一次排程耗時（毫秒） */
  elapsedMs: number | null;
  /** 同伴資料（選配）：沒有 = 個人模式；有 = 兩人模式 */
  partner: PartnerData | null;
  /** 最近一次兩人行程（兩人模式；個人模式 = null） */
  lastDuo: { entries: DuoItineraryEntry[]; unscheduled: UnscheduledMustFilm[] } | null;
  /** 最近一次有空時段查詢（日期 → 有空區間的快照） */
  lastAvailability: DayAvailability[] | null;
  /** 排程前記下的雙方設定快照（JSON） */
  baseline: string | null;
}

/** 純兩人情境（Given 未建立場次表）使用的空場次快照 */
export const EMPTY_CATALOG: Catalog = {
  festival_year: 0,
  source_url: "",
  fetched_at: "",
  films: [],
  venues: [],
  sessions: [],
};

export function createPlannerWorld(): PlannerWorld {
  return {
    catalog: null,
    state: null,
    lastResult: null,
    elapsedMs: null,
    partner: null,
    lastDuo: null,
    lastAvailability: null,
    baseline: null,
  };
}

/** 個人排程／搶票清單的輸入狀態：世界以有空時段保存可看資料，產品碼直接讀取，不需轉換。 */
export function effectiveState(world: PlannerWorld): UserState {
  if (!world.state) throw new Error("world 缺少使用者狀態");
  return world.state;
}
