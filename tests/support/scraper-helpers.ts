import { test as base } from "playwright-bdd";
import { loadFixtureHtml, createScraperWorld, type ScraperWorld } from "./scraper-world";
import type { SessionMark } from "../../src/domain/types";

/** scraper 專用 test：提供 world fixture（每個 scenario 一份新的） */
export const test = base.extend<{ world: ScraperWorld }>({
  // eslint-disable-next-line no-empty-pattern
  world: async ({}, use) => {
    await use(createScraperWorld());
  },
});

export interface PageRow {
  影城表頭: string;
  影廳: string;
  開演: string;
  片名: string;
  片長: string;
  分級: string;
  提示?: string;
  影片編號?: string;
}

/** 提示業務用語 → 官網 title 屬性原文與啟用時的顯示符號（原文以 fixtures/2026-11-06.html 為準） */
export const HINTS: Record<string, { title: string; symbol: string }> = {
  影人出席: { title: "影人出席", symbol: "★" },
  非英語無英文字幕: { title: "影片拷貝非英語發音且無英文字幕", symbol: "▲" },
  非售票活動: { title: "非售票之活動場次，視現場情況安排候補排隊入場，額滿為止。", symbol: "⊚" },
  優先特映場: { title: "優先特映場，入場前須接受安全檢查，請提前半小時到場。", symbol: "✦" },
};
const HINT_ORDER = ["非英語無英文字幕", "影人出席", "非售票活動", "優先特映場"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 以存檔樣本為骨架，把表格依表頭分組渲染成官網場次頁 HTML */
export function renderSchedulePage(date: string, rows: PageRow[]): string {
  const skeleton = loadFixtureHtml("2026-11-06");
  const start = skeleton.indexOf("<table class='table special show-list'");
  const endMarker = "<!-- End: List -->";
  const end = skeleton.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error("fixture skeleton markers not found");

  // 影片編號：未填時，同片名共用一個合成編號，不同片名各自不同
  const synthetic = new Map<string, string>();
  const filmId = (r: PageRow) => {
    if (r.影片編號 && r.影片編號.trim()) return r.影片編號.trim();
    if (!synthetic.has(r.片名)) synthetic.set(r.片名, String(9000 + synthetic.size));
    return synthetic.get(r.片名)!;
  };

  const headers: string[] = [];
  for (const r of rows) if (!headers.includes(r.影城表頭)) headers.push(r.影城表頭);

  const tables = headers
    .map((h) => {
      const group = rows.filter((r) => r.影城表頭 === h);
      const seenRooms = new Set<string>();
      const trs = group
        .map((r, i) => {
          const roomCount = group.filter((g) => g.影廳 === r.影廳).length;
          const firstOfRoom = !seenRooms.has(r.影廳);
          seenRooms.add(r.影廳);
          const active = new Set(
            (r.提示 ?? "").split("、").map((s) => s.trim()).filter(Boolean),
          );
          for (const a of active) if (!HINTS[a]) throw new Error(`unknown hint: ${a}`);
          const spans = HINT_ORDER.map((k) => {
            const text = active.has(k) ? ` ${HINTS[k].symbol} ` : "  ";
            return `<span title='${HINTS[k].title}'>${text}</span>`;
          }).join("\t\t\t\t");
          const bg = i % 2 === 0 ? "#f8f8f8" : "#e6e6e6";
          return (
            `<tr class='text-center'>\t<td class='room' style='${firstOfRoom ? "" : "display:none;"}' rowspan='${roomCount}'><span>${esc(r.影廳)}<br /></span></td>` +
            `\t<td class='time' style='background: ${bg}'>${r.開演}</td>` +
            `\t<td class='data' style='background: ${bg}'>\t\t<span class='h4 title'><span class="film_url"><a href="https://www.goldenhorse.org.tw/film/programme/films/detail/${filmId(r)}?search_year=2026&search_category=FF">${esc(r.片名)}</a></span></span>` +
            `\t\t<span class='text-size-primary text-light'>${r.片長}分\t\t\t<span style='cursor: default;'>\t\t\t\t${spans}\t\t\t</span> | <span class='txt_rating_y'>${esc(r.分級)}</span>\t\t</span>\n` +
            `\t\t\t\t\t\t</td><td class='add' style='background: ${bg}'></td></tr>`
          );
        })
        .join("");
      return `<table class='table special show-list' style=''><tbody ><tr><th  colspan='4' > ${esc(h)} </th></tr>${trs}</tbody></table>`;
    })
    .join("");

  let html = skeleton.slice(0, start) + tables + "\t\t" + skeleton.slice(end);
  html = html.replace(/(name='search_date' id='search_date' value=')[^']*(')/, `$1${date}$2`);
  return html;
}

export const CINEMA_LABEL: Record<string, string> = {
  xinyi_vieshow: "台北信義威秀",
  songren_muvie: "松仁威秀",
  unknown: "無法判定",
};

export const MARK_LABEL: Record<SessionMark, string> = {
  guest_attending: "★",
  no_english_subtitle: "▲",
  non_ticketed: "⊚",
  priority_screening: "優先特映場",
  mandarin_no_subtitle: "◆",
};
export const MARK_FROM_LABEL: Record<string, SessionMark> = {
  "★": "guest_attending",
  "▲": "no_english_subtitle",
  "⊚": "non_ticketed",
  優先特映場: "priority_screening",
  "◆": "mandarin_no_subtitle",
};

export function parseMarkCell(text: string): string[] {
  const t = text.trim();
  if (t === "無" || t === "") return [];
  return t.split("、").map((s) => s.trim()).filter(Boolean).sort();
}
