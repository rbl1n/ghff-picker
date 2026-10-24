// 逐日抓取官網場次頁，產出 public/data/sessions.json。僅殼，尚未實作。
export const SCHEDULE_URL = "https://www.goldenhorse.org.tw/film/programme/schedule/";

export function scheduleUrl(date: string): string {
  return `${SCHEDULE_URL}?search_date=${date}`;
}

export async function fetchScheduleHtml(_date: string): Promise<string> {
  throw new Error("not implemented");
}

export async function scrapeAll(_dates: string[]): Promise<void> {
  throw new Error("not implemented");
}

// 直接執行（npm run scrape）時才進入主流程。
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeAll([]).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
