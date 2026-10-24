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
  expectFilterTitles,
  TIER_BUTTON,
  filmCard,
  filmIdOf,
  norm,
  openTab,
  shownFilmTitles,
  storedOrDefault,
  type WebWorld,
} from "../../support/web-a-helpers";
import { dragFilm } from "../../support/tier-drag";
import {
  expectContiguousRanks,
  orderByTier,
  prefsOf,
  readStateOrEmpty,
  shownTierOrder,
  tierGroupOf,
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
  // 004：不看的片在預設清單隱藏，要先切到「不看」篩選才找得到
  const fromSkipped = (await card.count()) === 0;
  if (fromSkipped) await page.locator(".chip", { hasText: "不看" }).click();
  await card.getByRole("button", { name: tier, exact: true }).click();
  if (fromSkipped) await expect(card).toHaveCount(0);
  else await expect(card.getByRole("button", { name: tier, exact: true })).toHaveAttribute("aria-pressed", "true");
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

/** 層內順序檢視：用鍵盤（空白鍵拿起、方向鍵一次、空白鍵放下）把該片移一位，等該片與相鄰者互換 */
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
  const handle = item.getByTestId("tier-drag-handle");
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press(dir === "上移" ? "ArrowUp" : "ArrowDown");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await shownTierOrder(page))[tier].join("、")).toBe(expected.join("、"));
  // 權威狀態：該層名次與相鄰者互換，其他層不變
  const prefs = prefsOf(await readStateOrEmpty(page));
  expectContiguousRanks(prefs);
  const byTier = orderByTier(prefs);
  expect(byTier[tier].map((id) => titleOf(world.catalog, id))).toEqual(expected);
  for (const t of TIERS.filter((x) => x !== tier)) expect(byTier[t].map((id) => titleOf(world.catalog, id))).toEqual(before[t]);
}

When("觀眾用鍵盤把 {string} 在層內上移一位", async ({ page, world }, title: string) => {
  await moveInTier(page, world, title, "上移");
});

When("觀眾用鍵盤把 {string} 在層內下移一位", async ({ page, world }, title: string) => {
  await moveInTier(page, world, title, "下移");
});

// 拖曳：桌機用滑鼠；手機尺寸用 CDP 真觸控（touchStart/Move/End），驗證把手在觸控下可拖
When("觀眾把 {string} 拖曳到 {string} 的第 {int} 位", async ({ page, world }, title: string, tierLabel: string, pos: number) => {
  await openTab(page, world, "選片");
  const toTier = TIER_FROM_LABEL[tierLabel];
  const before = await shownTierOrder(page);
  const fromTier = TIERS.find((t) => before[t].includes(title))!;
  const expected = before[toTier].filter((x) => x !== title);
  expected.splice(pos - 1, 0, title);
  await dragFilm(page, title, fromTier, toTier, pos - 1);
  await expect.poll(async () => (await shownTierOrder(page))[toTier].join("、")).toBe(expected.join("、"));
  await expect(page.locator(".oitem.dragging, [data-testid=tier-order-overlay]")).toHaveCount(0);
  // 權威狀態：目標層與原層名次皆 1 起連續
  const prefs = prefsOf(await readStateOrEmpty(page));
  expectContiguousRanks(prefs);
  expect(orderByTier(prefs)[toTier].map((id) => titleOf(world.catalog, id))).toEqual(expected);
});

When("觀眾在層內順序把 {string} 改為 {string}", async ({ page, world }, title: string, label: string) => {
  await openTab(page, world, "選片");
  const before = await shownTierOrder(page);
  const item = tierItemOf(page, title);
  await expect(item).toBeVisible();
  const btn = item.getByRole("button", { name: label, exact: true });
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  const fid = filmIdOf(world, title);
  if (label === "不看") {
    await expect(tierItemOf(page, title)).toHaveCount(0);
    await expect.poll(async () => (((await readStateOrEmpty(page)) as { skipped_film_ids?: string[] }).skipped_film_ids ?? []).includes(fid)).toBe(true);
  } else {
    const to = TIER_FROM_LABEL[label];
    const expected = [...before[to].filter((x) => x !== title), title];
    await expect.poll(async () => (await shownTierOrder(page))[to].join("、")).toBe(expected.join("、"));
  }
  expectContiguousRanks(prefsOf(await readStateOrEmpty(page)));
});

