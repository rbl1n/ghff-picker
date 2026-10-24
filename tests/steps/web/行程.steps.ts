import type { DataTable } from "playwright-bdd";
import { Given, When, Then, expect, filmCard, navLink, norm, openTab, pressSchedule, storedOrDefault } from "../../support/web-a-helpers";
import { TIER_LABEL_TO_ENUM } from "../../support/tables";
import {
  engineOf,
  reasonFragments,
  EMPTY_ITINERARY_TEXT,
  itineraryItems,
  STALE_BANNER_TEXT,
  unscheduledBox,
  waitItineraryReady,
} from "../../support/web-b-helpers";
import { hasPartner, readState, singleSideTitles } from "../../support/web-duo-helpers";

// T097
Given("觀眾已排好行程，之後又把 {string} 標為 {string}", async ({ page, world }, title: string, tier: string) => {
  if (!(tier in TIER_LABEL_TO_ENUM)) throw new Error(`unknown tier: ${tier}`);
  await openTab(page, world, "選片");
  await pressSchedule(page);
  await navLink(page, "選片").click();
  await filmCard(page, title).getByRole("button", { name: tier, exact: true }).click();
  await navLink(page, "行程").click();
  await page.getByText(STALE_BANNER_TEXT, { exact: true }).waitFor({ state: "visible" });
});

// T098
When("觀眾按下排行程", async ({ page, world }) => {
  await openTab(page, world, "選片");
  await pressSchedule(page);
});

// T099
When("觀眾開啟行程頁", async ({ page, world }) => {
  if (!world.opened) await openTab(page, world, "選片");
  await navLink(page, "行程").click();
  // 條件已變更時舊行程仍在，橫幅也算行程頁內容
  await waitItineraryReady(page).catch(async () => {
    await page.getByText(STALE_BANNER_TEXT, { exact: true }).waitFor({ state: "visible", timeout: 2_000 });
  });
});

// T100
When("觀眾按下重新排程", async ({ page }) => {
  await page.getByRole("button", { name: "重新排程", exact: true }).click();
  await page.getByText(STALE_BANNER_TEXT, { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });
  await waitItineraryReady(page);
});

// T101
Then("行程頁摘要顯示如下：", async ({ page }, dataTable: DataTable) => {
  const state = await storedOrDefault(page);
  for (const row of dataTable.hashes()) {
    const tier = TIER_LABEL_TO_ENUM[row["層級"]];
    const cell = page.getByTestId(`itinerary-summary-${tier}`);
    await expect(cell, `摘要 ${row["層級"]}`).toBeVisible();
    const m = /(\d+)\s*\/\s*(\d+)/.exec(norm(await cell.innerText()));
    expect(m, `摘要格式 x/y：${row["層級"]}`).not.toBeNull();
    expect(Number(m![1]), `${row["層級"]} 已排入`).toBe(Number(row["已排入"]));
    expect(Number(m![2]), `${row["層級"]} 總數`).toBe(Number(row["總數"]));
    // 權威狀態：y 等於使用者狀態中該層級影片數
    expect(state.film_preferences.filter((f) => f.tier === tier).length, `使用者狀態中 ${row["層級"]} 影片數`).toBe(
      Number(row["總數"]),
    );
    // x 等於行程列中該層級影片數
    const inItinerary = await page.locator(`[data-testid="itinerary-entry"][data-tier="${tier}"]`).count();
    expect(inItinerary, `行程列中 ${row["層級"]} 影片數`).toBe(Number(row["已排入"]));
  }
});

// T102
Then("行程頁頂部紅框顯示 {string}", async ({ page }, message: string) => {
  const box = unscheduledBox(page);
  await expect(box).toBeVisible();
  await expect(box.getByRole("heading", { name: message, exact: true })).toBeVisible();
});

