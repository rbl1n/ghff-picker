import { expect } from "@playwright/test";
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
import {
  computeSchedule,
  computeTicketList,
  ensurePartner,
  partnerFilmIdOf,
  subtractAvailability,
  upsertPreference,
} from "../../support/planner-duo-helpers";

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
    // 層內名次：同層依表格列順序，後列者排在前列者之後
    state.film_preferences = upsertPreference(state.film_preferences, film_id, tier, is_hot);
  }
});

// 觀眾已設定不可看時段如下：
Given("觀眾已設定不可看時段如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  const state = ensureState();
  // 不可看時段 = 從有空時段扣掉該區間（逐列累加，分鐘精度）
  for (const r of dataTable.hashes()) {
    const slot = parseSlotText(r["日期"].trim(), r["時段"]);
    state.availability = subtractAvailability(state.availability ?? [], slot.date, slot.start_min ?? 0, slot.end_min ?? 1440);
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
    partner.film_preferences = upsertPreference(partner.film_preferences, film_id, tier, is_hot);
  }
});

// 同伴已設定不可看時段如下：
Given("同伴已設定不可看時段如下：", async ({}, dataTable: { hashes(): Record<string, string>[] }) => {
  const partner = ensurePartner();
  for (const r of dataTable.hashes()) {
    const slot = parseSlotText(r["日期"].trim(), r["時段"]);
    partner.availability = subtractAvailability(partner.availability ?? [], slot.date, slot.start_min ?? 0, slot.end_min ?? 1440);
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
  // 有同伴資料時排出兩人行程；清單只由觀眾自己的行程（一起、觀眾自己）產生並帶購票張數
  const { result, duo } = computeSchedule(ctx.world, catalog);
  ctx.world.lastResult = result;
  ctx.world.lastDuo = duo;
  ctx.ticketList = computeTicketList(ctx.world, catalog);
});

// 觀眾執行排程
When("觀眾執行排程", async () => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  const state = ensureState();
  const before = JSON.stringify(state);
  const partnerBefore = JSON.stringify(ctx.world.partner);
  ctx.world.baseline = JSON.stringify({ own: state, partner: ctx.world.partner });
  const t0 = performance.now();
  // 有同伴資料時兩人各自以自己的設定同時排程；沒有同伴時與 001 相同
  const { result, duo } = computeSchedule(ctx.world, catalog);
  ctx.world.elapsedMs = performance.now() - t0;
  ctx.world.lastResult = result;
  ctx.world.lastDuo = duo;
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
  const again = computeSchedule(ctx.world, catalog).result;
  const e2 = again.itinerary.filter((e) => sessionById(e.session_id).film_id === fid);
  expect(e2.map((e) => e.session_id)).toEqual(entries.map((e) => e.session_id));
});
