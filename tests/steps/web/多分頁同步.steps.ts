import type { Page } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import { Given, When, Then, expect, filmCard, filmIdOf, installRoutes, navLink, openTab, storedOrDefault, type WebWorld } from "../../support/web-a-helpers";
import { TIER_LABEL_TO_ENUM } from "../../support/tables";
import { buildPersonalLink, duoOf, nameDialog, duoBanner } from "../../support/web-duo-helpers";

/** 分頁 B（分頁 A 就是測試主頁 page） */
const pagesB = new WeakMap<WebWorld, Page>();

function pageOf(page: Page, world: WebWorld, which: string): Page {
  if (which === "A") return page;
  const b = pagesB.get(world);
  if (!b) throw new Error("尚未開啟分頁 B");
  return b;
}

Given("觀眾在同一個瀏覽器開了分頁 A 與分頁 B", async ({ page, world, context }) => {
  await openTab(page, world, "選片");
  const b = await context.newPage();
  await installRoutes(b, world);
  await b.goto("/#/pick");
  pagesB.set(world, b);
  await expect(page.getByTestId("film-card").first()).toBeVisible();
  await expect(b.getByTestId("film-card").first()).toBeVisible();
});

When("觀眾在分頁 {word} 把 {string} 標為 {string}", async ({ page, world }, which: string, title: string, tier: string) => {
  const p = pageOf(page, world, which);
  await p.bringToFront();
  const btn = filmCard(p, title).getByRole("button", { name: tier, exact: true });
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
});

When("觀眾在分頁 A 開啟同伴的分享連結並以自己名稱 {string} 當作同伴 {string} 加入", async ({ page, world }, self: string, partner: string) => {
  const link = duoOf(world).link;
  if (!link) throw new Error("需先有 Given 同伴傳來個人分享連結");
  await page.bringToFront();
  // 只改 hash（不重新載入），就像在已開著的分頁貼上連結
  await page.evaluate((h) => {
    window.location.hash = h;
  }, link.url.slice(link.url.indexOf("#")));
  await page.getByRole("dialog").getByRole("button", { name: "當作同伴加入", exact: true }).click();
  const dlg = nameDialog(page);
  await dlg.getByLabel("自己名稱", { exact: true }).fill(self);
  await dlg.getByLabel("同伴名稱", { exact: true }).fill(partner);
  await dlg.getByRole("button", { name: "確認", exact: true }).click();
  await duoBanner(page).waitFor({ state: "visible" });
});

When("觀眾在分頁 A 復原上一版設定並確認", async ({ page }) => {
  await page.bringToFront();
  await navLink(page, "分享").click();
  await page.getByRole("button", { name: "復原上一版設定", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "確認", exact: true }).click();
  await expect(dlg).toHaveCount(0);
});

Then("分頁 {word} 的 {string} 層級顯示為 {string}", async ({ page, world }, which: string, title: string, tier: string) => {
  const p = pageOf(page, world, which);
  await p.bringToFront();
  if (!p.url().includes("#/pick")) await navLink(p, "選片").click();
  await expect(filmCard(p, title)).toHaveAttribute("data-tier", tier === "未標記" ? "" : TIER_LABEL_TO_ENUM[tier]);
});

Then("保存的影片層級如下：", async ({ page, world }, table: DataTable) => {
  const want = table
    .hashes()
    .map((r) => `${filmIdOf(world, r["片名"])}:${TIER_LABEL_TO_ENUM[r["層級"]]}`)
    .sort();
  await expect
    .poll(async () =>
      (await storedOrDefault(page)).film_preferences
        .map((p) => `${p.film_id}:${p.tier}`)
        .sort(),
    )
    .toEqual(want);
});

Then("保存的同伴名稱為 {string}", async ({ page }, partner: string) => {
  await expect.poll(async () => (await storedOrDefault(page)).partner?.display_name).toBe(partner);
});
