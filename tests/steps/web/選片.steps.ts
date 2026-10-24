import type { Page } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import {
  MARK_NAME,
  TIER_LABELS,
  TIER_LABEL_TO_ENUM,
  When,
  Then,
  Given,
  dateDisp,
  expect,
  expandCard,
  filmCard,
  filmIdOf,
  norm,
  openTab,
  storedOrDefault,
  type WebWorld,
} from "../../support/web-a-helpers";
import {
  expectContiguousRanks,
  orderByTier,
  prefsOf,
  readStateOrEmpty,
  shownTierOrder,
  tierItemOf,
  TIERS,
  TIER_FROM_LABEL,
  titleOf,
} from "../../support/web-003-helpers";

Given("場次資料無法載入", async ({ world }) => {
  world.failSessions = true;
});

// T049（003）：新標記或改層的影片排在目標層最後，原層後面的影片名次遞補
When("觀眾把 {string} 標為 {string}", async ({ page, world }, title: string, tier: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await card.getByRole("button", { name: tier, exact: true }).click();
  await expect(card.getByRole("button", { name: tier, exact: true })).toHaveAttribute("aria-pressed", "true");
  // 權威狀態：該片在目標層最後，各層名次仍從 1 連續
  const fid = filmIdOf(world, title);
  await expect
    .poll(async () => {
      const prefs = prefsOf(await readStateOrEmpty(page));
      const mine = prefs.find((p) => p.film_id === fid);
      const inTier = prefs.filter((p) => p.tier === TIER_FROM_LABEL[tier]);
      return mine?.tier_rank === inTier.length;
    })
    .toBe(true);
  expectContiguousRanks(prefsOf(await readStateOrEmpty(page)));
});

/** 層內順序檢視：點該片的上移／下移恰好一次，等該片與相鄰者互換 */
async function moveInTier(page: Page, world: WebWorld, title: string, dir: "上移" | "下移"): Promise<void> {
  await openTab(page, world, "選片");
  const item = tierItemOf(page, title);
  await expect(item).toBeVisible();
  const before = await shownTierOrder(page);
  const tier = TIERS.find((t) => before[t].includes(title))!;
  const idx = before[tier].indexOf(title);
  const swapWith = dir === "上移" ? idx - 1 : idx + 1;
  expect(swapWith, `${title} 不在邊界`).toBeGreaterThanOrEqual(0);
  expect(swapWith).toBeLessThan(before[tier].length);
  const expected = [...before[tier]];
  [expected[idx], expected[swapWith]] = [expected[swapWith], expected[idx]];
  await item.getByRole("button", { name: dir, exact: true }).click();
  await expect.poll(async () => (await shownTierOrder(page))[tier].join("、")).toBe(expected.join("、"));
  // 權威狀態：該層名次與相鄰者互換，其他層不變
  const prefs = prefsOf(await readStateOrEmpty(page));
  expectContiguousRanks(prefs);
  const byTier = orderByTier(prefs);
  expect(byTier[tier].map((id) => titleOf(world.catalog, id))).toEqual(expected);
  for (const t of TIERS.filter((x) => x !== tier)) expect(byTier[t].map((id) => titleOf(world.catalog, id))).toEqual(before[t]);
}

// T050（003）
When("觀眾把 {string} 在層內上移一位", async ({ page, world }, title: string) => {
  await moveInTier(page, world, title, "上移");
});

// T051（003）
When("觀眾把 {string} 在層內下移一位", async ({ page, world }, title: string) => {
  await moveInTier(page, world, title, "下移");
});

When("觀眾在選片頁展開 {string}", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await expandCard(card);
  await expect(card.getByTestId("session-row").first()).toBeVisible();
});

When("觀眾查看標記說明", async ({ page, world }) => {
  await openTab(page, world, "選片");
  const legend = page.getByTestId("mark-legend");
  if (!(await legend.isVisible())) await page.getByText("標記說明", { exact: true }).first().click();
  await expect(legend).toBeVisible();
});

When("觀眾開啟工具", async ({ page, world }) => {
  await openTab(page, world, "選片");
  await page
    .getByTestId("film-card")
    .or(page.getByTestId("load-error"))
    .or(page.getByTestId("tier-counts"))
    .first()
    .waitFor();
});

When("觀眾取消 {string} 的標記", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await card.getByRole("button", { pressed: true }).click();
  await expect(card.getByRole("button", { pressed: true })).toHaveCount(0);
});

