import { expect } from "@playwright/test";
import { minToHhmm, TIER_ENUM_TO_LABEL, symbolsFromMarks } from "../../support/tables";
import {
  Given,
  Then,
  absMin,
  bruteForceBest,
  buildStressData,
  compareObjective,
  filmIdOf,
  getCtx,
  objectiveOf,
  pairwiseCompatible,
  requireCatalog,
  ensureState,
  sessionById,
  titleOf,
} from "../../support/planner-a-helpers";

type Table = { hashes(): Record<string, string>[] };

function itinerary() {
  const result = getCtx().world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  return result!.itinerary;
}

// 影展場次表為 {影片數} 部已分層影片、每部 {場次數} 個場次的壓力資料
Given("影展場次表為 {int} 部已分層影片、每部 {int} 個場次的壓力資料", async ({}, films: number, perFilm: number) => {
  const ctx = getCtx();
  const { catalog, state } = buildStressData(films, perFilm);
  ctx.world.catalog = catalog;
  ctx.world.state = state;
  ctx.world.lastResult = null;
  ctx.world.elapsedMs = null;
  ctx.ticketList = null;
});

// 行程依日期排列如下：
Then("行程依日期排列如下：", async ({}, dataTable: Table) => {
  const it = itinerary();
  const rows = it.map((e) => {
    const s = sessionById(e.session_id);
    return {
      s,
      日期: s.date,
      開演: minToHhmm(s.start_min),
      散場: minToHhmm(s.end_min % 1440),
      片名: titleOf(s.film_id),
      影廳: s.venue_name,
      層級: TIER_ENUM_TO_LABEL[e.tier],
      標記: symbolsFromMarks(s.marks),
    };
  });
  // 順序依日期、開演時間
  for (let i = 1; i < rows.length; i++) {
    expect(absMin(rows[i].s.date, rows[i].s.start_min), "行程須依日期、開演時間排序").toBeGreaterThanOrEqual(
      absMin(rows[i - 1].s.date, rows[i - 1].s.start_min),
    );
  }
  const expected = dataTable.hashes();
  expect(rows.length, "行程列數").toBe(expected.length);
  expected.forEach((r, i) => {
    const a = rows[i];
    expect(a.日期, `第 ${i + 1} 列 日期`).toBe(r["日期"].trim());
    expect(a.開演, `第 ${i + 1} 列 開演`).toBe(minToHhmm(toMin(r["開演"])));
    expect(a.散場, `第 ${i + 1} 列 散場`).toBe(minToHhmm(toMin(r["散場"])));
    expect(a.片名, `第 ${i + 1} 列 片名`).toBe(r["片名"].trim());
    expect(a.影廳, `第 ${i + 1} 列 影廳`).toBe(r["影廳"].trim());
    expect(a.層級, `第 ${i + 1} 列 層級`).toBe(r["層級"].trim());
    const mark = (r["標記"] ?? "").trim();
    if (mark) expect([...a.標記].sort().join(""), `第 ${i + 1} 列 標記`).toBe([...mark].sort().join(""));
  });
  const titles = rows.map((r) => r.片名);
  expect(new Set(titles).size, "同一影片不得出現兩列").toBe(titles.length);
});

function toMin(t: string): number {
  const [h, m] = t.trim().split(":").map(Number);
  return h * 60 + m;
}

// 行程中 "{片名}" 標示 "{標示}"
Then("行程中 {string} 標示 {string}", async ({}, title: string, label: string) => {
  expect(label, "目前僅支援標示「非售票」").toBe("非售票");
  const fid = filmIdOf(title);
  const entries = itinerary().filter((e) => sessionById(e.session_id).film_id === fid);
  expect(entries.length, `行程應含 "${title}"`).toBeGreaterThan(0);
  for (const e of entries) {
    expect(e.is_non_ticketed, "行程列應標示非售票").toBe(true);
    expect(sessionById(e.session_id).marks).toContain("non_ticketed");
  }
});

// 行程中 "{片名}" 只出現 {次數} 次
Then("行程中 {string} 只出現 {int} 次", async ({}, title: string, n: number) => {
  const fid = filmIdOf(title);
  expect(itinerary().filter((e) => sessionById(e.session_id).film_id === fid)).toHaveLength(n);
});

// 行程的排程目標不劣於窮舉所有可行組合
Then("行程的排程目標不劣於窮舉所有可行組合", async () => {
  const catalog = requireCatalog();
  const state = ensureState();
  const it = itinerary();
  const sessions = it.map((e) => sessionById(e.session_id));
  expect(new Set(sessions.map((s) => s.film_id)).size, "每片至多一場").toBe(sessions.length);
  expect(pairwiseCompatible(sessions), "行程內場次須兩兩相容").toBe(true);
  const best = bruteForceBest(catalog, state);
  const actual = objectiveOf(it, catalog);
  expect(compareObjective(actual, best), `行程目標 ${actual} 應等於窮舉最大值 ${best}`).toBe(0);
});

// 排程在 {秒} 秒內完成
Then("排程在 {int} 秒內完成", async ({}, seconds: number) => {
  const ctx = getCtx();
  expect(ctx.world.elapsedMs, "尚未計時").not.toBeNull();
  expect(ctx.world.elapsedMs!).toBeLessThanOrEqual(seconds * 1000);
  const sessions = itinerary().map((e) => sessionById(e.session_id));
  expect(pairwiseCompatible(sessions), "行程不得有衝堂").toBe(true);
});
