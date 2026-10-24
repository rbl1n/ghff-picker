// 台灣院線上映資訊（只用於顯示與使用者自行勾選，不影響排程與搶票）。
export type TheatricalStatus = "upcoming" | "released" | "likely" | "not_theatrical" | "unknown";

export interface TheatricalEntry {
  film_id: string;
  status: TheatricalStatus;
  distributor?: string;
  /** 台灣上映日（YYYY-MM-DD，或只到月）；upcoming／released 才有 */
  release_date?: string;
  /** 沒有確切日期的說明（如「2026 年底」）或非院線原因（如「Disney+ 串流」） */
  release_note?: string;
  source?: string;
}

export type TheatricalMap = ReadonlyMap<string, TheatricalEntry>;

/** 有效院線旗標：使用者手動設定優先，否則只有 upcoming（即將上映、之後還能在戲院看到）預設為開 */
export function isTheatrical(filmId: string, overrides: Record<string, boolean> | undefined, info: TheatricalMap): boolean {
  const o = overrides?.[filmId];
  if (typeof o === "boolean") return o;
  return info.get(filmId)?.status === "upcoming";
}

export function parseTheatrical(raw: unknown): TheatricalEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is TheatricalEntry => typeof r === "object" && r !== null && typeof (r as TheatricalEntry).film_id === "string" && typeof (r as TheatricalEntry).status === "string");
}