// T103
Then("行程頁列出未排入的必看片與原因如下：", async ({ page, world }, dataTable: DataTable) => {
  const box = unscheduledBox(page);
  await expect(box).toBeVisible();
  const texts = (await box.getByRole("listitem").allInnerTexts()).map(norm);
  const actual = texts.map((t) => {
    const i = t.search(/[：:]/);
    return i < 0 ? { title: t, reason: "" } : { title: t.slice(0, i).trim(), reason: t.slice(i + 1).trim() };
  });
  const expected = dataTable.hashes().map((r) => ({ title: r["片名"], reason: r["原因"] }));
  expect(actual).toEqual(expected);
  // 權威狀態：原因與排程引擎對同一份使用者狀態算出的未排入原因一致
  const eng = await engineOf(page, world);
  expect(eng.unscheduled.map((u) => eng.titleOfFilm(u.film_id)).sort(), "未排入片名集合").toEqual(
    expected.map((e) => e.title).sort(),
  );
  for (const u of eng.unscheduled) {
    const shown = actual.find((a) => a.title === eng.titleOfFilm(u.film_id))!;
    for (const frag of reasonFragments(u.reason, (u.conflict_film_ids ?? []).map(eng.titleOfFilm))) {
      expect(shown.reason, `${shown.title} 原因應含「${frag}」`).toContain(frag);
    }
  }
});

// T104
Then("行程頁在 {string} 標示 {string}", async ({ page, world }, title: string, label: string) => {
  const row = itineraryItems(page).filter({ hasText: title });
  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText(label);
  if (label === "非售票") {
    const eng = await engineOf(page, world);
    const hit = eng.itinerary.find((e) => eng.titleOfFilm(eng.sessionById(e.session_id).film_id) === title);
    expect(hit?.is_non_ticketed, `引擎行程中 ${title} 應為非售票`).toBe(true);
  }
});

// T105
Then("行程頁沒有 {string}", async ({ page, world }, title: string) => {
  await expect(itineraryItems(page).first()).toBeVisible();
  await expect(itineraryItems(page).filter({ hasText: title })).toHaveCount(0);
  // 不該發生：未標記層級的影片不得被排入（引擎行程也不含該片）
  const eng = await engineOf(page, world);
  expect(eng.itinerary.map((e) => eng.titleOfFilm(eng.sessionById(e.session_id).film_id))).not.toContain(title);
});

// T106
Then("行程頁顯示提示 {string}", async ({ page }, hint: string) => {
  await expect(page.getByText(hint, { exact: true })).toBeVisible();
  if (hint === STALE_BANNER_TEXT) {
    // 不該發生：橫幅出現時不得自動覆蓋畫面上已顯示的舊行程
    await expect(itineraryItems(page).first()).toBeVisible();
  }
  if (hint === EMPTY_ITINERARY_TEXT) {
    await expect(itineraryItems(page)).toHaveCount(0);
  }
});

// T049
Then("行程頁頂部顯示單方標記統計 {string}", async ({ page, world }, stats: string) => {
  await openTab(page, world, "行程");
  const box = page.getByTestId("single-side-stats");
  await expect(box).toBeVisible();
  expect(norm(await box.innerText())).toBe(stats);
  // 權威狀態：兩個數字 = 各自只有單方分層、對方沒有、且存在於場次快照的影片數，且這些影片不在行程中
  const st = (await readState(page))!;
  const single = singleSideTitles(world.catalog!, st);
  const nums = [...stats.matchAll(/標記：(\d+) 部/g)].map((m) => Number(m[1]));
  expect(nums, "統計文字含兩個數字").toHaveLength(2);
  expect(nums).toEqual([single.self.length, single.partner.length]);
  for (const t of [...single.self, ...single.partner]) {
    await expect(itineraryItems(page).filter({ hasText: t }), `${t} 不應在行程中`).toHaveCount(0);
  }
});

// T050
Then("行程頁不顯示單方標記統計", async ({ page, world }) => {
  await openTab(page, world, "行程");
  await expect(page.getByTestId("single-side-stats")).toHaveCount(0);
  await expect(page.getByText(/只有 .+ 標記/)).toHaveCount(0);
  expect(hasPartner(await readState(page)), "個人模式：本機保存沒有同伴資料").toBe(false);
});
