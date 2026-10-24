import { expect } from "@playwright/test";
import { isSessionAvailable, subtractInterval } from "../../../src/domain/availability";
import { hhmmToMin } from "../../support/tables";
import {
  When,
  Then,
  ensureState,
  findSession,
  getCtx,
  requireCatalog,
  parseSlotText,
} from "../../support/planner-a-helpers";

type Table = { hashes(): Record<string, string>[] };

function queryAll(): Map<string, boolean> {
  const catalog = requireCatalog();
  // 可看 = 開演到散場每一分鐘都有空（分鐘比較）
  const availability = ensureState().availability ?? [];
  const map = new Map<string, boolean>();
  for (const s of catalog.sessions) map.set(s.session_id, isSessionAvailable(s, availability));
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
  // 對每個日期各呼叫一次「從有空時段扣掉區間」
  let avail = state.availability ?? [];
  for (const date of dates) avail = subtractInterval(avail, date, start_min ?? 0, end_min ?? 1440);
  state.availability = avail;
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

// 觀眾查看有空時段
When("觀眾查看有空時段", async () => {
  const ctx = getCtx();
  const state = ensureState();
  ctx.stateSnapshotAtQuery = JSON.stringify(state);
  ctx.world.lastAvailability = JSON.parse(JSON.stringify(state.availability ?? []));
  expect(JSON.stringify(state), "查詢是純查詢，不得改使用者狀態").toBe(ctx.stateSnapshotAtQuery);
});

function fmt(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** 有空時段 → 表格文字：區間由早到晚以「、」連接；沒有任何區間 = 整天沒空 */
function availabilityText(intervals: { start_min: number; end_min: number }[]): string {
  if (intervals.length === 0) return "整天沒空";
  return intervals.map((iv) => `${fmt(iv.start_min)}–${fmt(iv.end_min)}`).join("、");
}

// 有空時段如下：
Then("有空時段如下：", async ({}, dataTable: Table) => {
  const state = ensureState();
  const rows = (state.availability ?? [])
    .map((d) => `${d.date} ${availabilityText(d.intervals)}`)
    .sort();
  const expected = dataTable.hashes().map((r) => `${r["日期"].trim()} ${r["有空時段"].trim()}`).sort();
  // 權威狀態：不是全天有空的日期恰為表格各列（未列出的日期全天有空）
  expect(rows, "有空時段須恰為表格各列（已正規化：合併相鄰、由早到晚）").toEqual(expected);
  // 再讀確認：重新讀取使用者狀態仍一致
  const reread = JSON.parse(JSON.stringify(state)) as typeof state;
  expect((reread.availability ?? []).map((d) => `${d.date} ${availabilityText(d.intervals)}`).sort()).toEqual(expected);
});
