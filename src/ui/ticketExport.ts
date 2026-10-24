import type { Film, Session, TicketListItem } from "../domain/types";
import type { DuoTicketRow } from "../domain/division";
import { dateLabel, formatTime } from "./format";

type Row = TicketListItem | DuoTicketRow;

export const EXPORT_HEADER = ["順序", "日期", "開演", "場次名稱", "片號", "影廳", "張數", "一起/自己", "備案", "狀態"] as const;

/** 備案裡的影廳簡寫：「台北信義威秀 13廳」→「13廳」；其他（如 TITAN）維持原樣 */
function hallShort(venue: string): string {
  const m = venue.match(/\s(\d+廳)$/);
  return m ? m[1] : venue;
}

/** 一份搶票清單 → 表格列（含表頭）。場次名稱即在拓元搜尋框貼上的文字（短片單元用單元名）。 */
export function buildExportTable(
  items: Row[],
  filmById: Map<string, Film>,
  sessionById: Map<string, Session>,
  gotSessionOf: (it: Row) => string | undefined,
): string[][] {
  const rows = items.map((it) => {
    const film = filmById.get(it.film_id);
    const cur = sessionById.get(gotSessionOf(it) ?? it.current_session_id);
    const duo = "owner" in it ? it : null;
    const backups = it.backup_session_ids
      .map((id) => sessionById.get(id))
      .filter((s): s is Session => !!s)
      .map((s) => `${dateLabel(s.date)}${formatTime(s.start_min)} ${hallShort(s.venue_name)}`)
      .join("；");
    return [
      String(it.order),
      cur ? dateLabel(cur.date) : "",
      cur ? formatTime(cur.start_min) : "",
      film?.title ?? "",
      film?.catalog_no ?? "",
      cur?.venue_name ?? "",
      String(it.ticket_quantity ?? 1),
      duo ? (duo.participant === "together" ? "一起" : "自己") : "自己",
      backups,
      "",
    ];
  });
  return [[...EXPORT_HEADER], ...rows];
}

const clean = (v: string) => v.replace(/[\t\r\n]+/g, " ");

export function toTsv(table: string[][]): string {
  return table.map((r) => r.map(clean).join("\t")).join("\n");
}

export function toCsv(table: string[][]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + table.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
