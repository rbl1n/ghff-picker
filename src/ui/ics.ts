import type { CalEntry } from "./ItineraryCalendar";

const pad = (n: number) => String(n).padStart(2, "0");

/** date + 分鐘（可 >1440）→ 本地時間 YYYYMMDDTHHMMSS（台灣無夏令時間，直接以 TZID=Asia/Taipei 表示） */
function local(date: string, min: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMinutes(min);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildIcs(entries: CalEntry[], now = new Date()): string {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ghff-picker//itinerary//ZH",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Taipei",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of [...entries].sort((a, b) => (a.date + String(a.startMin).padStart(5, "0")).localeCompare(b.date + String(b.startMin).padStart(5, "0")))) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@ghff-picker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Taipei:${local(e.date, e.startMin)}`,
      `DTEND;TZID=Asia/Taipei:${local(e.date, e.endMin)}`,
      `SUMMARY:${esc(e.no ? `${e.no} ${e.title}` : e.title)}`,
      `LOCATION:${esc(e.venue)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadIcs(entries: CalEntry[]): void {
  const blob = new Blob([buildIcs(entries)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ghff-itinerary.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
