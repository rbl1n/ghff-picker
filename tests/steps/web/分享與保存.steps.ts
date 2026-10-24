import type { Page } from "@playwright/test";
import { createBdd, type DataTable } from "playwright-bdd";
import { Given, When, Then, expect, filmCard, navLink, openTab, storedOrDefault, storedState, test } from "../../support/web-a-helpers";
import { TIER_LABEL_TO_ENUM } from "../../support/tables";
import {
  applyManualOrder,
  arrangeAndOpenTickets,
  arrangeItinerary,
  bState,
  closeExtraContexts,
  corruptShareUrl,
  createPhone,
  norm,
  openHome,
  redirectPageTo,
  snapshotTickets,
  ticketRows,
  waitTicketRows,
} from "../../support/web-b-helpers";

const { After } = createBdd(test);

After(async () => {
  await closeExtraContexts();
});

const CONFIRM_TEXT = "要用這份設定取代此裝置的設定嗎？";
const BROKEN_LINK_TEXT = "這個分享連結無法讀取，請在原裝置重新產生";

function phoneOf(page: Page): Page {
  const p = bState(page).phonePage;
  if (!p) throw new Error("手機 context 尚未建立（需先有「電腦上已產生分享連結」）");
  return p;
}

async function confirmDialog(phone: Page) {
  const dlg = phone.getByRole("dialog");
  await dlg.waitFor({ state: "visible" });
  return dlg;
}

async function phoneImport(phone: Page, url: string) {
  await phone.goto(url);
  const dlg = await confirmDialog(phone);
  await dlg.getByRole("button", { name: /取代/ }).click();
  await waitTicketRows(phone);
}

// T125
Given("觀眾已排好行程", async ({ page, world }) => {
  await arrangeItinerary(page, world);
});

// T126
Given("觀眾已把搶票清單順序手動調整為 {string}", async ({ page, world }, order: string) => {
  const titles = order.split("、").map((s) => s.trim());
  if (world.opened) await applyManualOrder(page, world, titles);
  else bState(page).pendingOrderTitles = titles; // 頁面首次開啟後才寫入
});

// T127
Given("電腦上已產生分享連結", async ({ page, world, browser, baseURL }) => {
  await arrangeAndOpenTickets(page, world);
  const s = bState(page);
  s.desktopSnapshot = await snapshotTickets(page);
  s.desktopState = await storedOrDefault(page);
  await page.getByRole("link", { name: "分享", exact: true }).or(page.getByRole("button", { name: "分享", exact: true })).first().click();
  const urlEl = page.getByTestId("share-url");
  await urlEl.waitFor({ state: "visible" });
  const raw = ((await urlEl.inputValue().catch(() => "")) || (await urlEl.innerText())).trim();
  s.shareUrl = new URL(raw, baseURL ?? page.url()).toString();
  s.phoneUrl = s.shareUrl;
  const phone = await createPhone(browser, baseURL, world.catalog!);
  s.phoneContext = phone.context;
  s.phonePage = phone.page;
  // 之後共用句型（畫面顯示錯誤、不需左右捲動）檢查的是手機畫面
  redirectPageTo(page, phone.page);
  // 手機是乾淨環境：根 steps 的「使用者狀態未被改動」比對基準改為空狀態
  world.prefs = [];
  world.slots = [];
  world.dailyLimit = null;
  world.marks = [];
});

// T128
Given("手機已用分享連結匯入設定", async ({ page }) => {
  const s = bState(page);
  await phoneImport(phoneOf(page), s.phoneUrl!);
});

// T129
Given("分享連結內容已損毀", async ({ page }) => {
  const s = bState(page);
  s.phoneUrl = corruptShareUrl(s.shareUrl!);
});

// T130
When("觀眾關閉工具後重新開啟", async ({ page, world }) => {
  if (!world.opened) {
    // 先以預載狀態開啟一次（攔截快照、預載保存內容），再關閉重開
    await openTab(page, world, "選片");
    const order = bState(page).pendingOrderTitles;
    if (order) await applyManualOrder(page, world, order);
  }
  await page.goto("about:blank");
  await openHome(page);
  await page.waitForLoadState("load");
});

// T131
When("觀眾在手機上關閉工具後重新開啟", async ({ page }) => {
  const phone = phoneOf(page);
  await phone.goto("about:blank");
  await openHome(phone);
  await phone.waitForLoadState("load");
});

// T132
When("觀眾在電腦上開啟分享畫面", async ({ page }) => {
  await page.getByRole("link", { name: "分享", exact: true }).or(page.getByRole("button", { name: "分享", exact: true })).first().click();
  await page.getByTestId("share-url").waitFor({ state: "visible" });
});

