import type { DataTable } from "playwright-bdd";
import { Given, When, Then, expect, buildState, filmCard, filmIdOf, openTab, type WebWorld } from "../../support/web-a-helpers";
import { TIER_LABEL_TO_ENUM } from "../../support/tables";
import { STORAGE_KEY } from "../../../src/state/storage";
import type { Page } from "@playwright/test";
import type { UserState } from "../../../src/domain/types";

const UNKNOWN_VALUE = { kept: true };

function stateFromTable(world: WebWorld, table: DataTable): UserState {
  world.prefs.push(...table.hashes().map((r) => ({ title: r["片名"], tier: TIER_LABEL_TO_ENUM[r["層級"]], is_hot: false })));
  const s = buildState(world);
  world.prefs.length = 0;
  return s;
}

async function preload(page: Page, state: unknown): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(state)] as const,
  );
}

async function patchStored(page: Page, fn: string): Promise<void> {
  await page.evaluate(
    ([key, body]) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error("沒有保存內容");
      const s = JSON.parse(raw);
      new Function("s", body)(s);
      window.localStorage.setItem(key, JSON.stringify(s));
    },
    [STORAGE_KEY, fn] as const,
  );
}

async function stored(page: Page): Promise<Record<string, unknown>> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
  return JSON.parse(raw ?? "{}");
}

/** 回應 version.json：模擬網站目前部署的版本 */
async function deployedVersion(page: Page, build: number): Promise<void> {
  await page.route("**/version.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ build_id: String(build), build_number: build }),
    }),
  );
}

Given("觀眾已打開選片頁", async ({ page, world }) => {
  await openTab(page, world, "選片");
  await expect(page.getByTestId("film-card").first()).toBeVisible();
});

Given("保存內容被較新版本加上未知欄位 {string}", async ({ page }, field: string) => {
  await patchStored(page, `s[${JSON.stringify(field)}] = ${JSON.stringify(UNKNOWN_VALUE)};`);
});

Given("保存的 {string} 層級項目被較新版本加上未知欄位 {string}", async ({ page, world }, title: string, field: string) => {
  const id = filmIdOf(world, title);
  await patchStored(
    page,
    `s.film_preferences.find((p) => p.film_id === ${JSON.stringify(id)})[${JSON.stringify(field)}] = ${JSON.stringify(UNKNOWN_VALUE)};`,
  );
});

Given("保存內容含未知欄位 {string} 與影片層級如下：", async ({ page, world }, field: string, table: DataTable) => {
  await preload(page, { ...stateFromTable(world, table), [field]: UNKNOWN_VALUE });
});

Given("保存內容由較新的版本寫入，影片層級如下：", async ({ page, world }, table: DataTable) => {
  await preload(page, { ...stateFromTable(world, table), written_by_build: 2000 });
});

Given("目前分頁的版本比保存內容舊", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __GHFF_BUILD__: number }).__GHFF_BUILD__ = 1000;
  });
  await deployedVersion(page, 1000);
});

Given("網站已部署較新的版本", async ({ page }) => {
  await deployedVersion(page, 99_999_999_999_999);
});

When("觀眾打開選片頁", async ({ page, world }) => {
  await openTab(page, world, "選片");
  await expect(page.getByTestId("film-card").first()).toBeVisible();
});

When("觀眾嘗試把 {string} 標為 {string}", async ({ page }, title: string, tier: string) => {
  await filmCard(page, title).getByRole("button", { name: tier, exact: true }).click();
});

Then("保存內容仍保有未知欄位 {string}", async ({ page }, field: string) => {
  await expect.poll(async () => (await stored(page))[field]).toEqual(UNKNOWN_VALUE);
});

Then("保存的 {string} 層級項目仍保有未知欄位 {string}", async ({ page, world }, title: string, field: string) => {
  const id = filmIdOf(world, title);
  await expect
    .poll(async () => {
      const prefs = (await stored(page)).film_preferences as Array<Record<string, unknown>>;
      return prefs.find((p) => p.film_id === id)?.[field];
    })
    .toEqual(UNKNOWN_VALUE);
});

Then("畫面顯示更新橫幅 {string}", async ({ page }, text: string) => {
  const banner = page.getByTestId("update-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(text);
  await expect(banner.getByRole("button", { name: "重新整理", exact: true })).toBeVisible();
});

Then("畫面顯示修改未保存的提示", async ({ page }) => {
  await expect(page.getByTestId("write-blocked")).toContainText("目前版本已過期，修改未保存");
});

Then("畫面沒有更新橫幅", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
});
