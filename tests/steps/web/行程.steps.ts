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
import { hasPartner, readState } from "../../support/web-duo-helpers";
import { filterControl, filterOf, participantTags, setFilter, type ItineraryFilter } from "../../support/web-003-helpers";

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

// T056（003）：新增可選欄「誰」（兩人模式標明是誰的必看，名字）
Then("行程頁列出未排入的必看片與原因如下：", async ({ page, world }, dataTable: DataTable) => {
  const box = unscheduledBox(page);
  await expect(box).toBeVisible();
  const hasWho = dataTable.raw()[0].includes("誰");
  const items = box.getByRole("listitem");
  // 標示是誰的必看的元素（data-testid=unscheduled-owner）不計入「片名：原因」文字
  const actual = (
    await items.evaluateAll((els) =>
      els.map((e) => {
        const clone = e.cloneNode(true) as HTMLElement;
        const ownerEl = clone.querySelector('[data-testid="unscheduled-owner"]');
        const owner = (ownerEl?.textContent ?? "").replace(/\s+/g, " ").trim();
        ownerEl?.remove();
        return { text: (clone.textContent ?? "").replace(/\s+/g, " ").trim(), owner };
      }),
    )
  ).map(({ text, owner }) => {
    const i = text.search(/[：:]/);
    const base = i < 0 ? { title: text, reason: "" } : { title: text.slice(0, i).trim(), reason: text.slice(i + 1).trim() };
    return hasWho ? { ...base, who: owner } : base;
  });
  const expected = dataTable.hashes().map((r) => ({ title: r["片名"], reason: r["原因"], ...(hasWho ? { who: r["誰"] } : {}) }));
  expect(actual).toEqual(expected);
  // 權威狀態：原因（與誰的必看）與排程引擎對同一份使用者狀態（兩人模式含同伴資料）算出的一致
  const eng = await engineOf(page, world);
  const nameOf = (owner: string | undefined) => (owner === "partner" ? eng.state.partner?.display_name : eng.state.self_name) ?? "";
  expect(
    eng.unscheduled.map((u) => `${eng.titleOfFilm(u.film_id)}${hasWho ? `|${nameOf(u.owner)}` : ""}`).sort(),
    "未排入片名集合",
  ).toEqual(expected.map((e) => `${e.title}${hasWho ? `|${(e as { who: string }).who}` : ""}`).sort());
  for (const u of eng.unscheduled) {
    const shown = actual.find((a) => a.title === eng.titleOfFilm(u.film_id) && (!hasWho || (a as { who: string }).who === nameOf(u.owner)))!;
    for (const frag of reasonFragments(u.reason, (u.conflict_film_ids ?? []).map(eng.titleOfFilm))) {
      expect(shown.reason, `${shown.title} 原因應含「${frag}」`).toContain(frag);
    }
  }
  // 不該發生：只被另一人標為必看的片不得掛在此人名下（引擎的 owner 已對照）
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

// T053（003）：篩選為畫面狀態，不保存、不影響排程
When("觀眾把行程篩選為 {string}", async ({ page, world }, filter: string) => {
  await openTab(page, world, "行程");
  const control = filterControl(page);
  await expect(control).toBeVisible();
  const radio = control.getByRole("radio", { name: filter, exact: true });
  await radio.click();
  await expect(radio).toBeChecked();
  setFilter(page, filter as ItineraryFilter);
  await waitItineraryReady(page);
  expect(hasPartner(await readState(page)), "兩人模式：本機保存有同伴資料").toBe(true);
});

// T054（003）
Then("行程頁的篩選選項為 {string}", async ({ page, world }, options: string) => {
  await openTab(page, world, "行程");
  const control = filterControl(page);
  await expect(control).toBeVisible();
  const radios = control.getByRole("radio");
  await expect(radios).toHaveCount(options.split("、").length);
  expect((await radios.allInnerTexts()).map(norm)).toEqual(options.split("、").map((x) => x.trim()));
  // 預設選取「全部」（尚未改過篩選時）
  await expect(control.getByRole("radio", { name: filterOf(page), exact: true })).toBeChecked();
  expect(hasPartner(await readState(page)), "兩人模式：本機保存有同伴資料").toBe(true);
});

// T055（003）
Then("行程頁不顯示一起與自己標示及篩選", async ({ page, world }) => {
  await openTab(page, world, "行程");
  await expect(itineraryItems(page).first()).toBeVisible();
  await expect(participantTags(page)).toHaveCount(0);
  await expect(filterControl(page)).toHaveCount(0);
  for (const label of ["全部", "只看自己", "只看同伴"]) {
    await expect(page.getByRole("radio", { name: label, exact: true })).toHaveCount(0);
  }
  const texts = await itineraryItems(page).allInnerTexts();
  texts.forEach((t, i) => expect(norm(t), `第 ${i + 1} 列不應有一起／自己標示`).not.toMatch(/一起| 自己/));
  expect(hasPartner(await readState(page)), "個人模式：本機保存沒有同伴資料").toBe(false);
});
