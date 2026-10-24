import type { Page } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import {
  Then,
  When,
  navLink,
  buildState,
  dateDisp,
  expandCard,
  expect,
  norm,
  openTab,
  sameState,
  sessionOf,
  storedOrDefault,
} from "../../support/web-a-helpers";
import {
  availOf,
  hourCellOf,
  multiHourCellOf,
  multiSelectDays,
  setMultiMode,
  dayCellOf,
  hourStateOf,
  HOUR_STATE_ATTR,
  isSessionAvailable,
  readStateOrEmpty,
  selectDay,
  type HourState,
} from "../../support/web-003-helpers";

const applyBtn = (page: Page) => page.getByRole("button", { name: /套用/ });
const limitInput = (page: Page) => page.getByTestId("daily-limit-input");

async function selectDate(page: Page, date: string) {
  await selectDay(page, date);
}

async function fillRange(page: Page, range: string) {
  const [s, e] = range.split(/[–-]/);
  await page.getByLabel("開始時間").fill(s);
  await page.getByLabel("結束時間").fill(e);
  return { s, e };
}

When("觀眾在時段頁對 {string} 輸入不可看時段 {string}", async ({ page, world }, date: string, range: string) => {
  await openTab(page, world, "時段");
  await selectDate(page, date);
  const { s, e } = await fillRange(page, range);
  if (e <= s) await expect(page.getByText("結束時間需晚於開始時間", { exact: true })).toBeVisible();
  else await expect(applyBtn(page)).toBeEnabled();
});

When("觀眾在時段頁選取以下日期並套用不可看時段 {string}：", async ({ page, world }, range: string, table: DataTable) => {
  await openTab(page, world, "時段");
  const dates = table.hashes().map((r) => r["日期"]);
  await multiSelectDays(page, dates);
  await fillRange(page, range);
  await applyBtn(page).click();
  for (const d of dates) {
    await expect(page.locator(`[data-testid="slot-item"][data-date="${d}"]`).first()).toContainText(range);
  }
});

When("觀眾在時段頁把 {string} 整天設為不可看", async ({ page, world }, date: string) => {
  await openTab(page, world, "時段");
  await selectDate(page, date);
  await page.getByRole("button", { name: "整天不可看", exact: true }).click();
  await expect(page.locator(`[data-testid="slot-item"][data-date="${date}"]`).first()).toContainText("整天不可看");
});

When("觀眾在時段頁刪除 {string} 的不可看時段", async ({ page, world }, date: string) => {
  await openTab(page, world, "時段");
  const items = page.locator(`[data-testid="slot-item"][data-date="${date}"]`);
  const before = await items.count();
  expect(before).toBeGreaterThan(0);
  await items.first().getByRole("button", { name: /刪除/ }).click();
  await expect(items).toHaveCount(before - 1);
});

// T044（003）
When("觀眾在時段頁查看 {string} 的小時格子", async ({ page, world }, date: string) => {
  await openTab(page, world, "時段");
  await selectDay(page, date);
  await expect(page.locator(`[data-testid="hour-cell"][data-date="${date}"]`)).toHaveCount(24);
});

const NEXT_STATE: Record<string, HourState> = { free: "沒空", partial: "沒空", busy: "有空" };

/** 點擊該日該小時格子恰好一次（FR-303：有空 → 沒空；部分沒空 → 沒空；沒空 → 有空），並等格子更新 */
async function clickHour(page: Page, date: string, hour: number, targets: string[]): Promise<void> {
  const cell = hourCellOf(page, date, hour);
  await expect(cell).toBeVisible();
  const before = new Map<string, string>();
  for (const d of targets) before.set(d, (await hourCellOf(page, d, hour).getAttribute("data-state")) ?? "");
  await cell.click();
  for (const d of targets) {
    const want = NEXT_STATE[before.get(d)!];
    await expect(hourCellOf(page, d, hour), `${d} ${hour} 點`).toHaveAttribute("data-state", HOUR_STATE_ATTR[want]);
  }
}

// T045（003）
When("觀眾在時段頁點擊 {string} 的 {int} 點格子", async ({ page, world }, date: string, hour: number) => {
  await openTab(page, world, "時段");
  await selectDay(page, date);
  await clickHour(page, date, hour, [date]);
});