When("觀眾把 {string} 標為熱門", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await expandCard(card);
  await card.getByRole("checkbox", { name: /熱門/ }).check();
  await expect(card.getByTestId("hot-badge")).toBeVisible();
});

Then("選片頁顯示 {string} 的場次如下：", async ({ page, world }, title: string, table: DataTable) => {
  const rows = table.hashes();
  const card = filmCard(page, title);
  const sessionRows = card.getByTestId("session-row");
  await expect(sessionRows).toHaveCount(rows.length);
  const cardText = norm(await card.textContent());
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const text = norm(await sessionRows.nth(i).textContent());
    for (const part of [dateDisp(r["日期"]), r["開演"], `${r["片長"]} 分鐘`, r["影廳"]]) expect(text).toContain(part);
    expect(cardText).toContain(r["分級"]);
    const wanted = MARK_NAME.filter((n) => (r["標記"] ?? "").includes(n));
    for (const n of MARK_NAME) {
      if (wanted.includes(n)) expect(text).toContain(n);
      else expect(text).not.toContain(n);
    }
  }
  // 權威狀態：與快照中該片的場次一致
  const fid = filmIdOf(world, title);
  const snapshot = world.catalog!.sessions.filter((s) => s.film_id === fid);
  expect(snapshot).toHaveLength(rows.length);
  // 不該混入其他影片的場次：場次列數已與該片快照一致
});

Then("畫面顯示標記說明如下：", async ({ page }, table: DataTable) => {
  const legend = page.getByTestId("mark-legend");
  await expect(legend).toBeVisible();
  const text = norm(await legend.textContent());
  for (const r of table.hashes()) {
    expect(text).toContain(`${r["標記"]} ${r["意義"]}`);
  }
});

Then("{string} 的層級顯示為 {string}", async ({ page, world }, title: string, tier: string) => {
  const card = filmCard(page, title);
  const pressed = card.getByRole("button", { pressed: true });
  if (tier === "未標記") {
    await expect(pressed).toHaveCount(0);
  } else {
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveText(tier);
  }
  // 權威狀態（不重新載入）
  const fid = filmIdOf(world, title);
  await expect
    .poll(async () => (await storedOrDefault(page)).film_preferences.find((p) => p.film_id === fid)?.tier ?? "未標記")
    .toBe(tier === "未標記" ? "未標記" : TIER_LABEL_TO_ENUM[tier]);
});

Then("選片頁頁首計數如下：", async ({ page }, table: DataTable) => {
  const counts = page.getByTestId("tier-counts");
  await expect(counts).toBeVisible();
  const text = norm(await counts.textContent());
  const st = await storedOrDefault(page);
  for (const r of table.hashes()) {
    expect(TIER_LABELS).toContain(r["層級"] as (typeof TIER_LABELS)[number]);
    expect(text).toMatch(new RegExp(`${r["數量"]}\\s*${r["層級"]}`));
    const n = st.film_preferences.filter((p) => p.tier === TIER_LABEL_TO_ENUM[r["層級"]]).length;
    expect(n).toBe(Number(r["數量"]));
  }
});

// T052（003）
Then("{string} 的層內 {string} 按鈕停用", async ({ page, world }, title: string, dir: string) => {
  expect(["上移", "下移"]).toContain(dir);
  await openTab(page, world, "選片");
  const item = tierItemOf(page, title);
  await expect(item).toBeVisible();
  const btn = item.getByRole("button", { name: dir, exact: true });
  await expect(btn).toBeDisabled();
  // 權威狀態：嘗試點擊後層內名次不變，也不得出現小於 1 的名次
  const before = JSON.stringify(prefsOf(await readStateOrEmpty(page)));
  await btn.click({ force: true });
  const after = prefsOf(await readStateOrEmpty(page));
  expect(JSON.stringify(after), "停用按鈕不得讓名次改變").toBe(before);
  expect(after.every((p) => p.tier_rank >= 1)).toBe(true);
  expectContiguousRanks(after);
});

Then("畫面提供重試按鈕", async ({ page }) => {
  const retry = page.getByRole("button", { name: "重試" });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  // 載入失敗不得顯示空白場次表當作成功
  await expect(page.getByTestId("film-card")).toHaveCount(0);
  await expect(page.getByTestId("session-row")).toHaveCount(0);
});
