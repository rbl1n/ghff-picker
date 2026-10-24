import { getCtx, Given, When, Then } from "./planner-a-helpers";
import { expect } from "@playwright/test";
import type { Catalog, Session, TicketListItem, UserState } from "../../src/domain/types";
import { cinemaOfVenue, type PlannerWorld } from "./planner-world";
import { computeTicketList } from "./planner-duo-helpers";
import { hhmmToMin, minToHhmm } from "./tables";

/** 與 planner-a-helpers 共用同一個 module 層級 ctx（每個 scenario 的 Before 重置） */
export function getWorld(): PlannerWorld {
  return getCtx().world;
}
export function getTicketList(_world?: PlannerWorld): TicketListItem[] {
  const l = getCtx().ticketList;
  if (!l) throw new Error("尚未開啟搶票清單");
  return l;
}
export function setTicketList(_world: PlannerWorld | undefined, list: TicketListItem[]): void {
  getCtx().ticketList = list;
}

export function need(world: PlannerWorld): { catalog: Catalog; state: UserState } {
  if (!world.catalog || !world.state) throw new Error("world 缺少場次快照或使用者狀態");
  return { catalog: world.catalog, state: world.state };
}

/** 以目前 state 與最近一次行程重新產生搶票清單 */
export function rebuildList(world: PlannerWorld): TicketListItem[] {
  const { catalog } = need(world);
  if (!world.lastResult) throw new Error("尚未排程");
  // 有同伴時清單只含觀眾自己的行程，並帶兩人行程與同伴資料（搶票標記只屬於自己）
  const list = computeTicketList(world, catalog);
  setTicketList(world, list);
  return list;
}

export function filmIdByTitle(catalog: Catalog, title: string): string {
  const f = catalog.films.find((x) => x.title === title);
  if (!f) throw new Error(`找不到影片：${title}`);
  return f.film_id;
}
export function titleOf(catalog: Catalog, filmId: string): string {
  const f = catalog.films.find((x) => x.film_id === filmId);
  if (!f) throw new Error(`找不到影片 id：${filmId}`);
  return f.title;
}
export function sessionById(catalog: Catalog, id: string): Session {
  const s = catalog.sessions.find((x) => x.session_id === id);
  if (!s) throw new Error(`找不到場次 id：${id}`);
  return s;
}

/** 依 "日期 開演[ 影廳][ ★]" 找該片場次，只比對有寫出的部分 */
export function findSession(catalog: Catalog, title: string, text: string): Session {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2})(.*)$/.exec(text.trim());
  if (!m) throw new Error(`invalid session text: ${text}`);
  const rest = m[3].trim();
  const wantStar = rest.includes("★");
  const venue = rest.replace("★", "").trim();
  const filmId = filmIdByTitle(catalog, title);
  const hit = catalog.sessions.filter(
    (s) =>
      s.film_id === filmId &&
      s.date === m[1] &&
      s.start_min === hhmmToMin(m[2]) &&
      (!venue || s.venue_name.includes(venue)) &&
      (!wantStar || s.marks.includes("guest_attending")),
  );
  if (hit.length !== 1) throw new Error(`場次「${title} ${text}」比對到 ${hit.length} 筆`);
  return hit[0];
}

/** 場次 → "日期 HH:MM"，影人出席接 " ★" */
export function formatSession(s: Session): string {
  return `${s.date} ${minToHhmm(s.start_min)}${s.marks.includes("guest_attending") ? " ★" : ""}`;
}

export { cinemaOfVenue, expect, Given, When, Then };
