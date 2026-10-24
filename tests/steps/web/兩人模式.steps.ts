// web/兩人模式 stepdefs（specs/truth/features/web/兩人模式/dsl.md）
import type { DataTable } from "playwright-bdd";
import {
  Given,
  When,
  Then,
  expect,
  navLink,
  openTab,
  sameState,
  buildState,
  sessionOf,
  storedOrDefault,
  TAB_HASH,
  type TabLabel,
  type WebWorld,
} from "../../support/web-a-helpers";
import { waitTicketRows, corruptShareUrl } from "../../support/web-b-helpers";
import {
  baselineOf,
  buildPersonalLink,
  duoBanner,
  duoOf,
  expectBanner,
  hasPartner,
  nameDialog,
  openLinkFresh,
  partnerPrefLines,
  partnerSlotLines,
  readState,
  removePartnerButton,
  replacePartnerDialog,
  selfSnapshotOf,
  titleOfFilmId,
  waitLinkDialogOrError,
  waitNameOrReplace,
} from "../../support/web-duo-helpers";
import type { Page } from "@playwright/test";

function linkOf(world: WebWorld) {
  const l = duoOf(world).link;
  if (!l) throw new Error("尚未有「待開啟的同伴連結」（需先有 Given 同伴傳來個人分享連結）");
  return l;
}

/** 開啟待開啟的同伴連結一次（必要時先以預載狀態開啟網站，再完整載入連結） */
async function openPartnerLink(page: Page, world: WebWorld): Promise<void> {
  if (!world.opened) await openTab(page, world, "選片");
  await openLinkFresh(page, linkOf(world).url);
}

const linkDialog = (page: Page) => page.getByRole("dialog");
const dialogButton = (page: Page, name: string) => linkDialog(page).getByRole("button", { name, exact: true });

/* ------------------------------ Given ------------------------------ */

// T025
Given("同伴傳來個人分享連結，同伴名稱為 {string}", async ({ world }, name: string) => {
  duoOf(world).link = { url: buildPersonalLink(world, name), senderName: name, broken: false };
});

// T026
Given("同伴傳來個人分享連結", async ({ world }) => {
  duoOf(world).link = { url: buildPersonalLink(world, null), senderName: null, broken: false };
});

// T027
Given("同伴傳來的個人分享連結內容已損毀", async ({ world }) => {
  const l = linkOf(world);
  l.url = corruptShareUrl(l.url);
  l.broken = true;
});

// T028
Given("觀眾已開啟同伴的個人分享連結", async ({ page, world }) => {
  await openPartnerLink(page, world);
  await expect(dialogButton(page, "當作同伴加入")).toBeVisible();
});

// T029
Given("觀眾已選擇當作同伴加入", async ({ page, world }) => {
  await openPartnerLink(page, world);
  await dialogButton(page, "當作同伴加入").click();
  await waitNameOrReplace(page);
});

/* ------------------------------ When ------------------------------- */

// T030
When("觀眾開啟同伴的個人分享連結", async ({ page, world }) => {
  await openPartnerLink(page, world);
  await waitLinkDialogOrError(page);
});

// T031
When("觀眾選擇當作同伴加入", async ({ page }) => {
  await dialogButton(page, "當作同伴加入").click();
  await waitNameOrReplace(page);
});

// T032
When("觀眾選擇取代我的設定", async ({ page }) => {
  await dialogButton(page, "取代我的設定").click();
  await waitTicketRows(page);
});

// T033
When("觀眾輸入自己名稱 {string}、同伴名稱 {string} 並確認", async ({ page }, self: string, partner: string) => {
  const dlg = nameDialog(page);
  await dlg.getByLabel("自己名稱", { exact: true }).fill("");
  await dlg.getByLabel("自己名稱", { exact: true }).fill(self);
  await dlg.getByLabel("同伴名稱", { exact: true }).fill("");
  await dlg.getByLabel("同伴名稱", { exact: true }).fill(partner);
  await dlg.getByRole("button", { name: "確認", exact: true }).click();
  await duoBanner(page).waitFor({ state: "visible" });
});

// T034
When("觀眾確認取代同伴", async ({ page }) => {
  await replacePartnerDialog(page).getByRole("button", { name: "確認", exact: true }).click();
  await replacePartnerDialog(page).waitFor({ state: "hidden" });
  await duoBanner(page).waitFor({ state: "visible" });
});

// T035
When("觀眾移除同伴並確認", async ({ page, world }) => {
  if (!world.opened) await openTab(page, world, "選片");
  await removePartnerButton(page).click();
  await linkDialog(page).getByRole("button", { name: "確認", exact: true }).click();
  await duoBanner(page).waitFor({ state: "hidden" });
});

// T036
When("觀眾切到 {string} 頁", async ({ page, world }, label: string) => {
  if (!(label in TAB_HASH)) throw new Error(`unknown page: ${label}`);
  if (!world.opened) await openTab(page, world, "選片");
  await navLink(page, label as TabLabel).click();
  await expect(page).toHaveURL(new RegExp(`#/${TAB_HASH[label as TabLabel]}`));
});

/* ------------------------------ Then ------------------------------- */

// T037
Then("畫面顯示個人連結對話 {string}", async ({ page, world }, title: string) => {
  const dlg = linkDialog(page);
  await expect(dlg.getByRole("heading", { name: title, exact: true })).toBeVisible();
  for (const name of ["當作同伴加入", "取代我的設定", "取消"]) {
    await expect(dialogButton(page, name), name).toBeVisible();
  }
  // 權威狀態：確認之前本機保存沒有被改寫
  expect(sameState(await storedOrDefault(page), buildState(world))).toBe(true);
});

