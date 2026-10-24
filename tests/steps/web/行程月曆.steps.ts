import { readFile } from "node:fs/promises";
import type { DataTable } from "playwright-bdd";
import { Then, When, expect, norm, openTab } from "../../support/web-a-helpers";
import { waitItineraryReady } from "../../support/web-b-helpers";

const VIEW_LABEL = { 清單: "list", 月曆: "calendar" } as const;

When("觀眾把行程檢視切換為 {string}", async ({ page, world }, view: string) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  const radio = page.getByTestId("itinerary-view").getByRole("radio", { name: view, exact: true });
  await radio.click();
  await expect(radio).toBeChecked();
  if (view === "月曆") await expect(page.getByTestId("calendar-view")).toBeVisible();
});

When("觀眾點開月曆 {string}", async ({ page }, date: string) => {
  await page.locator(`[data-testid=calendar-day][data-date="${date}"]`).click();
  await expect(page.getByTestId("calendar-panel")).toHaveAttribute("data-date", date);
});

Then("行程頁的檢視為 {string}", async ({ page, world }, view: string) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  const sw = page.getByTestId("itinerary-view");
  await expect(sw.getByRole("radio", { name: view, exact: true })).toBeChecked();
  await expect(sw.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(sw).toHaveAttribute("data-view", VIEW_LABEL[view as keyof typeof VIEW_LABEL]);
  if (view === "月曆") {
    await expect(page.getByTestId("calendar-view")).toBeVisible();
    await expect(page.getByTestId("itinerary-entry")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("calendar-view")).toHaveCount(0);
    await expect(page.getByTestId("itinerary-entry").first()).toBeVisible();
  }
});

Then("月曆顯示每日部數如下：", async ({ page }, table: DataTable) => {
  const cal = page.getByTestId("calendar-view");
  await expect(cal).toBeVisible();
  for (const r of table.hashes()) {
    const n = Number(r["部數"]);
    const cell = cal.locator(`[data-testid=calendar-day][data-date="${r["日期"]}"]`);
    await expect(cell).toHaveAttribute("data-festival", "true");
    await expect(cell).toHaveAttribute("data-count", String(n));
    const badge = cell.getByTestId("calendar-count");
    if (n === 0) await expect(badge).toHaveCount(0);
    else await expect(badge).toHaveText(`${n} 部`);
  }
  // 版面：週日到週六七欄；非放映日淡色
  await expect(cal.getByRole("columnheader")).toHaveText(["日", "一", "二", "三", "四", "五", "六"]);
  await expect(cal.locator("[data-testid=calendar-day][data-festival=false]").first()).toBeVisible();
});

Then("月曆摘要顯示 {string}", async ({ page }, text: string) => {
  await expect(page.getByTestId("calendar-summary")).toHaveText(text);
});

Then("月曆 {string} 的場次區塊如下：", async ({ page }, date: string, table: DataTable) => {
  const blocks = page.locator(`[data-testid=calendar-day][data-date="${date}"]`).getByTestId("calendar-block");
  const got = (await blocks.allTextContents()).map(norm);
  expect(got).toEqual(table.hashes().map((r) => norm(r["區塊"])));
});

Then("月曆當日面板依序列出：", async ({ page }, table: DataTable) => {
  const panel = page.getByTestId("calendar-panel");
  await expect(panel).toBeVisible();
  const rows = table.hashes();
  const hasWho = table.raw()[0].includes("參與者");
  const entries = panel.getByTestId("calendar-panel-entry");
  await expect(entries).toHaveCount(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const e = entries.nth(i);
    const text = norm(await e.textContent());
    for (const part of [r["開演"], r["散場"], r["片號"], r["片名"], r["影廳"], r["層級"]]) expect(text, `第 ${i + 1} 列`).toContain(part);
    if (hasWho) expect(norm(await e.getByTestId("calendar-participant").textContent())).toBe(norm(r["參與者"]));
  }
});

const lastIcs = new WeakMap<object, string>();

When("觀眾按下匯出行事曆", async ({ page, world }) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-ics").click()]);
  expect(dl.suggestedFilename()).toMatch(/\.ics$/);
  const path = await dl.path();
  lastIcs.set(page, await readFile(path, "utf8"));
});

Then("匯出的行事曆包含以下場次：", async ({ page }, table: DataTable) => {
  const ics = lastIcs.get(page)!;
  expect(ics).toContain("BEGIN:VCALENDAR");
  const events = ics.split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]);
  const field = (b: string, k: string) => b.match(new RegExp(`^${k}[^:\\r\\n]*:(.*)$`, "m"))?.[1]?.trim() ?? "";
  const stamp = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(9, 11)}:${v.slice(11, 13)}`;
  for (const b of events) {
    expect(b).toMatch(/DTSTART;TZID=Asia\/Taipei:/);
    expect(b).toMatch(/DTEND;TZID=Asia\/Taipei:/);
  }
  const got = events.map((b) => [stamp(field(b, "DTSTART")), stamp(field(b, "DTEND")), field(b, "SUMMARY"), field(b, "LOCATION")].join("|")).sort();
  const want = table.hashes().map((r) => [norm(r["開始"]), norm(r["結束"]), r["標題"], r["地點"]].join("|")).sort();
  expect(got).toEqual(want);
  expect(ics).toContain("TZID:Asia/Taipei");
});
