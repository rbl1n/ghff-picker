// 紙本手冊目次表的片號（catalog_no）：讀 catalog-numbers.json 套到影片上，並依手冊順序排列。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Film, FilmShort } from "../../src/domain/types";

export interface CatalogNumberEntry {
  film_id: string;
  catalog_no: string;
  title: string;
  /** 短片單元：每部短片自己的頁碼；單元的 catalog_no = 其中最小的頁碼 */
  shorts?: FilmShort[];
}

export const CATALOG_NUMBERS_FILE = resolve(process.cwd(), "scripts/scrape/catalog-numbers.json");

/** 讀對照檔；陣列順序 = 目次表出現順序（同號時的決勝） */
export function loadCatalogNumbers(file = CATALOG_NUMBERS_FILE): CatalogNumberEntry[] {
  return (JSON.parse(readFileSync(file, "utf-8")) as { films: CatalogNumberEntry[] }).films;
}

/**
 * 套用片號並依手冊順序排列：有片號者依片號由小到大（同號依目次表位置），沒有片號者接在最後、保持輸入順序。
 * 輸入不被修改；沒有對照到的影片不帶 catalog_no 欄位。
 */
export function applyCatalogNumbers(films: Film[], entries: CatalogNumberEntry[]): Film[] {
  const pos = new Map(entries.map((e, i) => [e.film_id, i]));
  const no = new Map(entries.map((e) => [e.film_id, e.catalog_no]));
  return films
    .map((f, i) => {
      const { catalog_no: _drop, ...rest } = f;
      const n = no.get(f.film_id);
      const out: Film = n === undefined ? (rest as Film) : { ...rest, catalog_no: n };
      const shortNos = entries.find((e) => e.film_id === f.film_id)?.shorts;
      if (f.shorts && shortNos) {
        // 短片頁碼依片名對應；同單元內片名不重複
        out.shorts = f.shorts.map((s) => {
          const hit = shortNos.find((x) => x.title === s.title);
          return hit?.catalog_no ? { title: s.title, catalog_no: hit.catalog_no } : { title: s.title };
        });
      }
      return { film: out, i };
    })
    .sort((a, b) => {
      const pa = pos.get(a.film.film_id);
      const pb = pos.get(b.film.film_id);
      if (pa === undefined && pb === undefined) return a.i - b.i;
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      return Number(a.film.catalog_no) - Number(b.film.catalog_no) || pa - pb;
    })
    .map((x) => x.film);
}
