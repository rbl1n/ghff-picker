import type { PartnerData } from "../../src/domain/types";
import { getCtx } from "./planner-a-helpers";
import { EMPTY_CATALOG } from "./planner-world";

/** 取得（必要時建立）world 的同伴資料；呼叫即進入兩人模式。 */
export function ensurePartner(): PartnerData {
  const w = getCtx().world;
  if (!w.partner) {
    w.partner = { display_name: "同伴", daily_limit: null, film_preferences: [], unavailable_slots: [] };
  }
  return w.partner;
}

/** 同伴可標不在場次表的影片：找不到片名時用合成 id（合併時會因快照沒有而被忽略）。 */
export function partnerFilmIdOf(title: string): string {
  const cat = getCtx().world.catalog ?? EMPTY_CATALOG;
  return cat.films.find((f) => f.title === title)?.film_id ?? `__not_in_catalog__:${title}`;
}

/** 純合併情境可以沒有場次表：此時視為空快照（所有同伴影片都被忽略） */
export function catalogOrEmpty() {
  return getCtx().world.catalog ?? EMPTY_CATALOG;
}
