import { expect } from "@playwright/test";
import { buildItinerary } from "../../../src/domain/schedule";
import { buildTicketList } from "../../../src/domain/tickets";
import {
  Given,
  When,
  Then,
  TIER_LABEL_TO_ENUM,
  buildCatalogFromRows,
  emptyState,
  ensureState,
  filmIdOf,
  getCtx,
  parseSlotText,
  requireCatalog,
  sessionById,
  sessionMatches,
  describeSession,
} from "../../support/planner-a-helpers";

// 影展場次表如下：
Given("影展場次表如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  const ctx = getCtx();
  ctx.world.catalog = buildCatalogFromRows(dataTable.hashes());
  ctx.world.state = emptyState();
  ctx.world.lastResult = null;
  ctx.world.elapsedMs = null;
  ctx.ticketList = null;
});

// 觀眾的分層如下：
Given("觀眾的分層如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  requireCatalog();
  const state = ensureState();
  for (const r of dataTable.hashes()) {
    const tier = TIER_LABEL_TO_ENUM[r["層級"].trim()];
    if (!tier) throw new Error(`未知層級: ${r["層級"]}`);
    const film_id = filmIdOf(r["片名"]);
    const is_hot = (r["熱門"] ?? "").trim() === "是";
    state.film_preferences = state.film_preferences.filter((p) => p.film_id !== film_id);
    state.film_preferences.push({ film_id, tier, is_hot });
  }
});

// 觀眾已設定不可看時段如下：
Given("觀眾已設定不可看時段如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  const state = ensureState();
  for (const r of dataTable.hashes()) {
    state.unavailable_slots.push(parseSlotText(r["日期"].trim(), r["時段"]));
  }
});

// 每日上限已設為 {上限} 部
Given("每日上限已設為 {int} 部", async ({}, limit: number) => {
  ensureState().daily_limit = limit;
});

// 觀眾已執行排程並開啟搶票清單（Arrange）
Given("觀眾已執行排程並開啟搶票清單", async () => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  const state = ensureState();
  const result = buildItinerary(catalog, state);
  ctx.world.lastResult = result;
  ctx.ticketList = buildTicketList(catalog, state, result.itinerary);
});

// 觀眾執行排程
When("觀眾執行排程", async () => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  const state = ensureState();
  const before = JSON.stringify(state);
  const t0 = performance.now();
  const result = buildItinerary(catalog, state);
  ctx.world.elapsedMs = performance.now() - t0;
  ctx.world.lastResult = result;
  expect(JSON.stringify(state), "排程不得修改使用者狀態").toBe(before);
});

// 行程中 "{片名}" 排在 "{場次}"
Then("行程中 {string} 排在 {string}", async ({}, title: string, sessionSpec: string) => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  const result = ctx.world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  const fid = filmIdOf(title);
  const entries = result!.itinerary.filter((e) => sessionById(e.session_id).film_id === fid);
  expect(entries, `行程中 "${title}" 應恰有一場`).toHaveLength(1);
  const s = sessionById(entries[0].session_id);
  expect(sessionMatches(s, sessionSpec), `排的是 ${describeSession(s)}，預期 ${sessionSpec}`).toBe(true);
  // 再讀確認：同輸入再排一次，場次不變
  const again = buildItinerary(catalog, ensureState());
  const e2 = again.itinerary.filter((e) => sessionById(e.session_id).film_id === fid);
  expect(e2.map((e) => e.session_id)).toEqual(entries.map((e) => e.session_id));
});
