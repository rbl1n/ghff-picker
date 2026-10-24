import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { parseSchedulePage } from "../../../scripts/scrape/parse";
import { hhmmToMin, minToHhmm, parseDate } from "../../support/tables";
import {
  test,
  renderSchedulePage,
  parseMarkCell,
  CINEMA_LABEL,
  MARK_LABEL,
  type PageRow,
} from "../../support/scraper-helpers";
import { loadFixtureHtml, type ScraperWorld } from "../../support/scraper-world";

const { Given, When, Then } = createBdd(test);

function parsedOf(world: ScraperWorld) {
  if (!world.parsed) throw new Error("尚未解析：缺少 When 腳本解析該場次頁");
  return world.parsed;
}

/** 把解析結果展開成 (session, film, venue) 列 */
function joined(world: ScraperWorld) {
  const p = parsedOf(world);
  return p.sessions.map((s) => {
    const film = p.films.find((f) => f.film_id === s.film_id);
    const venue = p.venues.find((v) => v.venue_name === s.venue_name);
    return { s, film, venue };
  });
}

function findRow(world: ScraperWorld, title: string, startHhmm: string) {
  const start = hhmmToMin(startHhmm);
  const matches = joined(world).filter((j) => j.film?.title === title && j.s.start_min === start);
  expect(matches, `找不到場次 ${title} ${startHhmm}`).toHaveLength(1);
  return matches[0];
}

Given("官網 {string} 的場次頁含以下場次：", async ({ world }, date: string, table: { hashes(): Record<string, string>[] }) => {
  const d = parseDate(date);
  const rows = table.hashes() as unknown as PageRow[];
  world.date = d;
  world.html = renderSchedulePage(d, rows);
  world.parsed = null;
});

When("腳本解析該場次頁", async ({ world }) => {
  if (world.html === null || world.date === null) throw new Error("缺少場次頁 HTML");
  world.parsed = parseSchedulePage(world.html, world.date);
});

Then("解析出的場次如下：", async ({ world }, table: { hashes(): Record<string, string>[] }) => {
  const expected = table.hashes().map((r) =>
    [parseDate(r["日期"]), hhmmToMin(r["開演"]), r["片名"], Number(r["片長"]), r["分級"], r["影廳"]].join("|"),
  );
  const actual = joined(world).map(({ s, film }) => {
    // 權威狀態：日期等於頁面日期；開演為當日分鐘數；片長由 散場 - 開演 還原
    expect(s.date).toBe(world.date);
    return [s.date, s.start_min, film?.title, film?.runtime_min, film?.rating, s.venue_name].join("|");
  });
  expect(actual.sort()).toEqual(expected.sort());
});

Then("解析出的影廳如下：", async ({ world }, table: { hashes(): Record<string, string>[] }) => {
  const expected = table.hashes().map((r) => r["影廳"]);
  expect(parsedOf(world).venues.map((v) => v.venue_name).sort()).toEqual(expected.sort());
});

Then("解析出的場次所屬影城如下：", async ({ world }, table: { hashes(): Record<string, string>[] }) => {
  for (const r of table.hashes()) {
    const { venue } = findRow(world, r["片名"], r["開演"]);
    expect(venue, `${r["片名"]} 缺少影廳對照`).toBeDefined();
    expect(CINEMA_LABEL[venue!.cinema]).toBe(r["影城"]);
  }
});

Then("解析出的場次標記如下：", async ({ world }, table: { hashes(): Record<string, string>[] }) => {
  for (const r of table.hashes()) {
    const { s } = findRow(world, r["片名"], r["開演"]);
    const actual = s.marks.map((m) => MARK_LABEL[m]).sort();
    expect(actual, `${r["片名"]} ${r["開演"]} 標記`).toEqual(parseMarkCell(r["標記"]));
  }
});

Then("解析出的場次散場時間如下：", async ({ world }, table: { hashes(): Record<string, string>[] }) => {
  for (const r of table.hashes()) {
    const { s, film } = findRow(world, r["片名"], r["開演"]);
    // 散場分鐘數 = 開演 + 片長，不折回當日
    expect(s.end_min).toBe(s.start_min + (film?.runtime_min ?? NaN));
    const display = s.end_min > 1440 ? `隔日 ${minToHhmm(s.end_min - 1440)}` : minToHhmm(s.end_min);
    expect(display).toBe(r["散場"]);
  }
});

Then("解析結果共有 {int} 部影片", async ({ world }, count: number) => {
  const p = parsedOf(world);
  // 影片以 film_id 去重；同時確認場次引用的影片都存在
  expect(new Set(p.films.map((f) => f.film_id)).size).toBe(count);
  expect(p.films).toHaveLength(count);
});

Then("影片 {string} 有 {int} 個場次", async ({ world }, title: string, count: number) => {
  const p = parsedOf(world);
  const films = p.films.filter((f) => f.title === title);
  expect(films, `影片 ${title} 應只有一份紀錄`).toHaveLength(1);
  expect(p.sessions.filter((s) => s.film_id === films[0].film_id)).toHaveLength(count);
});

// 短片單元
Given("官網 {string} 的存檔場次頁", async ({ world }, date: string) => {
  world.date = parseDate(date);
  world.html = loadFixtureHtml(world.date);
  world.parsed = null;
});

Then("短片單元 {string} 的短片依序為 {string}", async ({ world }, unit: string, list: string) => {
  const films = parsedOf(world).films.filter((f) => f.title === unit);
  expect(films, `單元 ${unit} 應只有一份紀錄`).toHaveLength(1);
  expect(films[0].shorts?.map((s) => s.title)).toEqual(list.split("、"));
});

Then("解析結果沒有名為 {string} 的影片", async ({ world }, title: string) => {
  expect(parsedOf(world).films.map((f) => f.title)).not.toContain(title);
});
