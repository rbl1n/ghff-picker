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
export type UnscheduledReason = "no_available_session" | "conflicts_with_must" | "daily_limit" | "only_session_unfit";
/** 場次偏好標記（005）：優先 = 軟偏好；只看這場 = 硬限制 */
export type SessionPref = "prefer" | "only";
/** 取捨決定（005）：該片鎖定在自己的優先場，效果等同「只看這場」 */
export type PinnedChoice = "prefer_session";

export interface Film {
  film_id: string;
  title: string;
  runtime_min: number;
  rating: string;
  /** 紙本手冊目次表的頁碼（使用者口中的片號，如 "089"）；沒有對照到者未設 */
  catalog_no?: string;
  /** 短片單元（官網以【單元名】一列放映多部短片）：片名 = 單元名，shorts = 包含的短片（含各自的手冊頁碼）；一般影片沒有此欄位 */
  shorts?: FilmShort[];
}

export interface FilmShort {
  title: string;
  /** 這部短片自己的手冊頁碼；沒有對照到者未設 */
  catalog_no?: string;
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
  /** 層內名次（003）：1 = 該層最前；同層不重複、從 1 連續。舊資料未帶 = 依場次表影片順序（遷移規則） */
  tier_rank?: number;
}

/** 有空區間（003）：當日分鐘數，0–1440，end_min > start_min */
export interface AvailableInterval {
  start_min: number;
  end_min: number;
}

/**
 * 有空時段（003）：「這一天被自訂過」。沒有該日期的列 = 全天有空；
 * 有列但 intervals 為空 = 整天沒空。正規化：由早到晚、不重疊、不相鄰；恰為 00:00–24:00 時不保留該列。
 */
export interface DayAvailability {
  date: string;
  intervals: AvailableInterval[];
}

/** 行程場次的參與者（003）：self 只有自己、partner 只有同伴、together 一起 */
export type ItineraryParticipant = "self" | "partner" | "together";
export type PersonSide = "self" | "partner";

/** 001／002 的不可看時段（僅供讀取舊版資料遷移；003 起不再寫入，見 availability） */
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
  /** 舊版（schema_version 1、2）資料才有；003 起不再寫入 */
  unavailable_slots?: UnavailableSlot[];
  /** 有空時段（003）；未設 = 全天有空 */
  availability?: DayAvailability[];
  /** 不看（004）：選填；同伴不看 = 同伴不看這部片（沒有層級） */
  skipped_film_ids?: string[];
  /** 場次偏好（005）：session_id → 優先／只看這場；同伴的標記也用於排程 */
  session_marks?: Record<string, SessionPref>;
  /** 取捨決定（005）：film_id → 看自己的優先場 */
  pinned_choices?: Record<string, PinnedChoice>;
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
  /** 舊版（schema_version 1、2）資料才有；003 起不再寫入 */
  unavailable_slots?: UnavailableSlot[];
  /** 有空時段（003）；未設 = 全天有空 */
  availability?: DayAvailability[];
  /** 不看（004）：選填；與 film_preferences 互斥；沒有欄位或空陣列 = 沒有不看。不排程、不進搶票清單 */
  skipped_film_ids?: string[];
  /** 影片備註：film_id → 自己寫的文字；選填、空字串不保存。只屬於自己：分享連結帶著，但當作同伴加入時一律丟棄 */
  film_notes?: Record<string, string>;
  /** 場次偏好（005）：session_id → 優先／只看這場；選填、沒有標記時不寫欄位。分享連結帶著，當作同伴加入時一起帶入 */
  session_marks?: Record<string, SessionPref>;
  /** 取捨決定（005）：film_id → 看自己的優先場；等同該片「只看這場」限定在優先場。選填 */
  pinned_choices?: Record<string, PinnedChoice>;
  /** 插播（置頂）：層級 → 依序置頂的 film_id；永遠等於該層順序開頭連續一段，名次仍以 tier_rank 為準。選填；分享連結帶著，當作同伴加入時丟棄。不是 pinned_choices（場次取捨） */
  top_pins?: Partial<Record<Tier, string[]>>;
  /** 尚未分層就先勾的熱門：film_id 清單；選了層級時套用為 is_hot 並移除，標不看或取消勾選也移除。選填；分享連結帶著，當作同伴加入時丟棄 */
  pending_hot_film_ids?: string[];
  /** 院線標記：film_id → 使用者手動設定的旗標（選填）；沒有值時依 theatrical.json 的 status。只影響顯示與篩選；分享連結帶著，當作同伴加入時丟棄 */
  theatrical_overrides?: Record<string, boolean>;
  /** 保存版次：每次寫入 +1，用來偵測別的分頁已寫入較新的內容（舊資料沒有 = 0）；不進分享連結 */
  revision?: number;
  /** 寫入這份保存的建置版本編號（時間戳記）；比執行中版本新時，舊版分頁不得寫入。不進分享連結 */
  written_by_build?: number;
  ticket_marks: TicketMark[];
}

export interface ItineraryEntry {
  session_id: string;
  tier: Tier;
  is_non_ticketed: boolean;
  /** 個人模式 = 未設；兩人模式 = self / together（003） */
  participant?: ItineraryParticipant;
  /** 同伴的層級（003）；個人模式與 participant = self 時未設 */
  partner_tier?: Tier | null;
}

/** 兩人行程的一列（003）：tier 為自己的層級（participant = partner 時為 null），partner_tier 為同伴的層級 */
export interface DuoItineraryEntry {
  session_id: string;
  participant: ItineraryParticipant;
  tier: Tier | null;
  partner_tier: Tier | null;
  is_non_ticketed: boolean;
}

export interface UnscheduledMustFilm {
  /** 這部必看是誰的（003）；個人模式 = 未設（視為 self） */
  owner?: PersonSide;
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
  /** 兩人模式：一起 = 2、自己 = 1；個人模式 = null／未設（002、003） */
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
