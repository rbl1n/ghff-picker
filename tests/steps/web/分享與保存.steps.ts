import type { Page } from "@playwright/test";
import { createBdd, type DataTable } from "playwright-bdd";
import { Given, When, Then, buildState, expect, filmCard, reapplyState, navLink, openTab, storedOrDefault, storedState, test } from "../../support/web-a-helpers";
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
  gotoTab,
} from "../../support/web-b-helpers";
import {
  buildV1Link,
  decodePayload,
  desktopDuo,
  duoOf,
  expectBanner,
  hasPartner,
  readState,
  sameSelfFields,
  samePartnerFields,
  setDesktopDuo,
  snapshotItinerary,
  ticketQuantities,
} from "../../support/web-duo-helpers";
import type { Browser } from "@playwright/test";
import type { WebWorld } from "../../support/web-a-helpers";

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
  // 個人連結對話另有「當作同伴加入」，這裡一律選「取代我的設定」
  await dlg.getByRole("button", { name: "取代我的設定", exact: true }).click();
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
  // 電腦為個人模式（沒有同伴資料）
  expect(hasPartner(s.desktopState), "電腦應為個人模式").toBe(false);
  await page.getByRole("link", { name: "分享", exact: true }).or(page.getByRole("button", { name: "分享", exact: true })).first().click();
  const urlEl = page.getByTestId("share-url");
  await urlEl.waitFor({ state: "visible" });
  // 連結種類為個人分享連結（不是合併結果連結）
  await expect(page.getByText("合併結果連結")).toHaveCount(0);
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
  // 個人連結對話：取代與取消選項（「當作同伴加入」由「手機畫面的分享連結選項為」驗證）
  await expect(dlg.getByRole("button", { name: "取代我的設定", exact: true })).toBeVisible();
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
    // 兩人模式時另逐列比對張數
    const dq = desktopDuo(page);
    if (dq && hasPartner(dq.state)) {
      expect(await ticketQuantities(phone), "各列張數").toEqual(dq.quantities);
    }
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

/* ------------------------- 合併結果分享（002） ------------------------- */

const MERGED_CONFIRM_NOTE = "開啟後會取代此裝置目前的設定。";

async function openShareScreen(page: Page): Promise<void> {
  await page.getByRole("link", { name: "分享", exact: true }).or(page.getByRole("button", { name: "分享", exact: true })).first().click();
  await page.getByTestId("share-url").waitFor({ state: "visible" });
}

async function readShareUrl(page: Page, baseURL: string | undefined): Promise<string> {
  const urlEl = page.getByTestId("share-url");
  const raw = ((await urlEl.inputValue().catch(() => "")) || (await urlEl.innerText())).trim();
  return new URL(raw, baseURL ?? page.url()).toString();
}

async function phoneBanner(phone: Page, text: string): Promise<void> {
  await expectBanner(phone, text);
}

async function phoneOpenMerged(phone: Page, url: string): Promise<void> {
  await phone.goto(url);
  const dlg = await confirmDialog(phone);
  await dlg.getByRole("button", { name: "取代並開啟", exact: true }).click();
  await phone.getByTestId("duo-banner").waitFor({ state: "visible" });
  await waitTicketRows(phone);
}

function sortedMarks(s: { ticket_marks: { session_id: string; result: string }[] }) {
  return [...s.ticket_marks].sort((a, b) => a.session_id.localeCompare(b.session_id));
}

// T058
Given("電腦上已產生合併結果連結", async ({ page, world, browser, baseURL }: { page: Page; world: WebWorld; browser: Browser; baseURL: string | undefined }) => {
  await arrangeAndOpenTickets(page, world);
  const s = bState(page);
  // 含 Given 設定的手動順序（搶票標記已隨預載狀態進入）
  if (s.pendingOrderTitles) {
    await applyManualOrder(page, world, s.pendingOrderTitles);
    await waitTicketRows(page);
  }
  s.desktopSnapshot = await snapshotTickets(page);
  const quantities = await ticketQuantities(page);
  const state = await storedOrDefault(page);
  expect(hasPartner(state), "電腦應為兩人模式").toBe(true);
  s.desktopState = state;
  await gotoTab(page, "行程");
  const itinerary = await snapshotItinerary(page);
  await gotoTab(page, "搶票");
  await waitTicketRows(page);
  setDesktopDuo(page, { itinerary, quantities, state, selfName: state.self_name ?? null, partnerName: state.partner?.display_name ?? null });
  await openShareScreen(page);
  s.shareUrl = await readShareUrl(page, baseURL);
  s.phoneUrl = s.shareUrl;
  const phone = await createPhone(browser, baseURL, world.catalog!);
  s.phoneContext = phone.context;
  s.phonePage = phone.page;
  redirectPageTo(page, phone.page);
  // 手機是乾淨環境：根 steps 的「使用者狀態未被改動」比對基準改為空狀態
  world.prefs = [];
  world.slots = [];
  world.dailyLimit = null;
  world.marks = [];
});

// T059
Given("手機已用合併結果連結取代並開啟", async ({ page }) => {
  await phoneOpenMerged(phoneOf(page), bState(page).phoneUrl!);
});

// T060
Given("裝置上保存的是 001 版本格式的設定，分層如下：", async ({ page, world }, dataTable: DataTable) => {
  // 001 格式（schema_version 1、沒有自己名稱與同伴資料）：根 steps 的預載一律以 v1 格式寫入，不經 002 的寫入程式
  for (const r of dataTable.hashes()) {
    world.prefs.push({ title: r["片名"], tier: TIER_LABEL_TO_ENUM[r["層級"]], is_hot: false });
  }
  await reapplyState(page, world, "選片");
});

