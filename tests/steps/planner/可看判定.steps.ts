import { expect } from "@playwright/test";
import { applySlotToDates, isSessionWatchable } from "../../../src/domain/availability";
import { hhmmToMin } from "../../support/tables";
import {
  When,
  Then,
  ensureState,
  findSession,
  getCtx,
  requireCatalog,
  parseSlotText,
  slotToText,
} from "../../support/planner-a-helpers";

type Table = { hashes(): Record<string, string>[] };

function queryAll(): Map<string, boolean> {
  const catalog = requireCatalog();
  const state = ensureState();
  const map = new Map<string, boolean>();
  for (const s of catalog.sessions) map.set(s.session_id, isSessionWatchable(s, state.unavailable_slots));
  return map;
}

// 觀眾查看場次可看狀態
When("觀眾查看場次可看狀態", async () => {
  const ctx = getCtx();
  ctx.stateSnapshotAtQuery = JSON.stringify(ensureState());
  ctx.watchability = queryAll();
  expect(JSON.stringify(ensureState()), "查詢是純查詢，不得改使用者狀態").toBe(ctx.stateSnapshotAtQuery);
});

// 觀眾把不可看時段 "{時段}" 一次套用到以下日期：
When("觀眾把不可看時段 {string} 一次套用到以下日期：", async ({}, slotText: string, dataTable: Table) => {
  const state = ensureState();
  const dates = dataTable.hashes().map((r) => r["日期"].trim());
  const { start_min, end_min } = parseSlotText(dates[0], slotText);
  const added = applySlotToDates({ start_min, end_min }, dates);
  state.unavailable_slots = [...state.unavailable_slots, ...added];
});

// 場次可看狀態如下：
Then("場次可看狀態如下：", async ({}, dataTable: Table) => {
  const ctx = getCtx();
  const catalog = requireCatalog();
  const state = ensureState();
  expect(ctx.watchability, "尚未查看場次可看狀態").not.toBeNull();
  const listed = new Set<string>();
  for (const r of dataTable.hashes()) {
    const s = findSession(r["片名"], r["日期"].trim(), r["開演"]);
    listed.add(s.session_id);
    const expected = r["可看"].trim() === "可看";
    expect(ctx.watchability!.get(s.session_id), `${r["片名"]} ${r["日期"]} ${r["開演"]}`).toBe(expected);
  }
  // 權威狀態：狀態未被改動
  expect(JSON.stringify(state)).toBe(ctx.stateSnapshotAtQuery);
  // 再讀確認：再次查詢結果相同（含表格未列出的場次）
  const again = queryAll();
  for (const s of catalog.sessions) {
    expect(again.get(s.session_id), `再次查詢 ${s.session_id}`).toBe(ctx.watchability!.get(s.session_id));
  }
  void hhmmToMin;
});

// 不可看時段設定如下：
Then("不可看時段設定如下：", async ({}, dataTable: Table) => {
  const state = ensureState();
  const norm = (rows: { date: string; text: string }[]) =>
    rows.map((r) => `${r.date} ${r.text}`).sort();
  const expected = norm(dataTable.hashes().map((r) => ({ date: r["日期"].trim(), text: slotToText(parseSlotText(r["日期"].trim(), r["時段"])) })));
  const actual = norm(state.unavailable_slots.map((s) => ({ date: s.date, text: slotToText(s) })));
  expect(actual).toEqual(expected);
  // 再讀確認
  const reread = JSON.parse(JSON.stringify(state)) as typeof state;
  expect(norm(reread.unavailable_slots.map((s) => ({ date: s.date, text: slotToText(s) })))).toEqual(expected);
});