// T046（003）：多選統一規則——全部沒空 → 全部有空；其餘 → 全部沒空
async function clickMultiHour(page: Page, hour: number, dates: string[]): Promise<void> {
  const cell = multiHourCellOf(page, hour);
  await expect(cell).toBeVisible();
  const before = (await cell.getAttribute("data-state")) ?? "";
  await cell.click();
  const want = before === "busy" ? "free" : "busy";
  await expect(multiHourCellOf(page, hour), `${dates.join("、")} ${hour} 點`).toHaveAttribute("data-state", want);
}

When("觀眾在時段頁選取以下日期並點擊 {int} 點格子：", async ({ page, world }, hour: number, table: DataTable) => {
  await openTab(page, world, "時段");
  const dates = table.hashes().map((r) => r["日期"]);
  await multiSelectDays(page, dates);
  await clickMultiHour(page, hour, dates);
});

When("觀眾在時段頁切換編輯到 {string}", async ({ page, world }, date: string) => {
  await openTab(page, world, "時段");
  await selectDay(page, date);
  await expect(page.getByTestId("editing-label")).toHaveAttribute("data-dates", date);
});

When("觀眾在時段頁多選以下日期：", async ({ page, world }, table: DataTable) => {
  await openTab(page, world, "時段");
  await multiSelectDays(
    page,
    table.hashes().map((r) => r["日期"]),
  );
});

When("觀眾在時段頁離開多選日期模式", async ({ page }) => {
  await setMultiMode(page, false);
});

When("觀眾在時段頁按下「同星期幾」", async ({ page }) => {
  await page.getByRole("button", { name: "同星期幾", exact: true }).click();
});

When("觀眾在時段頁對已選日期點擊以下小時格子：", async ({ page }, table: DataTable) => {
  const dates = ((await page.getByTestId("editing-label").getAttribute("data-dates")) ?? "").split(",");
  for (const r of table.hashes()) await clickMultiHour(page, Number(r["小時"]), dates);
});

Then("時段頁正在編輯 {string}", async ({ page }, list: string) => {
  const dates = list.split("、");
  await expect(page.getByTestId("editing-label")).toHaveAttribute("data-dates", dates.join(","));
  const label = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    return `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}（${"日一二三四五六"[dt.getUTCDay()]}）`;
  };
  const text = dates.length === 1 ? `正在編輯：${label(dates[0])}` : `正在編輯 ${dates.length} 天：${dates.map(label).join("、")}`;
  await expect(page.getByTestId("editing-label")).toHaveText(text);
  await expect(page.locator('[data-testid="day-cell"][aria-pressed="true"]')).toHaveCount(dates.length);
  for (const d of dates) await expect(dayCellOf(page, d)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(`套用到已選的 ${dates.length} 天`)).toBeVisible();
});

Then("時段頁多選編輯中的小時格子如下：", async ({ page }, table: DataTable) => {
  for (const r of table.hashes()) {
    const cell = multiHourCellOf(page, Number(r["小時"]));
    const want: Record<string, string> = { 有空: "free", 沒空: "busy", 部分沒空: "partial", 不一致: "mixed" };
    await expect(cell, `${r["小時"]} 點`).toHaveAttribute("data-state", want[r["狀態"]]);
    expect(((await cell.textContent()) ?? "").replace(/\s+/g, " ")).toContain(r["狀態"]);
  }
});

Then("時段頁日期 {string} 顯示有設定標示", async ({ page }, date: string) => {
  await expect(dayCellOf(page, date).getByTestId("day-marker")).toHaveCount(1);
  await expect(dayCellOf(page, date)).toHaveAccessibleName(/有設定/);
  expect(availOf(await storedOrDefault(page)).some((r) => r.date === date)).toBe(true);
});

Then("時段頁日期 {string} 不顯示有設定標示", async ({ page }, date: string) => {
  await expect(dayCellOf(page, date).getByTestId("day-marker")).toHaveCount(0);
  expect(availOf(await storedOrDefault(page)).some((r) => r.date === date)).toBe(false);
});

