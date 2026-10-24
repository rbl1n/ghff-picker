import type { DataTable } from "playwright-bdd";
import type { Page } from "@playwright/test";
import { Given, When, Then, expect } from "../../support/web-a-helpers";

const fast = (page: Page) => page.getByTestId("fast-mode");

const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** 表格 → 以表頭為首列的二維陣列 */
function tableRows(dt: DataTable): string[][] {
  const [head, ...rows] = dt.raw();
  return [head, ...rows];
}

function parseTsv(text: string): string[][] {
  return text.split("\n").map((l) => l.split("\t"));
}

/** 簡易 CSV 解析（支援雙引號） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r") continue;
    else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// 剪貼簿權限
Given("觀眾的瀏覽器允許讀寫剪貼簿", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
});

// 匯出
When("觀眾按下「複製到 Google 試算表」", async ({ page }) => {
  await page.getByTestId("export-copy").click();
  await expect(page.getByTestId("export-toast")).toContainText("已複製");
});

When("觀眾按下「下載 CSV」", async ({ page, world }) => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  (world as unknown as Record<string, unknown>).download = { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
});

Then("剪貼簿的試算表資料如下：", async ({ page }, dt: DataTable) => {
  const expected = tableRows(dt);
  await expect.poll(async () => parseTsv(await readClipboard(page))).toEqual(expected);
});

Then("剪貼簿的試算表資料筆數為 {string}", async ({ page }, n: string) => {
  const rows = parseTsv(await readClipboard(page));
  expect(rows.length - 1).toBe(Number(n));
});

Then("剪貼簿的試算表資料包含 {string} 一列，張數為 {string}、一起\\/自己為 {string}", async ({ page }, title: string, qty: string, who: string) => {
  const rows = parseTsv(await readClipboard(page));
  const [head, ...body] = rows;
  const row = body.find((r) => r[head.indexOf("場次名稱")] === title);
  expect(row, `應有 ${title} 一列`).toBeTruthy();
  expect(row![head.indexOf("張數")]).toBe(qty);
  expect(row![head.indexOf("一起/自己")]).toBe(who);
});

Then("下載的檔名為 {string}", async ({ world }, name: string) => {
  expect((world as unknown as { download: { name: string } }).download.name).toBe(name);
});

Then("下載的 CSV 以 BOM 開頭，內容如下：", async ({ world }, dt: DataTable) => {
  const { bytes } = (world as unknown as { download: { bytes: Buffer } }).download;
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.subarray(3).toString("utf8");
  expect(parseCsv(text)).toEqual(tableRows(dt));
});

// 搶票模式
When("觀眾進入搶票模式", async ({ page }) => {
  await page.getByTestId("fast-enter").click();
  await expect(fast(page)).toBeVisible();
});

When("觀眾結束搶票模式", async ({ page }) => {
  await page.getByRole("button", { name: "結束搶票模式" }).click();
  await expect(fast(page)).toHaveCount(0);
});

When("觀眾在搶票模式按下「搶到」", async ({ page }) => {
  await fast(page).getByRole("button", { name: "搶到", exact: true }).click();
});

When("觀眾在搶票模式按下「沒搶到」", async ({ page }) => {
  await fast(page).getByRole("button", { name: "沒搶到", exact: true }).click();
});

When("觀眾在搶票模式連續按下 {int} 次「搶到」", async ({ page }, n: number) => {
  for (let i = 0; i < n; i++) {
    const title = await page.getByTestId("fast-title").textContent();
    await fast(page).getByRole("button", { name: "搶到", exact: true }).click();
    if (i < n - 1) await expect(page.getByTestId("fast-title")).not.toHaveText(title ?? "");
  }
});

When("觀眾按下鍵盤 {string}", async ({ page }, key: string) => {
  await page.keyboard.press(key.length === 1 ? key.toLowerCase() : key);
});

Then("剪貼簿內容為 {string}", async ({ page }, text: string) => {
  await expect.poll(() => readClipboard(page), { timeout: 3000 }).toBe(text);
});

Then("搶票模式的目前卡片如下：", async ({ page }, dt: DataTable) => {
  const row = dt.hashes()[0];
  const card = page.getByTestId("fast-current");
  await expect(card).toHaveCount(1);
  await expect(page.getByTestId("fast-progress")).toHaveText(row["順序"]);
  await expect(page.getByTestId("fast-date")).toHaveText(row["日期"]);
  await expect(page.getByTestId("fast-meta")).toContainText(row["開演"]);
  await expect(page.getByTestId("fast-meta")).toContainText(row["影廳"]);
  await expect(page.getByTestId("fast-title")).toHaveText(row["片名"]);
});

Then("搶票模式預覽接下來 {string}", async ({ page }, titles: string) => {
  const got = await page.getByTestId("fast-upcoming-item").locator("b").allTextContents();
  expect(got).toEqual(titles.split("、"));
});

Then("搶票模式顯示快捷鍵提示", async ({ page }) => {
  const t = (await page.getByTestId("fast-hint").textContent()) ?? "";
  for (const k of ["G", "M", "C", "←", "→"]) expect(t).toContain(k);
});

Then("搶票模式顯示提示 {string}", async ({ page }, msg: string) => {
  await expect(page.getByTestId("fast-toast")).toContainText(msg);
});

Then("搶票模式顯示摘要 {string}", async ({ page }, msg: string) => {
  await expect(page.getByTestId("fast-summary")).toContainText(msg);
});

Then("搶票模式的按鈕高度至少 44px", async ({ page }) => {
  const vw = page.viewportSize()!.width;
  for (const name of ["複製片名", "搶到", "沒搶到"]) {
    const box = await fast(page).getByRole("button", { name, exact: true }).boundingBox();
    expect(box, name).toBeTruthy();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(vw);
  }
});
