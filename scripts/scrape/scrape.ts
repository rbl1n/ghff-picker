// 逐日抓取官網場次頁，產出 public/data/sessions.json。
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Catalog, Film, Session, Venue } from "../../src/domain/types";
import { applyCatalogNumbers, loadCatalogNumbers } from "./catalog";
import { parseSchedulePage } from "./parse";

export const SCHEDULE_URL = "https://www.goldenhorse.org.tw/film/programme/schedule/";
const FESTIVAL_YEAR = 2026;
const DELAY_MS = 1000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function scheduleUrl(date: string): string {
  return `${SCHEDULE_URL}?search_date=${date}`;
}

export async function fetchScheduleHtml(date: string): Promise<string> {
  const res = await fetch(scheduleUrl(date), { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${scheduleUrl(date)} -> ${res.status}`);
  return res.text();
}

/** 從場次頁日期選單（availableDates）取出可選日期，正規化為 YYYY-MM-DD */
export function parseAvailableDates(html: string): string[] {
  const m = /availableDates\s*=\s*\[([^\]]*)\]/.exec(html);
  if (!m) throw new Error("找不到 availableDates 日期選單");
  return [...m[1].matchAll(/"(\d{4})-(\d{1,2})-(\d{1,2})"/g)].map(
    ([, y, mo, d]) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 抓取並合併指定日期（空陣列 = 由日期選單自動取得），寫出 public/data/sessions.json */
export async function scrapeAll(dates: string[], outFile = resolve(process.cwd(), "public/data/sessions.json")): Promise<Catalog> {
  const pages = new Map<string, string>();
  if (dates.length === 0) {
    const first = await fetchScheduleHtml(`${FESTIVAL_YEAR}-11-06`);
    dates = parseAvailableDates(first);
    pages.set(`${FESTIVAL_YEAR}-11-06`, first);
  }

  const films = new Map<string, Film>();
  const venues = new Map<string, Venue>();
  const sessions: Session[] = [];
  const sessionIds = new Set<string>();

  for (const [i, date] of dates.entries()) {
    let html = pages.get(date);
    if (html === undefined) {
      if (i > 0) await sleep(DELAY_MS);
      html = await fetchScheduleHtml(date);
    }
    const parsed = parseSchedulePage(html, date);
    console.error(`${date}: ${parsed.sessions.length} sessions`);
    for (const f of parsed.films) if (!films.has(f.film_id)) films.set(f.film_id, f);
    for (const v of parsed.venues) {
      const prev = venues.get(v.venue_name);
      if (prev && prev.cinema !== v.cinema) {
        throw new Error(`影廳 "${v.venue_name}" 同時屬於 ${prev.cinema} 與 ${v.cinema}`);
      }
      venues.set(v.venue_name, v);
    }
    for (const s of parsed.sessions) {
      if (sessionIds.has(s.session_id)) throw new Error(`session_id 重複: ${s.session_id}`);
      sessionIds.add(s.session_id);
      sessions.push(s);
    }
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min || a.venue_name.localeCompare(b.venue_name));
  const catalog: Catalog = {
    festival_year: FESTIVAL_YEAR,
    source_url: SCHEDULE_URL,
    fetched_at: new Date().toISOString(),
    // 影片依紙本手冊目次順序排列（片號由小到大）；沒有片號者接在最後，依 film_id
    films: applyCatalogNumbers(
      [...films.values()].sort((a, b) => Number(a.film_id) - Number(b.film_id)),
      loadCatalogNumbers(),
    ),
    venues: [...venues.values()],
    sessions,
  };
  await mkdir(resolve(outFile, ".."), { recursive: true });
  await writeFile(outFile, JSON.stringify(catalog, null, 2) + "\n", "utf-8");
  return catalog;
}

// 直接執行（npm run scrape）時才進入主流程。
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeAll([])
    .then((c) => console.error(`wrote ${c.films.length} films, ${c.sessions.length} sessions, ${c.venues.length} venues`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
