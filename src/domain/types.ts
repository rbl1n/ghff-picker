// 型別依 specs/truth/data/data-model.dbml。時間：date = YYYY-MM-DD，分鐘數 = 自當日 00:00 起算。

export type CinemaId = "xinyi_vieshow" | "songren_muvie" | "unknown";
export type SessionMark =
  | "guest_attending"
  | "mandarin_no_subtitle"
  | "no_english_subtitle"
  | "non_ticketed"
  | "priority_screening";
export type Tier = "must" | "want" | "maybe";
export type TicketResult = "pending" | "got" | "missed";
export type UnscheduledReason = "no_available_session" | "conflicts_with_must" | "daily_limit";

export interface Film {
  film_id: string;
  title: string;
  runtime_min: number;
  rating: string;
}

export interface Venue {
  venue_name: string;
  cinema: CinemaId;
}
export type Cinema = CinemaId;

export interface Session {
  session_id: string;
  film_id: string;
  date: string;
  start_min: number;
  /** 可 > 1440 表示跨午夜 */
  end_min: number;
  venue_name: string;
  marks: SessionMark[];
}

export interface Catalog {
  festival_year: number;
  source_url: string;
  fetched_at: string;
  films: Film[];
  venues: Venue[];
  sessions: Session[];
}

export interface FilmPreference {
  film_id: string;
  tier: Tier;
  is_hot: boolean;
}

export interface UnavailableSlot {
  date: string;
  /** null 搭配 end_min null = 整天不可看 */
  start_min: number | null;
  end_min: number | null;
}

/** 搶票標記（ticket_marks） */
export interface TicketMark {
  session_id: string;
  result: TicketResult;
}

/** 同伴資料（partner 與其子表；002）。最多一位。 */
export interface PartnerData {
  display_name: string;
  daily_limit: number | null;
  film_preferences: FilmPreference[];
  unavailable_slots: UnavailableSlot[];
}

export interface UserState {
  schema_version: number;
  /** 自己的顯示名稱；null／未設 = 個人模式且從未設定（002） */
  self_name?: string | null;
  /** 同伴；null／未設 = 個人模式（002） */
  partner?: PartnerData | null;
  daily_limit: number | null;
  manual_order: string[] | null;
  updated_at: string;
  film_preferences: FilmPreference[];
  unavailable_slots: UnavailableSlot[];
  ticket_marks: TicketMark[];
}

export interface ItineraryEntry {
  session_id: string;
  tier: Tier;
  is_non_ticketed: boolean;
}

export interface UnscheduledMustFilm {
  film_id: string;
  reason: UnscheduledReason;
  conflict_film_ids: string[] | null;
}

export interface TicketListItem {
  film_id: string;
  order: number;
  current_session_id: string;
  backup_session_ids: string[];
  exhausted: boolean;
  /** 兩人模式 = 2；個人模式 = null／未設（002） */
  ticket_quantity?: number | null;
}

/** 分享連結種類（002） */
export type ShareKind = "personal" | "merged";

/** 分享連結內容（不落地；002） */
export interface SharePayload {
  kind: ShareKind;
  schema_version: number;
  sender_name?: string | null;
  state: UserState;
}

/** 只有單方標記而不排入的影片數（衍生；002） */
export interface SingleSideCounts {
  self: number;
  partner: number;
}

/** 兩人合併結果（衍生、不保存；002）。film_preferences 只含共同影片，tier 取高、is_hot 任一。 */
export interface MergedView {
  film_preferences: FilmPreference[];
  /** 兩人不可看時段的聯集（原樣保留，不合併區間） */
  unavailable_slots: UnavailableSlot[];
  /** 有設定者最小；皆未設定 = null */
  daily_limit: number | null;
  single_side_counts: SingleSideCounts;
}
