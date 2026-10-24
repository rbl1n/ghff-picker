import type { DataTable } from "playwright-bdd";
import { buildItinerary } from "../../../src/domain/schedule";
import { moveFilmInOrder, buildTicketList } from "../../../src/domain/tickets";
import { isSessionWatchable } from "../../../src/domain/availability";
import { areSessionsCompatible } from "../../../src/domain/compat";
import {
  getWorld, Given, When, Then, expect, need, rebuildList, setTicketList, getTicketList, filmIdByTitle, titleOf,
  sessionById, formatSession, cinemaOfVenue,
} from "../../support/planner-b-helpers";


// T042
When("觀眾執行排程並開啟搶票清單", async () => {
  const world = getWorld();
  const { catalog, state } = need(world);
  world.lastResult = buildItinerary(catalog, state);
  setTicketList(world, buildTicketList(catalog, state, world.lastResult.itinerary));
});

// T043
When("觀眾把 {string} 手動移到第 {int} 位", async ({}, title: string, position: number) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const list = getTicketList(world);
  const filmId = filmIdByTitle(catalog, title);
  expect(list.map((i) => i.film_id), `「${title}」須在搶票清單中`).toContain(filmId);
  world.state = moveFilmInOrder(state, filmId, position);
  rebuildList(world);
});

// T044
Then("搶票清單順序為 {string}", async ({}, order: string) => {
  const world = getWorld();
  const { catalog } = need(world);
  const list = getTicketList(world);
  const titles = list.map((i) => titleOf(catalog, i.film_id));
  expect(titles.join("、")).toBe(order);
  expect(titles.length).toBe(order.split("、").length);
  // 權威狀態：清單與行程中的售票影片一一對應
  const ticketed = world.lastResult!.itinerary
    .filter((e) => !e.is_non_ticketed)
    .map((e) => sessionById(catalog, e.session_id).film_id);
  expect([...list.map((i) => i.film_id)].sort()).toEqual([...ticketed].sort());
  // 不該發生：重複影片
  expect(new Set(titles).size).toBe(titles.length);
});

// T045
Then("搶票清單的排定場次如下：", async ({}, table: DataTable) => {
  const world = getWorld();
  const { catalog } = need(world);
  const list = getTicketList(world);
  const rows = table.hashes();
  expect(list.map((i) => titleOf(catalog, i.film_id))).toEqual(rows.map((r) => r["片名"]));
  list.forEach((item, idx) => {
    expect(formatSession(sessionById(catalog, item.current_session_id)), rows[idx]["片名"]).toBe(rows[idx]["排定場次"].trim());
    // 權威狀態：排定場次等於行程中該片的場次
    const entry = world.lastResult!.itinerary.find((e) => sessionById(catalog, e.session_id).film_id === item.film_id);
    expect(entry?.session_id).toBe(item.current_session_id);
  });
});

// T046
Then("搶票清單的備案場次如下：", async ({}, table: DataTable) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const list = getTicketList(world);
  const itinerary = world.lastResult!.itinerary;
  for (const row of table.hashes()) {
    const filmId = filmIdByTitle(catalog, row["片名"]);
    const item = list.find((i) => i.film_id === filmId);
    expect(item, `搶票清單應含「${row["片名"]}」`).toBeTruthy();
    const backups = item!.backup_session_ids.map((id) => sessionById(catalog, id));
    const text = backups.length === 0 ? "無不衝堂備案" : backups.map(formatSession).join("、");
    expect(text, row["片名"]).toBe(row["備案場次"].trim());
    // 權威狀態
    const others = itinerary.map((e) => sessionById(catalog, e.session_id)).filter((s) => s.film_id !== filmId);
    for (const b of backups) {
      expect(isSessionWatchable(b, state.unavailable_slots), `備案 ${formatSession(b)} 須在可看時段`).toBe(true);
      for (const o of others) {
        const [first, second] = b.date < o.date || (b.date === o.date && b.start_min <= o.start_min) ? [b, o] : [o, b];
        expect(areSessionsCompatible(first, second, cinemaOfVenue), `備案與行程中 ${formatSession(o)} 須相容`).toBe(true);
      }
      if (state.daily_limit !== null) {
        const sameDay = others.filter((o) => o.date === b.date).length;
        expect(sameDay + 1, `備案 ${formatSession(b)} 不得使當天超過上限`).toBeLessThanOrEqual(state.daily_limit);
      }
      // 不該發生：包含排定場次本身
      expect(b.session_id).not.toBe(item!.current_session_id);
    }
  }
});

// T047
Then("{string} 不在搶票清單", async ({}, title: string) => {
  const world = getWorld();
  const { catalog } = need(world);
  const filmId = filmIdByTitle(catalog, title);
  expect(getTicketList(world).map((i) => i.film_id)).not.toContain(filmId);
});