Then("選片頁 {string} 層顯示放置區 {string}", async ({ page, world }, tierLabel: string, hint: string) => {
  await openTab(page, world, "選片");
  const tier = TIER_FROM_LABEL[tierLabel];
  const group = tierGroupOf(page, tier);
  await expect(group.getByTestId("tier-order-item")).toHaveCount(0);
  const zone = group.getByTestId("tier-drop-zone");
  await expect(zone).toHaveText(hint);
  const box = (await zone.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(prefsOf(await readStateOrEmpty(page)).filter((p) => p.tier === tier)).toHaveLength(0);
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
  await card.getByRole("button", { pressed: true, name: TIER_BUTTON }).click();
  await expect(card.getByRole("button", { pressed: true, name: TIER_BUTTON })).toHaveCount(0);
});

When("觀眾把 {string} 標為熱門", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  // 不展開卡片：熱門開關在卡片外觀上
  expect(await card.locator("details").first().evaluate((e) => (e as HTMLDetailsElement).open), "卡片應維持收合").toBe(false);
  const box = await card.getByRole("checkbox", { name: /熱門/ }).locator("xpath=ancestor::label").boundingBox();
  expect(box!.height, "觸控目標 ≥ 44px").toBeGreaterThanOrEqual(44);
  await card.getByRole("checkbox", { name: /熱門/ }).check();
  await expect(card.getByTestId("hot-badge")).toBeVisible();
  expect(await card.locator("details").first().evaluate((e) => (e as HTMLDetailsElement).open), "卡片仍收合").toBe(false);
});

// 004：不看與三個層級互斥；標為不看後從預設清單消失
When("觀眾把 {string} 標為不看", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await card.getByRole("button", { name: "不看", exact: true }).click();
  await expect(card).toHaveCount(0);
  const fid = filmIdOf(world, title);
  await expect.poll(async () => (await storedOrDefault(page)).skipped_film_ids?.includes(fid) ?? false).toBe(true);
  expect((await storedOrDefault(page)).film_preferences.some((p) => p.film_id === fid), "不看與層級互斥").toBe(false);
  expectContiguousRanks(prefsOf(await readStateOrEmpty(page)));
});

When("觀眾取消 {string} 的不看", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  await page.locator(".chip", { hasText: "不看" }).click();
  const card = filmCard(page, title);
  await card.getByRole("button", { name: "不看", exact: true }).click();
  await expect(card).toHaveCount(0);
  const fid = filmIdOf(world, title);
  await expect.poll(async () => (await storedOrDefault(page)).skipped_film_ids?.includes(fid) ?? false).toBe(false);
});

Then("選片頁 {string} 篩選列出的影片如下：", async ({ page, world }, filter: string, table: DataTable) => {
  await expectFilterTitles(page, world, filter, table.hashes().map((r) => r["片名"]));
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
  const pressed = card.getByRole("button", { pressed: true, name: TIER_BUTTON });
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
    expect([...TIER_LABELS, "不看"]).toContain(r["層級"]);
    expect(text).toMatch(new RegExp(`${r["數量"]}\\s*${r["層級"]}`));
    const n =
      r["層級"] === "不看"
        ? (st.skipped_film_ids ?? []).length
        : st.film_preferences.filter((p) => p.tier === TIER_LABEL_TO_ENUM[r["層級"]]).length;
    expect(n).toBe(Number(r["數量"]));
  }
});

Then("畫面提供重試按鈕", async ({ page }) => {
  const retry = page.getByRole("button", { name: "重試" });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  // 載入失敗不得顯示空白場次表當作成功
  await expect(page.getByTestId("film-card")).toHaveCount(0);
  await expect(page.getByTestId("session-row")).toHaveCount(0);
});

// 手冊片號
When("觀眾在選片頁搜尋 {string}", async ({ page, world }, keyword: string) => {
  await openTab(page, world, "選片");
  await page.getByRole("searchbox", { name: "搜尋片名" }).fill(keyword);
});

Then("選片頁列出的影片如下：", async ({ page }, table: DataTable) => {
  const expected = table.hashes().map((r) => r["片名"]);
  await expect.poll(() => shownFilmTitles(page)).toEqual(expected);
});

Then("選片頁 {string} 的片號顯示為 {string}", async ({ page, world }, title: string, no: string) => {
  await openTab(page, world, "選片");
  await expect(filmCard(page, title).getByTestId("catalog-no")).toHaveText(no);
});

Then("選片頁 {string} 沒有片號", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  await expect(filmCard(page, title)).toBeVisible();
  await expect(filmCard(page, title).getByTestId("catalog-no")).toHaveCount(0);
});

Then("層內順序檢視中 {string} 的片號顯示為 {string}", async ({ page }, title: string, no: string) => {
  const item = page.locator(`[data-testid="tier-order-item"][data-title="${title}"]`);
  await expect(item.getByTestId("catalog-no")).toHaveText(no);
});

