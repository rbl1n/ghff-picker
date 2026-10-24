import type { DataTable } from "playwright-bdd";
import type { Page } from "@playwright/test";
import { Then, When, buildState, expect, openLanding, openUrl } from "../../support/web-a-helpers";
import { encodeLink } from "../../support/web-003-helpers";

const ONBOARDING_KEY = "ghff-picker:onboarding-seen";
const dialog = (page: Page) => page.getByTestId("onboarding-dialog");
const title = (page: Page) => page.getByTestId("onboarding-title");

async function show(page: Page, world: Parameters<typeof openLanding>[1]): Promise<void> {
  await openLanding(page, world);
  await expect(dialog(page)).toBeVisible();
}

async function toLastStep(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) await dialog(page).getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("4/4");
}

When("觀眾在使用說明按下「略過」", async ({ page, world }) => {
  await show(page, world);
  await dialog(page).getByRole("button", { name: "略過", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
});

When("觀眾逐步按「下一步」翻閱使用說明", async ({ page, world }) => {
  await show(page, world);
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    seen.push((await title(page).innerText()).trim());
    if (i < 3) {
      await expect(dialog(page).getByRole("button", { name: "開始使用" })).toHaveCount(0);
      await dialog(page).getByRole("button", { name: "下一步", exact: true }).click();
    }
  }
  (world as unknown as { onbTitles: string[] }).onbTitles = seen;
});

When("觀眾翻到使用說明最後一步並按下「開始使用」", async ({ page, world }) => {
  await show(page, world);
  await toLastStep(page);
  await dialog(page).getByRole("button", { name: "開始使用", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
});

When("觀眾在使用說明按下 Esc 鍵", async ({ page, world }) => {
  await show(page, world);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

When("觀眾按下頁首的「使用說明」", async ({ page, world }) => {
  await openLanding(page, world);
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "使用說明", exact: true }).click();
});

When("觀眾在使用說明連按 Tab 鍵 {int} 次", async ({ page, world }, n: number) => {
  await show(page, world);
  for (let i = 0; i < n; i++) await page.keyboard.press("Tab");
});

When("觀眾開啟同伴傳來的個人分享連結", async ({ page, world }) => {
  const state = buildState(world);
  await openUrl(page, world, encodeLink({ kind: "personal", schema_version: 3, sender_name: "小美", state }, "/"));
  await expect(page.getByRole("dialog")).toBeVisible();
});

Then("畫面顯示使用說明第 1 步 {string}", async ({ page }, text: string) => {
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("1/4");
  await expect(title(page)).toHaveText(text);
  await expect(dialog(page).getByRole("button", { name: "上一步" })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "下一步", exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "略過", exact: true })).toBeVisible();
});

Then("使用說明依序顯示以下步驟標題：", async ({ world }, table: DataTable) => {
  const seen = (world as unknown as { onbTitles: string[] }).onbTitles;
  const rows = table.hashes();
  expect(seen).toHaveLength(rows.length);
  rows.forEach((r, i) => expect(seen[i]).toBe(r["標題"].trim()));
});

Then("使用說明已關閉，重新載入後不再出現", async ({ page }) => {
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), ONBOARDING_KEY)).not.toBeNull();
  await page.reload();
  await page.getByRole("navigation", { name: "主要分頁" }).waitFor({ state: "visible" });
  await expect(dialog(page)).toHaveCount(0);
});

Then("鍵盤焦點仍在使用說明內", async ({ page }) => {
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="onboarding-dialog"]'));
  expect(inside).toBe(true);
});

Then("使用說明沒有水平溢出，且所有按鈕高度至少 44px", async ({ page }) => {
  await expect(dialog(page)).toBeVisible();
  const r = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="onboarding-dialog"]')!.getBoundingClientRect();
    const btns = Array.from(document.querySelectorAll('[data-testid="onboarding-dialog"] button')).map((b) => b.getBoundingClientRect().height);
    const root = document.documentElement;
    return { right: d.right, left: d.left, vw: window.innerWidth, hScroll: root.scrollWidth > window.innerWidth + 1, btns };
  });
  expect(r.hScroll).toBe(false);
  expect(r.right).toBeLessThanOrEqual(r.vw);
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.btns.length).toBeGreaterThan(0);
  for (const h of r.btns) expect(h).toBeGreaterThanOrEqual(44);
});

Then("畫面只顯示分享連結的確認對話，沒有使用說明", async ({ page }) => {
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), ONBOARDING_KEY)).toBeNull();
});