// T038
Then("畫面要求輸入自己與同伴的名稱，預設為 {string} 與 {string}", async ({ page }, self: string, partner: string) => {
  const dlg = nameDialog(page);
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel("自己名稱", { exact: true })).toHaveValue(self);
  await expect(dlg.getByLabel("同伴名稱", { exact: true })).toHaveValue(partner);
  const st = await readState(page);
  expect(hasPartner(st), "確認前不得有同伴資料").toBe(false);
  expect(st?.self_name ?? null, "確認前不得有自己名稱").toBeNull();
});

// T039
Then("畫面顯示取代同伴確認 {string}", async ({ page, world }, text: string) => {
  const dlg = replacePartnerDialog(page);
  await expect(dlg).toContainText(text);
  await expect(dlg.getByRole("button", { name: "確認", exact: true })).toBeVisible();
  await expect(dlg.getByRole("button", { name: "取消", exact: true })).toBeVisible();
  // 權威狀態：確認前本機保存的同伴資料仍是舊的
  const c = duoOf(world);
  const st = await readState(page);
  expect(st?.partner?.display_name, "同伴名稱仍是舊的").toBe(c.partnerName);
  expect(partnerPrefLines(world, st?.partner, true)).toEqual(partnerPrefLines(world, c.preloaded, true));
});

// T040
Then("頂部顯示 {string}", async ({ page }, banner: string) => {
  await expectBanner(page, banner);
  // 權威狀態：保存的兩人名稱與橫幅一致
  const m = /^兩人模式：(.+) ＋ (.+)$/.exec(banner);
  expect(m, "橫幅格式").not.toBeNull();
  await expect
    .poll(async () => {
      const st = await readState(page);
      return `${st?.self_name ?? ""}|${st?.partner?.display_name ?? ""}`;
    })
    .toBe(`${m![1]}|${m![2]}`);
  // 再讀確認
  await page.reload();
  await expectBanner(page, banner);
});

// T041
Then("頂部不顯示兩人模式", async ({ page }) => {
  await expect(duoBanner(page)).toHaveCount(0);
  await expect(removePartnerButton(page)).toHaveCount(0);
  await expect(page.getByText("兩人模式")).toHaveCount(0);
  await expect.poll(async () => hasPartner(await readState(page))).toBe(false);
});

// T042
Then("此裝置沒有同伴資料", async ({ page }) => {
  const check = async () => {
    await expect
      .poll(async () => {
        const st = await readState(page);
        return `${st?.partner ? "partner" : ""}|${st?.self_name ?? ""}`;
      })
      .toBe("|");
  };
  await check();
  await page.reload();
  await check();
  await expect(duoBanner(page)).toHaveCount(0);
});

// T043
Then("已保存的同伴分層如下：", async ({ page, world }, table: DataTable) => {
  const withHot = table.raw()[0].includes("熱門");
  const expected = table
    .hashes()
    .map((r) => [r["片名"], r["層級"], ...(withHot ? [(r["熱門"] ?? "").trim() === "是" ? "是" : ""] : [])].join("|"))
    .sort();
  const check = async () => {
    await expect.poll(async () => partnerPrefLines(world, (await readState(page))?.partner, withHot)).toEqual(expected);
  };
  await check();
  await page.reload();
  await check();
});

// T044
Then("已保存的同伴不可看時段如下：", async ({ page }, table: DataTable) => {
  const expected = table.hashes().map((r) => `${r["日期"]}|${r["時段"]}`).sort();
  await expect.poll(async () => partnerSlotLines((await readState(page))?.partner)).toEqual(expected);
});

// T045
Then("已保存的同伴每日上限為 {string}", async ({ page }, limit: string) => {
  await expect
    .poll(async () => {
      const st = await readState(page);
      return st?.partner ? st.partner.daily_limit : "no-partner";
    })
    .toBe(limit === "不設上限" ? null : Number(limit));
});

// T046
Then("自己已保存的分層如下：", async ({ page, world }, table: DataTable) => {
  const expected = table
    .hashes()
    .map((r) => `${r["片名"]}|${r["層級"]}`)
    .sort();
  const lines = async () => {
    const st = await storedOrDefault(page);
    return st.film_preferences
      .map((p) => `${titleOfFilmId(world, p.film_id)}|${{ must: "必看", want: "想看", maybe: "有空再看" }[p.tier]}`)
      .sort();
  };
  await expect.poll(lines).toEqual(expected);
  await page.reload();
  await expect.poll(lines).toEqual(expected);
});

// T047
Then("自己的分層、不可看時段與每日上限維持加入前的內容", async ({ page, world }) => {
  const base = baselineOf(world);
  await expect
    .poll(async () => JSON.stringify(selfSnapshotOf(await storedOrDefault(page))))
    .toBe(JSON.stringify(selfSnapshotOf(base)));
  // 不該發生：同伴的資料不得出現在自己的欄位
  const st = await storedOrDefault(page);
  const partnerOnly = (st.partner?.film_preferences ?? []).filter((p) => !base.film_preferences.some((b) => b.film_id === p.film_id));
  for (const p of partnerOnly) {
    expect(st.film_preferences.some((x) => x.film_id === p.film_id), `同伴的 ${titleOfFilmId(world, p.film_id)} 不得混進自己的分層`).toBe(false);
  }
});

// T048
Then("已保存的搶票標記如下：", async ({ page, world }, table: DataTable) => {
  const expected = table
    .hashes()
    .map((r) => `${sessionOf(world, r["片名"], r["場次"]).session_id}|${r["狀態"] === "搶到" ? "got" : "missed"}`)
    .sort();
  await expect
    .poll(async () => (await storedOrDefault(page)).ticket_marks.map((m) => `${m.session_id}|${m.result}`).sort())
    .toEqual(expected);
});
