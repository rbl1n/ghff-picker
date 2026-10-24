import type { Page } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import {
  Then,
  When,
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
  hourStateOf,
  HOUR_STATE_ATTR,
  isSessionAvailable,
  readStateOrEmpty,
  selectDay,
  type HourState,
} from "../../support/web-003-helpers";

const dayCell = (page: Page, date: string) => page.locator(`[data-testid="day-cell"][data-date="${date}"]`);
const applyBtn = (page: Page) => page.getByRole("button", { name: /套用/ });
const limitInput = (page: Page) => page.getByTestId("daily-limit-input");

async function selectDate(page: Page, date: string) {
  const cell = dayCell(page, date);
  if ((await cell.getAttribute("aria-pressed")) !== "true") await cell.click();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
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
  for (const d of dates) await selectDate(page, d);
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

// T046（003）：每個被選日期各自依該日該格的目前狀態切換
When("觀眾在時段頁選取以下日期並點擊 {int} 點格子：", async ({ page, world }, hour: number, table: DataTable) => {
  await openTab(page, world, "時段");
  const dates = table.hashes().map((r) => r["日期"]);
  for (const d of dates) await selectDay(page, d);
  await clickHour(page, dates[0], hour, dates);
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
