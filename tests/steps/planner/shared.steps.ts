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
import { effectiveState } from "../../support/planner-world";
import { ensurePartner, partnerFilmIdOf } from "../../support/planner-duo-helpers";

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

// 同伴的分層如下：
Given("同伴的分層如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  const partner = ensurePartner(); // 純合併情境可以沒有場次表
  for (const r of dataTable.hashes()) {
    const tier = TIER_LABEL_TO_ENUM[r["層級"].trim()];
    if (!tier) throw new Error(`未知層級: ${r["層級"]}`);
    const film_id = partnerFilmIdOf(r["片名"]);
    const is_hot = (r["熱門"] ?? "").trim() === "是";
    partner.film_preferences = partner.film_preferences.filter((p) => p.film_id !== film_id);
    partner.film_preferences.push({ film_id, tier, is_hot });
  }
});

// 同伴已設定不可看時段如下：
Given("同伴已設定不可看時段如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  const partner = ensurePartner();
  for (const r of dataTable.hashes()) {
    partner.unavailable_slots.push(parseSlotText(r["日期"].trim(), r["時段"]));
  }
});

// 同伴的每日上限已設為 {上限} 部
Given("同伴的每日上限已設為 {int} 部", async ({}, limit: number) => {
  ensurePartner().daily_limit = limit;
});

// 觀眾已執行排程並開啟搶票清單（Arrange）
Given("觀眾已執行排程並開啟搶票清單", async () => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  ensureState();
  // 有同伴資料時，排程與清單的輸入先改為兩人合併結果
  const input = effectiveState(ctx.world);
  const result = buildItinerary(catalog, input);
  ctx.world.lastResult = result;
  ctx.ticketList = buildTicketList(catalog, input, result.itinerary);
});

// 觀眾執行排程
When("觀眾執行排程", async () => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  const state = ensureState();
  const before = JSON.stringify(state);
  const partnerBefore = JSON.stringify(ctx.world.partner);
  const t0 = performance.now();
  // 有同伴資料時先推導合併結果再排程；沒有同伴時 effectiveState 原樣回傳自己的狀態
  const result = buildItinerary(catalog, effectiveState(ctx.world));
  ctx.world.elapsedMs = performance.now() - t0;
  ctx.world.lastResult = result;
  expect(JSON.stringify(state), "排程不得修改使用者狀態").toBe(before);
  expect(JSON.stringify(ctx.world.partner), "排程不得修改同伴資料").toBe(partnerBefore);
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
  const again = buildItinerary(catalog, effectiveState(ctx.world));
  const e2 = again.itinerary.filter((e) => sessionById(e.session_id).film_id === fid);
  expect(e2.map((e) => e.session_id)).toEqual(entries.map((e) => e.session_id));
});

// 行程中沒有 "{片名}"（上提自最佳行程，語意不變）
Then("行程中沒有 {string}", async ({}, title: string) => {
  const cat = requireCatalog();
  const result = getCtx().world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  const film = cat.films.find((f) => f.title === title);
  if (!film) return; // 片名不在場次表，行程自然沒有
  expect(result!.itinerary.filter((e) => sessionById(e.session_id).film_id === film.film_id)).toHaveLength(0);
});

// 行程沒有任何場次（上提自最佳行程，語意不變；兩人模式以合併層級判斷必看）
Then("行程沒有任何場次", async () => {
  const world = getCtx().world;
  const result = world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  expect(result!.itinerary).toHaveLength(0);
  const mustIds = new Set(effectiveState(world).film_preferences.filter((p) => p.tier === "must").map((p) => p.film_id));
  for (const u of result!.unscheduled) {
    expect(mustIds.has(u.film_id), "未排入清單只能含必看片").toBe(true);
  }
});