Then("層內順序檢視中 {string} 的備註顯示為 {string}", async ({ page, world }, title: string, note: string) => {
  await openTab(page, world, "選片");
  const item = page.locator(`[data-testid="tier-order-item"][data-title="${title}"]`);
  await expect(item.getByTestId("order-note")).toHaveText(note);
  expect((await storedOrDefault(page)).film_notes?.[filmIdOf(world, title)]).toBe(note);
});

Then("層內順序檢視中 {string} 沒有備註", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const item = page.locator(`[data-testid="tier-order-item"][data-title="${title}"]`);
  await expect(item).toBeVisible();
  await expect(item.getByTestId("order-note")).toHaveCount(0);
});

// 官網連結
Then("選片頁 {string} 有官網介紹連結 {string}", async ({ page, world }, title: string, url: string) => {
  await openTab(page, world, "選片");
  const link = filmCard(page, title).getByTestId("film-official-link");
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

Then("選片頁 {string} 沒有官網介紹連結", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  await expect(filmCard(page, title)).toBeVisible();
  await expect(filmCard(page, title).getByTestId("film-official-link")).toHaveCount(0);
});

// 影片備註
async function openNoteEditor(page: Page, title: string) {
  const card = filmCard(page, title);
  await card.getByRole("button", { name: /^(編輯)?備註$/ }).click();
  const box = card.getByRole("textbox", { name: "備註內容" });
  await expect(box).toBeVisible();
  return { card, box };
}

When("觀眾為 {string} 寫下備註 {string}", async ({ page, world }, title: string, note: string) => {
  await openTab(page, world, "選片");
  const { card, box } = await openNoteEditor(page, title);
  await box.fill(note);
  await card.getByRole("button", { name: "確定", exact: true }).click();
  await expect(box).toHaveCount(0);
  await expect(card.getByTestId("film-note")).toHaveText(note);
});

When("觀眾清空 {string} 的備註", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const { card, box } = await openNoteEditor(page, title);
  await box.fill("");
  await card.getByRole("button", { name: "確定", exact: true }).click();
  await expect(card.getByTestId("film-note")).toHaveCount(0);
});

When("觀眾展開 {string} 的備註", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  await filmCard(page, title).getByTestId("film-note").click();
});

Then("選片頁 {string} 的備註顯示為 {string}", async ({ page, world }, title: string, note: string) => {
  await openTab(page, world, "選片");
  const fid = filmIdOf(world, title);
  const check = async () => {
    await expect(filmCard(page, title).getByTestId("film-note")).toHaveText(note);
    await expect.poll(async () => (await storedOrDefault(page)).film_notes?.[fid]).toBe(note);
  };
  await check();
  await page.reload();
  await check();
});

Then("選片頁 {string} 沒有備註", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await expect(card).toBeVisible();
  await expect(card.getByTestId("film-note")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "備註", exact: true })).toBeVisible();
  const fid = filmIdOf(world, title);
  expect((await storedOrDefault(page)).film_notes?.[fid]).toBeUndefined();
});

Then("選片頁 {string} 的備註預設只顯示兩行", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const note = filmCard(page, title).getByTestId("film-note");
  await expect(note).toBeVisible();
  const { clamp, clipped } = await note.evaluate((e) => ({
    clamp: getComputedStyle(e).webkitLineClamp,
    clipped: e.scrollHeight > e.clientHeight,
  }));
  expect(clamp, "最多 2 行").toBe("2");
  expect(clipped, "內容超過兩行而被截斷").toBe(true);
});

Then("選片頁 {string} 的備註顯示全文", async ({ page, world }, title: string) => {
  const note = filmCard(page, title).getByTestId("film-note");
  const full = (await storedOrDefault(page)).film_notes?.[filmIdOf(world, title)];
  await expect(note).toHaveText(full!);
  expect(await note.evaluate((e) => e.scrollHeight <= e.clientHeight), "沒有被截斷").toBe(true);
});

// 短片單元
Then("選片頁 {string} 的短片顯示為 {string}", async ({ page, world }, title: string, list: string) => {
  await openTab(page, world, "選片");
  const text = (await filmCard(page, title).getByTestId("film-shorts").innerText()).replace(/\s+/g, " ").trim();
  expect(text).toBe(list.split("、").join("・"));
});

Then("選片頁 {string} 沒有短片清單", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  await expect(filmCard(page, title)).toBeVisible();
  await expect(filmCard(page, title).getByTestId("film-shorts")).toHaveCount(0);
});
