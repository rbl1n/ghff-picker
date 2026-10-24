import type { Film } from "./types";

/**
 * 手冊順序（目次表）：有片號者依片號由小到大，同號與沒有片號者保持原順序（沒有片號者排最後）。
 * 所有「影片順序」（同分決勝、層內名次初始化、選片頁列表）都以 catalog.films 的這個順序為準。
 */
export function sortFilmsByCatalogOrder(films: Film[]): Film[] {
  return films
    .map((film, i) => ({ film, i }))
    .sort((a, b) => {
      const na = a.film.catalog_no ? Number(a.film.catalog_no) : Infinity;
      const nb = b.film.catalog_no ? Number(b.film.catalog_no) : Infinity;
      return (na === nb ? 0 : na < nb ? -1 : 1) || a.i - b.i;
    })
    .map((x) => x.film);
}
