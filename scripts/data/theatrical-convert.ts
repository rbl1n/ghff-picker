// 研究產出（含 evidence 等多餘欄位）→ public/data/theatrical.json 的精簡格式。
import type { TheatricalEntry, TheatricalStatus } from "../../src/domain/theatrical";

/** 以此日為界：上映日在此日之前 = released，之後或尚無確切日期的預告 = upcoming */
export const CUTOFF = "2026-10-24";
const ISO = /^\d{4}-\d{2}(-\d{2})?$/;
const NEW: TheatricalStatus[] = ["upcoming", "released", "likely", "not_theatrical", "unknown"];

/** 研究檔舊狀態（confirmed／released_2025）與新狀態都接受 */
function mapStatus(status: unknown, date: string, hasNote: boolean): TheatricalStatus {
  if (status === "confirmed" || status === "released_2025") {
    if (!ISO.test(date)) return "upcoming";
    return date < CUTOFF ? "released" : "upcoming";
  }
  if (status === "likely" && hasNote) return "upcoming";
  return NEW.includes(status as TheatricalStatus) ? (status as TheatricalStatus) : "unknown";
}

function reasonOf(evidence: unknown): string | undefined {
  const t = typeof evidence === "string" ? evidence : "";
  if (t.includes("Disney+")) return "Disney+ 串流";
  if (t.includes("電視劇")) return "電視劇改編";
  return undefined;
}

export function convertTheatrical(raw: unknown): TheatricalEntry[] {
  if (!Array.isArray(raw)) throw new Error("theatrical input must be an array");
  const out: TheatricalEntry[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const id = r.film_id;
    if (typeof id !== "string" || !id) continue;
    const rawDate = typeof r.release_date === "string" ? r.release_date.trim() : "";
    const status = mapStatus(r.status, rawDate, rawDate !== "" && !ISO.test(rawDate));
    const source = r.source ?? r.source_url_or_page;
    const e: TheatricalEntry = { film_id: id, status };
    if (typeof r.distributor === "string" && r.distributor) e.distributor = r.distributor;
    if (status === "upcoming" || status === "released") {
      if (ISO.test(rawDate)) e.release_date = rawDate;
      else if (rawDate) e.release_note = rawDate;
    }
    if (status === "not_theatrical") {
      const reason = typeof r.release_note === "string" ? r.release_note : reasonOf(r.evidence);
      if (reason) e.release_note = reason;
    }
    if (typeof source === "string" && source) e.source = source;
    out.push(e);
  }
  return out;
}