// T133
When("觀眾用手機開啟該分享連結", async ({ page }) => {
  const phone = phoneOf(page);
  await phone.goto(bState(page).phoneUrl!);
  await phone
    .getByRole("dialog")
    .or(phone.getByText(BROKEN_LINK_TEXT, { exact: true }))
    .first()
    .waitFor({ state: "visible" });
});

// T134
When("觀眾用手機開啟該分享連結並確認取代", async ({ page }) => {
  await phoneImport(phoneOf(page), bState(page).phoneUrl!);
});

// T135
Then("選片頁顯示影片層級如下：", async ({ page, world }, dataTable: DataTable) => {
  const rows = dataTable.hashes();
  const check = async () => {
    await navLink(page, "選片").click();
    for (const r of rows) {
      const card = filmCard(page, r["片名"]);
      await expect(card, r["片名"]).toBeVisible();
      for (const label of ["必看", "想看", "有空再看"]) {
        await expect(card.getByRole("button", { name: label, exact: true }), `${r["片名"]} ${label}`).toHaveAttribute(
          "aria-pressed",
          r["層級"] === label ? "true" : "false",
        );
      }
    }
    // 權威狀態：本機保存的分層與畫面一致
    const state = await storedOrDefault(page);
    const cat = world.catalog!;
    for (const r of rows) {
      const film = cat.films.find((f) => f.title === r["片名"]);
      const pref = state.film_preferences.find((f) => f.film_id === film?.film_id);
      if (r["層級"] === "未標記") expect(pref, `${r["片名"]} 不應有層級`).toBeUndefined();
      else expect(pref?.tier, `${r["片名"]} 層級`).toBe(TIER_LABEL_TO_ENUM[r["層級"]]);
    }
  };
  await check();
  await page.reload(); // 再讀確認
  await check();
});

// T136
Then("分享畫面顯示 QR code 與「複製連結」", async ({ page }) => {
  const qr = page.getByTestId("share-qr");
  await expect(qr).toBeVisible();
  await expect(page.getByRole("img", { name: /QR/ })).toBeVisible();
  const copy = page.getByRole("button", { name: "複製連結", exact: true });
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();
  await expect(page.getByText("用手機掃描，在手機上打開同一份清單")).toBeVisible();
  const urlEl = page.getByTestId("share-url");
  const linkUrl = ((await urlEl.inputValue().catch(() => "")) || (await urlEl.innerText())).trim();
  expect(await qr.getAttribute("data-url"), "QR code 編碼的網址與複製連結相同").toBe(linkUrl);
});

// T137
Then("手機畫面顯示確認 {string}", async ({ page }, text: string) => {
  const phone = phoneOf(page);
  const dlg = await confirmDialog(phone);
  await expect(dlg).toContainText(text);
  expect(text).toBe(CONFIRM_TEXT);
  await expect(dlg.getByRole("button", { name: /取代/ })).toBeVisible();
  await expect(dlg.getByRole("button", { name: "取消", exact: true })).toBeVisible();
  // 權威狀態：確認前手機本機保存沒有被改寫
  const state = await storedState(phone);
  expect(
    state === null || (state.film_preferences.length === 0 && state.ticket_marks.length === 0),
    "確認前手機本機保存不得含匯入的設定",
  ).toBe(true);
});

// T138
Then("手機的搶票清單與電腦完全相同（順序、排定場次、備案場次）", async ({ page }) => {
  const s = bState(page);
  const phone = phoneOf(page);
  const compare = async () => {
    if ((await ticketRows(phone).count()) === 0) await navLink(phone, "搶票").click();
    const snap = await snapshotTickets(phone);
    expect(snap.length, "列數").toBe(s.desktopSnapshot!.length);
    s.desktopSnapshot!.forEach((row, i) => {
      expect(snap[i].order, `第 ${i + 1} 列順序`).toBe(row.order);
      expect(snap[i].title, `第 ${i + 1} 列片名`).toBe(row.title);
      expect(norm(snap[i].session), `${row.title} 排定場次`).toBe(norm(row.session));
      expect(snap[i].backups, `${row.title} 備案場次`).toEqual(row.backups);
    });
    const ps = await storedOrDefault(phone);
    const ds = s.desktopState;
    const byId = <T extends { film_id: string }>(a: T[] | undefined) =>
      [...(a ?? [])].sort((x, y) => x.film_id.localeCompare(y.film_id));
    expect(byId(ps.film_preferences), "分層與熱門").toEqual(byId(ds?.film_preferences));
    expect(ps.unavailable_slots ?? [], "不可看時段").toEqual(ds?.unavailable_slots ?? []);
    expect(ps.daily_limit ?? null, "每日上限").toEqual(ds?.daily_limit ?? null);
    expect(ps.manual_order ?? null, "手動順序").toEqual(ds?.manual_order ?? null);
  };
  await compare();
  await phone.reload(); // 再讀確認
  await compare();
});