// T047（003）
Then("時段頁 {string} 的 {int} 格皆為有空", async ({ page, world }, date: string, count: number) => {
  await openTab(page, world, "時段");
  expect(count).toBe(24);
  const check = async () => {
    await selectDay(page, date);
    for (let h = 0; h < count; h++) {
      await expect(hourCellOf(page, date, h), `${h} 點`).toHaveAttribute("data-state", HOUR_STATE_ATTR["有空"]);
      expect(await hourCellOf(page, date, h).textContent()).toContain("有空");
    }
    await expect(page.locator(`[data-testid="slot-item"][data-date="${date}"]`)).toHaveCount(0);
    // 權威狀態：該日期沒有自訂的有空時段（全天有空，預設）
    const st = await readStateOrEmpty(page);
    expect(availOf(st).some((r) => r.date === date), `${date} 不應有自訂有空時段`).toBe(false);
    for (let h = 0; h < count; h++) expect(hourStateOf(availOf(st), date, h)).toBe("有空");
  };
  await check();
  await page.reload(); // 再讀確認
  await check();
});

When("觀眾在時段頁輸入每日上限 {string}", async ({ page, world }, limit: string) => {
  await openTab(page, world, "時段");
  const input = limitInput(page);
  await input.fill(limit);
  await input.blur();
  const err = page.getByTestId("daily-limit-error");
  if (/^\d+$/.test(limit.trim())) await expect(err).toBeHidden();
  else await expect(err).toBeVisible();
});

When("觀眾在時段頁清空每日上限", async ({ page, world }) => {
  await openTab(page, world, "時段");
  const input = limitInput(page);
  await input.fill("");
  await input.blur();
  await expect(input).toHaveValue("");
});

When("觀眾開啟選片頁查看各片場次", async ({ page, world }) => {
  await openTab(page, world, "選片");
  const cards = page.getByTestId("film-card");
  const n = await cards.count();
  for (let i = 0; i < n; i++) await expandCard(cards.nth(i));
  if (n > 0) await expect(page.getByTestId("session-row").first()).toBeVisible();
});

Then("套用按鈕停用", async ({ page, world }) => {
  const btn = applyBtn(page);
  await expect(btn).toBeDisabled();
  // 嘗試點擊與按 Enter 都不得送出
  await btn.click({ force: true });
  await page.getByLabel("結束時間").press("Enter");
  await expect(page.getByTestId("slot-item")).toHaveCount(world.slots.length);
  expect(sameState(await storedOrDefault(page), buildState(world))).toBe(true);
});

Then("時段頁沒有任何不可看時段", async ({ page }) => {
  await expect(limitInput(page)).toBeVisible();
  await expect(page.getByTestId("slot-item")).toHaveCount(0);
  expect(availOf(await storedOrDefault(page))).toEqual([]);
  await page.reload();
  await expect(limitInput(page)).toBeVisible();
  await expect(page.getByTestId("slot-item")).toHaveCount(0);
});

Then("時段頁每日上限欄位顯示輸入錯誤", async ({ page, world }) => {
  const err = page.getByTestId("daily-limit-error");
  await expect(err).toBeVisible();
  expect(norm(await err.textContent())).toMatch(/0 ?以上.*整數/);
  expect((await storedOrDefault(page)).daily_limit).toBe(world.dailyLimit);
});

// T048（003）：可看 = 開演到散場每一分鐘都在有空時段內
Then("選片頁的場次可看狀態如下：", async ({ page, world }, table: DataTable) => {
  const st = await storedOrDefault(page);
  for (const r of table.hashes()) {
    const card = page.locator(`[data-testid="film-card"][data-title="${r["片名"]}"]`);
    const row = card
      .getByTestId("session-row")
      .filter({ hasText: dateDisp(r["日期"]) })
      .filter({ hasText: r["開演"] });
    await expect(row).toHaveCount(1);
    const text = norm(await row.textContent());
    if (r["可看"] === "不可看") expect(text).toContain("不可看");
    else expect(text).not.toContain("不可看");
    // 權威狀態：與有空時段以分鐘推算相符
    const s = sessionOf(world, r["片名"], `${r["日期"]} ${r["開演"]}`);
    expect(isSessionAvailable(s, availOf(st)) ? "可看" : "不可看").toBe(r["可看"]);
  }
});

// 004：先供給（時段）、後需求（選片）
When("觀眾在時段頁按下「下一步：選片」", async ({ page, world }) => {
  await openTab(page, world, "時段");
  await page.getByRole("link", { name: "下一步：選片", exact: true }).click();
});

Then("底部分頁順序為 {string}", async ({ page }, order: string) => {
  const names = await page.getByRole("navigation", { name: "主要分頁" }).getByRole("link").allInnerTexts();
  expect(names.map((n) => n.trim()).join("、")).toBe(order);
});

Then("畫面停在 {string} 頁", async ({ page }, name: string) => {
  const link = navLink(page, name as "時段");
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
});
