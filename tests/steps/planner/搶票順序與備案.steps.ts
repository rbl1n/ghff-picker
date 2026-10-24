import type { DataTable } from "playwright-bdd";
import { moveFilmInOrder } from "../../../src/domain/tickets";
import { areSessionsCompatible } from "../../../src/domain/compat";
import { computeSchedule, computeTicketList, availableForSession } from "../../support/planner-duo-helpers";
import type { DuoItineraryEntry } from "../../../src/domain/types";
import {
  getWorld, Given, When, Then, expect, need, rebuildList, setTicketList, getTicketList, findTicketItem, filmIdByTitle, titleOf,
  sessionById, formatSession, cinemaOfVenue,
} from "../../support/planner-b-helpers";


// T042
When("觀眾執行排程並開啟搶票清單", async () => {
  const world = getWorld();
  const { catalog } = need(world);
  // 有同伴資料時排程產出兩人行程，清單只由觀眾自己的行程（一起、觀眾自己）產生並帶購票張數
  const { result, duo } = computeSchedule(world, catalog);
  world.lastResult = result;
  world.lastDuo = duo;
  setTicketList(world, computeTicketList(world, catalog));
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
  const { catalog } = need(world);
  const state = world.state!;
  const partner = world.partner;
  const duoEntries: DuoItineraryEntry[] | null = world.lastDuo ? world.lastDuo.entries : null;
  const list = getTicketList(world);
  const itinerary = world.lastResult!.itinerary;
  for (const row of table.hashes()) {
    const filmId = filmIdByTitle(catalog, row["片名"]);
    const item = findTicketItem(filmId);
    expect(item, `搶票清單應含「${row["片名"]}」`).toBeTruthy();
    const backups = item!.backup_session_ids.map((id) => sessionById(catalog, id));
    const text = backups.length === 0 ? "無不衝堂備案" : backups.map(formatSession).join("、");
    expect(text, row["片名"]).toBe(row["備案場次"].trim());
    // 權威狀態
    const others = itinerary.map((e) => sessionById(catalog, e.session_id)).filter((s) => s.film_id !== filmId);
    // 一起看的片：備案須兩人都可看、都不使自己當天超過自己的上限；其餘只看觀眾
    const together = !!duoEntries?.some((e) => e.participant === "together" && sessionById(catalog, e.session_id).film_id === filmId);
    // 同伴自己看的片（兩人模式）：備案只看同伴，不檢查觀眾
    const partnerSolo = (item as { participant?: string }).participant === "partner";
    if (partnerSolo) {
      for (const b of backups) expect(availableForSession(b, partner?.availability), `同伴自己看的備案 ${formatSession(b)} 須在同伴可看時段`).toBe(true);
      continue;
    }
    for (const b of backups) {
      expect(availableForSession(b, state.availability), `備案 ${formatSession(b)} 須在觀眾可看時段`).toBe(true);
      if (together) {
        expect(availableForSession(b, partner?.availability), `一起看的備案 ${formatSession(b)} 須在同伴可看時段`).toBe(true);
        if (partner && partner.daily_limit !== null) {
          const partnerOthers = duoEntries!
            .filter((e) => e.participant !== "self")
            .map((e) => sessionById(catalog, e.session_id))
            .filter((x) => x.film_id !== filmId && x.date === b.date).length;
          expect(partnerOthers + 1, `一起看的備案 ${formatSession(b)} 不得使同伴當天超過上限`).toBeLessThanOrEqual(partner.daily_limit);
        }
      }
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

// 搶票清單的購票張數如下：
Then("搶票清單的購票張數如下：", async ({}, table: DataTable) => {
  const world = getWorld();
  const { catalog } = need(world);
  const list = getTicketList(world);
  const rows = table.hashes();
  const label = (q: number | null | undefined) => (q === null || q === undefined ? "不帶張數" : String(q));
  for (const r of rows) {
    const item = list.find((i) => i.film_id === filmIdByTitle(catalog, r["片名"]));
    expect(item, `搶票清單應含「${r["片名"]}」`).toBeTruthy();
    expect(label(item!.ticket_quantity), `${r["片名"]} 購票張數`).toBe(r["張數"].trim());
  }
  // 權威狀態：張數等於兩人行程中該片的參與者推導值（一起 2、觀眾自己 1、個人模式不帶）
  const duo = world.lastDuo;
  for (const item of list) {
    const e = duo?.entries.find((x) => sessionById(catalog, x.session_id).film_id === item.film_id && x.participant !== "partner");
    const expected = duo ? (e?.participant === "together" ? 2 : 1) : null;
    expect(item.ticket_quantity ?? null, `${titleOf(catalog, item.film_id)} 張數須等於參與者推導值`).toBe(expected);
  }
  // 清單的片集合等於觀眾自己行程中的售票影片，不含只有同伴自己看的片
  const ticketed = world.lastResult!.itinerary
    .filter((e) => !e.is_non_ticketed)
    .map((e) => sessionById(catalog, e.session_id).film_id);
  expect([...list.map((i) => i.film_id)].sort(), "清單的片集合等於觀眾自己行程中的售票影片").toEqual([...ticketed].sort());
  if (duo) {
    // 只有同伴自己看的片（觀眾行程中沒有這部片；同一部片兩人各看不同場時，觀眾那場仍在清單）
    const ownFilms = new Set(duo.entries.filter((x) => x.participant !== "partner").map((x) => sessionById(catalog, x.session_id).film_id));
    for (const e of duo.entries.filter((x) => x.participant === "partner")) {
      const filmId = sessionById(catalog, e.session_id).film_id;
      if (ownFilms.has(filmId)) continue;
      expect(list.map((i) => i.film_id), "同伴自己看的片不得出現在清單").not.toContain(filmId);
    }
  }
});
