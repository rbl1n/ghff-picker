import * as cheerio from "cheerio";
import type { CinemaId, Film, Session, SessionMark, Venue } from "../../src/domain/types";

export interface ParsedSchedule {
  films: Film[];
  venues: Venue[];
  sessions: Session[];
}

/** 官網表頭 → 影城（MUVIE 表頭屬於松仁威秀，含 TITAN） */
const CINEMA_BY_HEADER: Record<string, CinemaId> = {
  台北信義威秀: "xinyi_vieshow",
  MUVIE: "songren_muvie",
};

/** 依 title 屬性原文（關鍵字）對應標記；◆ 原文尚未在樣本出現，以「華語」關鍵字預留 */
const MARK_BY_TITLE: Array<[RegExp, SessionMark]> = [
  [/影人出席/, "guest_attending"],
  [/華語/, "mandarin_no_subtitle"],
  [/非英語/, "no_english_subtitle"],
  [/非售票/, "non_ticketed"],
  [/優先特映/, "priority_screening"],
];

/** 已知的台北以外影城表頭（縣市前綴或商場名）：整段場次不收入（CL-012）；其他無法辨識的表頭仍標 unknown */
const NON_TAIPEI_HEADER = /^(台中|臺中|高雄|台南|臺南|新竹|桃園|基隆|嘉義|彰化|花蓮|宜蘭|屏東|苗栗|雲林|南投|台東|臺東|澎湖|金門|新北)|遠雄廣場|大遠百/;

export function cinemaOfHeader(header: string): CinemaId {
  return CINEMA_BY_HEADER[header.trim()] ?? "unknown";
}

function shortHash(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.trim().split(":").map(Number);
  return h * 60 + m;
}

/** 解析官網某日場次頁 HTML（date = YYYY-MM-DD） */
export function parseSchedulePage(html: string, date: string): ParsedSchedule {
  const $ = cheerio.load(html);
  const films = new Map<string, Film>();
  const venues = new Map<string, Venue>();
  const sessions: Session[] = [];

  $("table.show-list").each((_, table) => {
    const header = $(table).find("th").first().text().trim();
    if (NON_TAIPEI_HEADER.test(header)) return;
    const cinema = cinemaOfHeader(header);
    let venueName = "";
    $(table)
      .find("tr.text-center")
      .each((_, tr) => {
        const row = $(tr);
        const room = row.find("td.room span").first().text().trim();
        // 已知影城沿用官網影廳原文；未知影城（如高雄、台中威秀）的影廳名會與信義重名，改冠上表頭
        if (room) venueName = cinema === "unknown" ? `${header}${room}` : room;
        // 影片連 films/detail/<id>；非售票活動（⊚）連 notesevents/events/detail/<id>，同一活動編號可含多個標題
        const links = row.find("td.data .film_url a, td.data .program_url a");
        const link = links.first();
        // 短片單元：標題列是【單元名】（沒有連結），後面接多部短片的連結；片名 = 單元名，film_id 沿用第一部短片的編號（保持穩定）
        const unitName = row.find("td.data .h4.title").first().clone().children().remove().end().text().trim();
        const programme = links.length > 1 && /^【.+】$/.test(unitName) ? unitName.slice(1, -1).trim() : null;
        const href = link.attr("href") ?? "";
        const filmNo = /films\/detail\/(\d+)/.exec(href)?.[1];
        const eventNo = /events\/detail\/(\d+)/.exec(href)?.[1];
        const filmId = filmNo ?? (eventNo ? `e${eventNo}-${shortHash(link.text().trim())}` : undefined);
        if (!filmId || !venueName) return;

        const detail = row.find("td.data .text-light").first();
        const runtime = Number(/(\d+)\s*分/.exec(detail.text())?.[1]);
        const rating = detail.find(".txt_rating_y").first().text().trim();
        const startMin = hhmmToMin(row.find("td.time").first().text());

        if (!films.has(filmId)) {
          const film: Film = { film_id: filmId, title: programme ?? link.text().trim(), runtime_min: runtime, rating };
          if (programme) film.shorts = links.map((_, a) => ({ title: $(a).text().trim() })).get();
          films.set(filmId, film);
        }
        if (!venues.has(venueName)) venues.set(venueName, { venue_name: venueName, cinema });

        const marks: SessionMark[] = [];
        detail.find("span[title]").each((_, sp) => {
          if (!$(sp).text().trim()) return; // 無符號 = 此提示未啟用
          const title = $(sp).attr("title") ?? "";
          const hit = MARK_BY_TITLE.find(([re]) => re.test(title));
          if (hit && !marks.includes(hit[1])) marks.push(hit[1]);
        });

        sessions.push({
          session_id: `${filmId}-${date}-${String(startMin).padStart(4, "0")}`,
          film_id: filmId,
          date,
          start_min: startMin,
          end_min: startMin + runtime,
          venue_name: venueName,
          marks,
        });
      });
  });

  // 同片同時間在不同影廳同步放映時，session_id 加上影廳以保持唯一且可重現
  const idCount = new Map<string, number>();
  for (const s of sessions) idCount.set(s.session_id, (idCount.get(s.session_id) ?? 0) + 1);
  for (const s of sessions) if (idCount.get(s.session_id)! > 1) s.session_id += `-${s.venue_name}`;

  return { films: [...films.values()], venues: [...venues.values()], sessions };
}