// T061
Given("手機收到 001 版本格式的個人分享連結", async ({ page, world, browser, baseURL }: { page: Page; world: WebWorld; browser: Browser; baseURL: string | undefined }) => {
  const film = world.catalog!.films[0];
  const v1 = buildState({ ...world, prefs: [{ title: film.title, tier: "must", is_hot: false }], slots: [], dailyLimit: null, marks: [] });
  const url = new URL(buildV1Link(v1), baseURL ?? "http://127.0.0.1:4173").toString();
  const s = bState(page);
  s.shareUrl = url;
  s.phoneUrl = url;
  const phone = await createPhone(browser, baseURL, world.catalog!);
  s.phoneContext = phone.context;
  s.phonePage = phone.page;
  redirectPageTo(page, phone.page);
});

// T062
When("觀眾用手機開啟該分享連結並選擇取代並開啟", async ({ page }) => {
  await phoneOpenMerged(phoneOf(page), bState(page).phoneUrl!);
});

// T063
Then("手機畫面的分享連結選項為 {string}", async ({ page }, options: string) => {
  const phone = phoneOf(page);
  const dlg = await confirmDialog(phone);
  const expected = options.split("、").map((x) => x.trim()).sort();
  await expect.poll(async () => (await dlg.getByRole("button").allInnerTexts()).map(norm).sort()).toEqual(expected);
  // 權威狀態：選擇之前手機本機保存沒有被改寫
  const st = await storedState(phone);
  expect(st === null || (st.film_preferences.length === 0 && !hasPartner(st)), "選擇前手機本機保存不得改寫").toBe(true);
});

// T064
Then("分享畫面標示為合併結果連結，並提供 QR code 與「複製連結」", async ({ page }) => {
  await expect(page.getByText("合併結果連結").first()).toBeVisible();
  const qr = page.getByTestId("share-qr");
  await expect(qr).toBeVisible();
  await expect(page.getByRole("img", { name: /QR/ })).toBeVisible();
  const copy = page.getByRole("button", { name: "複製連結", exact: true });
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();
  const urlEl = page.getByTestId("share-url");
  const linkUrl = ((await urlEl.inputValue().catch(() => "")) || (await urlEl.innerText())).trim();
  expect(await qr.getAttribute("data-url"), "QR code 與複製連結網址相同").toBe(linkUrl);
  // 權威狀態：網址內容的種類為合併結果（含兩人資料與姓名）
  const payload = decodePayload(linkUrl);
  expect(payload.kind, "連結種類").toBe("merged");
  expect(payload.state?.partner, "含同伴資料").toBeTruthy();
  expect(payload.state?.self_name, "含自己名稱").toBeTruthy();
  expect(payload.state?.partner?.display_name, "含同伴名稱").toBeTruthy();
});

// T065
Then("手機畫面顯示合併結果確認 {string}", async ({ page }, text: string) => {
  const phone = phoneOf(page);
  const dlg = await confirmDialog(phone);
  await expect(dlg).toContainText(text);
  await expect(dlg).toContainText(MERGED_CONFIRM_NOTE);
  const st = await storedState(phone);
  expect(st === null || (st.film_preferences.length === 0 && !hasPartner(st)), "確認前手機本機保存不得改寫").toBe(true);
});

// T066
Then("手機進入兩人模式並顯示 {string}", async ({ page }, banner: string) => {
  const phone = phoneOf(page);
  const dd = desktopDuo(page);
  if (!dd) throw new Error("缺少電腦快照（需先有「電腦上已產生合併結果連結」）");
  const check = async () => {
    await phoneBanner(phone, banner);
    const ps = (await readState(phone))!;
    samePartnerFields(ps, dd.state, "手機與電腦的");
  };
  await check();
  await phone.reload(); // 再讀確認
  await check();
});

// T067
Then("手機的行程與電腦完全相同", async ({ page }) => {
  const phone = phoneOf(page);
  const dd = desktopDuo(page);
  if (!dd) throw new Error("缺少電腦快照（需先有「電腦上已產生合併結果連結」）");
  const check = async () => {
    await gotoTab(phone, "行程");
    const rows = await snapshotItinerary(phone);
    expect(rows.length, "行程列數").toBe(dd.itinerary.length);
    dd.itinerary.forEach((row, i) => {
      expect(rows[i].date, `第 ${i + 1} 列日期`).toBe(row.date);
      expect(rows[i].tier, `第 ${i + 1} 列層級`).toBe(row.tier);
      expect(rows[i].text, `第 ${i + 1} 列內容`).toBe(row.text);
    });
    const ps = (await readState(phone))!;
    sameSelfFields(ps, dd.state, "手機與電腦的");
    expect(ps.manual_order ?? null, "手動順序").toEqual(dd.state.manual_order ?? null);
    expect(sortedMarks(ps), "搶票標記").toEqual(sortedMarks(dd.state));
  };
  await check();
  await phone.reload(); // 再讀確認
  await check();
});

// T068
Then("重新開啟後仍為兩人模式並顯示 {string}", async ({ page, world }, banner: string) => {
  await expectBanner(page, banner);
  const c = duoOf(world);
  const st = (await readState(page))!;
  expect(st.self_name ?? null, "自己名稱").toBe(c.selfName);
  expect(st.partner, "同伴資料").toBeTruthy();
  samePartnerFields(st, { ...st, self_name: c.selfName, partner: c.preloaded }, "重新開啟前後的");
});
