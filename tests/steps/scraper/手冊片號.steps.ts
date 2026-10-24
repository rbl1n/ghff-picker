import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import type { DataTable } from "playwright-bdd";
import { applyCatalogNumbers } from "../../../scripts/scrape/catalog";
import { test } from "../../support/scraper-helpers";

const { Given, When, Then } = createBdd(test);

Given("官網影片依序為 {string}、{string}、{string}", async ({ world }, a: string, b: string, c: string) => {
  world.films = [a, b, c].map((title, i) => ({ film_id: String(100 + i), title, runtime_min: 90, rating: "普" }));
});

Given("官網影片依序為 {string}、{string}", async ({ world }, a: string, b: string) => {
  world.films = [a, b].map((title, i) => ({ film_id: String(100 + i), title, runtime_min: 90, rating: "普" }));
});

Given("手冊片號對照如下：", async ({ world }, table: DataTable) => {
  world.numbers = table.hashes().map((r) => {
    const film = world.films.find((f) => f.title === r["片名"]);
    if (!film) throw new Error(`官網影片沒有 ${r["片名"]}`);
    return { film_id: film.film_id, catalog_no: r["片號"], title: r["片名"] };
  });
});

When("腳本套用手冊片號", async ({ world }) => {
  world.numbered = applyCatalogNumbers(world.films, world.numbers);
});

Then("影片順序與片號如下：", async ({ world }, table: DataTable) => {
  const got = (world.numbered ?? []).map((f) => ({ 片名: f.title, 片號: f.catalog_no ?? "" }));
  expect(got).toEqual(table.hashes().map((r) => ({ 片名: r["片名"], 片號: r["片號"] ?? "" })));
  for (const f of world.numbered ?? []) if (!f.catalog_no) expect("catalog_no" in f).toBe(false);
});

// 短片單元
Given("官網短片單元 {string} 依序包含 {string}、{string}、{string}", async ({ world }, unit: string, a: string, b: string, c: string) => {
  world.films = [
    { film_id: "200", title: unit, runtime_min: 46, rating: "12+", shorts: [a, b, c].map((title) => ({ title })) },
  ];
});

Given("手冊短片頁碼對照如下：", async ({ world }, table: DataTable) => {
  const unit = world.films[0];
  const shorts = table.hashes().map((r) => ({ title: r["短片"], catalog_no: r["片號"] }));
  const min = shorts.map((s) => s.catalog_no).sort()[0];
  world.numbers = [{ film_id: unit.film_id, catalog_no: min, title: unit.title, shorts }];
});

Then("短片單元 {string} 的片號為 {string}，短片片號依序為 {string}", async ({ world }, unit: string, no: string, list: string) => {
  const film = (world.numbered ?? []).find((f) => f.title === unit);
  expect(film?.catalog_no).toBe(no);
  expect(film?.shorts?.map((s) => `${s.catalog_no} ${s.title}`)).toEqual(list.split("、"));
});
