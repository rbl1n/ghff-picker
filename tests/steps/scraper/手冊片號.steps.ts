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
