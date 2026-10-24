import type { DataTable } from "playwright-bdd";
import { buildItinerary } from "../../../src/domain/schedule";
import { markSession, clearMark } from "../../../src/domain/tickets";
import { areSessionsCompatible } from "../../../src/domain/compat";
import type { Session, TicketListItem } from "../../../src/domain/types";
import { effectiveState, type PlannerWorld } from "../../support/planner-world";
import {
  getWorld, Given, When, Then, expect, need, rebuildList, getTicketList, filmIdByTitle, titleOf,
  sessionById, findSession, formatSession, cinemaOfVenue,
} from "../../support/planner-b-helpers";


function mark(world: PlannerWorld, title: string, sessionText: string, result: "got" | "missed"): void {
  const { catalog, state } = need(world);
  const s = findSession(catalog, title, sessionText);
  world.state = markSession(state, s.session_id, result);
  rebuildList(world);
}

function itemOf(world: PlannerWorld, title: string): TicketListItem {
  const { catalog } = need(world);
  const filmId = filmIdByTitle(catalog, title);
  const item = getTicketList(world).find((i) => i.film_id === filmId);
  if (!item) throw new Error(`搶票清單沒有「${title}」`);
  return item;
}

/** 所有 got 場次（可排除某片） */
function gotSessions(world: PlannerWorld, exceptFilmId?: string): Session[] {
  const { catalog, state } = need(world);
  return state.ticket_marks
    .filter((m) => m.result === "got")
    .map((m) => sessionById(catalog, m.session_id))
    .filter((s) => s.film_id !== exceptFilmId);
}

function statusOf(world: PlannerWorld, title: string): "未處理" | "搶到" | "沒搶到" {
  const { catalog, state } = need(world);
  const item = itemOf(world, title);
  const filmSessions = catalog.sessions.filter((s) => s.film_id === item.film_id).map((s) => s.session_id);
  if (state.ticket_marks.some((m) => m.result === "got" && filmSessions.includes(m.session_id))) return "搶到";
  const cur = state.ticket_marks.find((m) => m.session_id === item.current_session_id);
  return cur?.result === "missed" ? "沒搶到" : "未處理";
}

// T048
Given("觀眾已把下列場次標記為搶到：", async ({}, table: DataTable) => {
  const world = getWorld();
  for (const r of table.hashes()) mark(world, r["片名"], r["場次"], "got");
  const { state } = need(world);
  for (const r of table.hashes()) {
    const s = findSession(need(world).catalog, r["片名"], r["場次"]);
    expect(state.ticket_marks).toContainEqual({ session_id: s.session_id, result: "got" });
    expect(itemOf(world, r["片名"]).current_session_id).toBe(s.session_id);
  }
});

// T049
Given("觀眾已把下列場次標記為沒搶到：", async ({}, table: DataTable) => {
  const world = getWorld();
  for (const r of table.hashes()) mark(world, r["片名"], r["場次"], "missed");
  const { catalog, state } = need(world);
  for (const r of table.hashes()) {
    const s = findSession(catalog, r["片名"], r["場次"]);
    expect(state.ticket_marks).toContainEqual({ session_id: s.session_id, result: "missed" });
    expect(itemOf(world, r["片名"]).current_session_id).not.toBe(s.session_id);
  }
});

// T050
When("觀眾把 {string} 的 {string} 場次標記為搶到", async ({}, title: string, session: string) => {
  const world = getWorld();
  mark(world, title, session, "got");
});

// T051
When("觀眾把 {string} 的 {string} 場次標記為沒搶到", async ({}, title: string, session: string) => {
  const world = getWorld();
  mark(world, title, session, "missed");
});

// T052
When("觀眾撤銷 {string} 的搶到標記", async ({}, title: string) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const filmId = filmIdByTitle(catalog, title);
  const m = state.ticket_marks.find((x) => x.result === "got" && sessionById(catalog, x.session_id).film_id === filmId);
  if (!m) throw new Error(`「${title}」沒有搶到標記`);
  world.state = clearMark(state, m.session_id);
  rebuildList(world);
});

// T053
When("觀眾撤銷 {string} 的沒搶到標記", async ({}, title: string) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const filmId = filmIdByTitle(catalog, title);
  const missed = state.ticket_marks.filter(
    (x) => x.result === "missed" && sessionById(catalog, x.session_id).film_id === filmId,
  );
  const last = missed[missed.length - 1];
  if (!last) throw new Error(`「${title}」沒有沒搶到標記`);
  world.state = clearMark(state, last.session_id);
  rebuildList(world);
});

// T054
When("觀眾重新排程", async () => {
  const world = getWorld();
  const { catalog } = need(world);
  // 有同伴時輸入為兩人合併結果加上自己的搶票標記
  world.lastResult = buildItinerary(catalog, effectiveState(world));
});

// T055
Then("{string} 的搶票狀態是 {string}", async ({}, title: string, status: string) => {
  const world = getWorld();
  expect(statusOf(world, title)).toBe(status);
  if (status === "搶到") {
    const { catalog, state } = need(world);
    const item = itemOf(world, title);
    expect(state.ticket_marks).toContainEqual({ session_id: item.current_session_id, result: "got" });
    expect(sessionById(catalog, item.current_session_id).film_id).toBe(item.film_id);
  }
  // 再讀確認：重新產生搶票清單後仍一致
  rebuildList(world);
  expect(statusOf(world, title)).toBe(status);
});

// T056
Then("{string} 立即改顯示 {string}", async ({}, title: string, session: string) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const expected = findSession(catalog, title, session);
  const item = itemOf(world, title); // 標記動作同步回傳後產生的清單，不重算
  expect(item.current_session_id, `目前場次應為 ${formatSession(expected)}`).toBe(expected.session_id);
  for (const g of gotSessions(world, item.film_id)) {
    expect(areSessionsCompatible(expected, g, cinemaOfVenue), "須與所有 got 場次相容").toBe(true);
  }
  const missedIds = state.ticket_marks.filter((m) => m.result === "missed").map((m) => m.session_id);
  expect(missedIds).not.toContain(item.current_session_id);
});

// T057
Then("{string} 再次顯示 {string}", async ({}, title: string, session: string) => {
  const world = getWorld();
  const { catalog } = need(world);
  const expected = findSession(catalog, title, session);
  expect(itemOf(world, title).current_session_id).toBe(expected.session_id);
  // 備案已依剩餘 got 場次重算：重新產生後一致
  const before = JSON.stringify(getTicketList(world));
  rebuildList(world);
  expect(JSON.stringify(getTicketList(world))).toBe(before);
});

// T058
Then("{string} 標示為已無可用場次", async ({}, title: string) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const item = itemOf(world, title);
  expect(item.exhausted).toBe(true);
  const missedIds = state.ticket_marks.filter((m) => m.result === "missed").map((m) => m.session_id);
  const gots = gotSessions(world, item.film_id);
  for (const s of catalog.sessions.filter((x) => x.film_id === item.film_id)) {
    const blocked = missedIds.includes(s.session_id) || gots.some((g) => !areSessionsCompatible(s, g, cinemaOfVenue));
    expect(blocked, `候選場次 ${titleOf(catalog, s.film_id)} ${formatSession(s)} 應已被排除`).toBe(true);
  }
});

// T059
Then("行程中沒有 {string} 的 {string} 場次", async ({}, title: string, session: string) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  const s = findSession(catalog, title, session);
  expect(world.lastResult!.itinerary.map((e) => e.session_id)).not.toContain(s.session_id);
  expect(state.ticket_marks).toContainEqual({ session_id: s.session_id, result: "missed" });
});
