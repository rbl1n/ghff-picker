// planner/兩人合併 stepdefs（specs/truth/features/planner/兩人合併/dsl.md）
import { expect } from "@playwright/test";
import { mergePartner, singleSideCounts } from "../../../src/domain/merge";
import type { MergedView } from "../../../src/domain/types";
import {
  When,
  Then,
  TIER_LABEL_TO_ENUM,
  ensureState,
  getCtx,
  parseSlotText,
  slotToText,
  titleOf,
} from "../../support/planner-a-helpers";
import { catalogOrEmpty } from "../../support/planner-duo-helpers";
import { TIER_ENUM_TO_LABEL } from "../../support/tables";

type Table = { hashes(): Record<string, string>[] };

/** 雙方原始設定（自己的分層、熱門、不可看時段、每日上限、手動順序、搶票標記，及同伴資料）的 JSON 快照 */
function originals(): string {
  const { state, partner } = getCtx().world;
  return JSON.stringify({
    own: state && {
      film_preferences: state.film_preferences,
      unavailable_slots: state.unavailable_slots,
      daily_limit: state.daily_limit,
      manual_order: state.manual_order,
      ticket_marks: state.ticket_marks,
    },
    partner,
  });
}

function merged(): MergedView {
  const m = getCtx().world.lastMerged;
  expect(m, "尚未查看兩人合併結果").not.toBeNull();
  return m!;
}

function query(): MergedView {
  const world = getCtx().world;
  if (!world.partner) throw new Error("世界沒有同伴資料：兩人合併 When 在個人模式下不適用");
  const view = mergePartner(catalogOrEmpty(), ensureState(), world.partner);
  // singleSideCounts 與 mergePartner 的結果須一致
  const counts = singleSideCounts(catalogOrEmpty(), ensureState(), world.partner);
  return { ...view, single_side_counts: counts };
}

// 觀眾查看兩人合併結果
When("觀眾查看兩人合併結果", async () => {
  const world = getCtx().world;
  ensureState(); // 沒有 Given 自己設定時先補預設狀態，避免查詢時才建立而被誤判為寫入
  world.baseline = originals();
  world.lastMerged = query();
  expect(originals(), "查看合併結果不得寫入使用者狀態或同伴資料").toBe(world.baseline);
});

// 合併後參與排程的影片如下：
Then("合併後參與排程的影片如下：", async ({}, dataTable: Table) => {
  const m = merged();
  const rows = dataTable.hashes();
  const hasTier = rows.length > 0 && "層級" in rows[0];
  const hasHot = rows.length > 0 && "熱門" in rows[0];
  const byTitle = new Map(m.film_preferences.map((p) => [titleOf(p.film_id), p]));
  expect([...byTitle.keys()].sort(), "合併後影片集合須與表格完全一致").toEqual(rows.map((r) => r["片名"].trim()).sort());
  for (const r of rows) {
    const p = byTitle.get(r["片名"].trim())!;
    if (hasTier) {
      expect(TIER_ENUM_TO_LABEL[p.tier], `${r["片名"]} 合併層級`).toBe(r["層級"].trim());
      expect(TIER_LABEL_TO_ENUM[r["層級"].trim()]).toBe(p.tier);
    }
    if (hasHot) expect(p.is_hot, `${r["片名"]} 合併熱門`).toBe((r["熱門"] ?? "").trim() === "是");
  }
  // 權威狀態與再讀確認
  expect(originals(), "自己與同伴原始設定不得被改動").toBe(getCtx().world.baseline);
  const again = query();
  expect(JSON.stringify(again.film_preferences)).toBe(JSON.stringify(m.film_preferences));
});

// 合併後的不可看時段如下：
Then("合併後的不可看時段如下：", async ({}, dataTable: Table) => {
  const m = merged();
  const expected = dataTable.hashes().map((r) => `${r["日期"].trim()} ${slotToText(parseSlotText(r["日期"].trim(), r["時段"]))}`);
  const actual = m.unavailable_slots.map((s) => `${s.date} ${slotToText(s)}`);
  expect([...actual].sort(), "合併不可看時段恰為兩人時段聯集（列順序不比對）").toEqual([...expected].sort());
  expect(originals(), "自己與同伴原始不可看時段不得被改動").toBe(getCtx().world.baseline);
});

// 合併後的每日上限為 "{上限}"
Then("合併後的每日上限為 {string}", async ({}, limit: string) => {
  const m = merged();
  const expected = limit.trim() === "不設上限" ? null : Number(limit);
  expect(m.daily_limit, "合併每日上限").toBe(expected);
  expect(originals(), "自己與同伴原始每日上限不得被改動").toBe(getCtx().world.baseline);
});

// 單方標記的影片數如下：
Then("單方標記的影片數如下：", async ({}, dataTable: Table) => {
  const m = merged();
  const expected = { 自己: 0, 同伴: 0 } as Record<string, number>;
  for (const r of dataTable.hashes()) {
    const who = r["標記者"].trim();
    if (who !== "自己" && who !== "同伴") throw new Error(`未知標記者: ${who}`);
    expected[who] = Number(r["部數"]);
  }
  expect(m.single_side_counts.self, "只有自己標記的影片數").toBe(expected["自己"]);
  expect(m.single_side_counts.partner, "只有同伴標記的影片數").toBe(expected["同伴"]);
  // 權威狀態：單方標記的影片不在合併後參與排程的影片中
  const world = getCtx().world;
  const catalogIds = new Set(catalogOrEmpty().films.map((f) => f.film_id));
  const mergedIds = new Set(m.film_preferences.map((p) => p.film_id));
  const selfIds = new Set(ensureState().film_preferences.map((p) => p.film_id));
  const partnerIds = new Set(world.partner!.film_preferences.map((p) => p.film_id));
  for (const id of catalogIds) {
    if (selfIds.has(id) !== partnerIds.has(id)) {
      expect(mergedIds.has(id), `單方標記的 ${titleOf(id)} 不得參與排程`).toBe(false);
    }
  }
});

// 雙方原始設定與合併前相同
Then("雙方原始設定與合併前相同", async () => {
  const world = getCtx().world;
  expect(world.baseline, "尚未記下基準快照（缺少查看合併結果）").not.toBeNull();
  expect(originals(), "雙方原始設定須等於合併前快照").toBe(world.baseline);
  // 不該發生：合併不得把同伴的分層或時段寫進自己的使用者狀態
  const selfIds = new Set(ensureState().film_preferences.map((p) => p.film_id));
  const before = JSON.parse(world.baseline!).own.film_preferences.map((p: { film_id: string }) => p.film_id);
  expect([...selfIds].sort()).toEqual([...before].sort());
});
