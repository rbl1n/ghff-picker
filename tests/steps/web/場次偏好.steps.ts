// web/場次偏好 stepdefs（specs/truth/features/web/場次偏好/dsl.md）
// 005：選片頁場次三態控制、行程頁優先場小標、兩人取捨卡片。
import type { DataTable } from "playwright-bdd";
import type { Locator, Page } from "@playwright/test";
import { scheduleDuo } from "../../../src/domain/duo";
import { buildTradeoffs } from "../../../src/domain/tradeoff";
import type { SessionPref, UserState } from "../../../src/domain/types";
import {
  Given,
  Then,
  When,
  expandCard,
  expect,
  filmCard,
  filmIdOf,
  navLink,
  norm,
  openTab,
  reapplyState,
  sessionOf,
  storedOrDefault,
} from "../../support/web-a-helpers";
import { createPhone, itineraryItems, waitItineraryReady } from "../../support/web-b-helpers";
import { duoOf, snapshotItinerary } from "../../support/web-duo-helpers";

const MARK_ENUM: Record<string, SessionPref | undefined> = { 優先: "prefer", 只看這場: "only", 一般: undefined };

function parseSpec(spec: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})/.exec(spec.trim());
  if (!m) throw new Error(`場次格式錯誤: ${spec}`);
  return { date: m[1], time: `${m[2].padStart(2, "0")}:${m[3]}` };
}

const sessionRow = (card: Locator, spec: string): Locator => {
  const { date, time } = parseSpec(spec);
  return card.locator(`[data-testid="session-row"][data-date="${date}"][data-time="${time}"]`);
};

/* ------------------------------ Given ------------------------------ */

Given("觀眾已對場次標記如下：", async ({ page, world }, table: DataTable) => {
  for (const r of table.hashes()) {
    const mark = MARK_ENUM[r["標記"].trim()];
    if (!mark) throw new Error(`未知標記: ${r["標記"]}`);
    world.sessionMarks.push({ title: r["片名"], sessionText: r["場次"], mark });
  }
  await reapplyState(page, world, "選片");
});

Given("同伴對場次的標記如下：", async ({ world }, table: DataTable) => {
  const pending = duoOf(world).pending;
  pending.marks ??= [];
  for (const r of table.hashes()) {
    const mark = MARK_ENUM[r["標記"].trim()];
    if (!mark) throw new Error(`未知標記: ${r["標記"]}`);
    pending.marks.push({ title: r["片名"], sessionText: r["場次"], mark });
  }
});

Given("觀眾已選擇看 {string} 的優先場", async ({ page, world }, title: string) => {
  world.pins.push(title);
  await reapplyState(page, world, "選片");
});

/* ------------------------------ When ------------------------------- */

When("觀眾在選片頁把 {string} 的 {string} 標為 {string}", async ({ page, world }, title: string, spec: string, label: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await card.waitFor({ state: "visible" });
  await expandCard(card);
  const radio = sessionRow(card, spec).getByRole("radio", { name: label, exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
});

async function pressTradeoff(page: Page, owner: "self" | "partner", title: string, button: string): Promise<void> {
  await navLink(page, "行程").click();
  const card = page.locator(`[data-testid="tradeoff-card"][data-film="${title}"][data-owner="${owner}"]`);
  await card.waitFor({ state: "visible" });
  const before = await card.getAttribute("data-choice");
  await card.getByRole("button", { name: button, exact: true }).click();
  // 重新排程完成：卡片切換選項（改回一起看後預設選項若不再有差異，卡片可能消失）
  await expect
    .poll(async () => {
      const again = page.locator(`[data-testid="tradeoff-card"][data-film="${title}"][data-owner="${owner}"]`);
      return (await again.count()) === 0 ? "gone" : await again.first().getAttribute("data-choice");
    })
    .not.toBe(before);
  await waitItineraryReady(page);
}

When("觀眾在行程頁的 {string} 取捨卡片按下 {string}", async ({ page }, title: string, button: string) => {
  await pressTradeoff(page, "self", title, button);
});

When("觀眾在行程頁替同伴的 {string} 取捨卡片按下 {string}", async ({ page }, title: string, button: string) => {
  await pressTradeoff(page, "partner", title, button);
});

const otherDevices = new WeakMap<Page, Page>();

When("觀眾用另一台裝置開啟自己的分享連結並確認取代", async ({ page, world, browser, baseURL }) => {
  await page.getByRole("link", { name: "分享", exact: true }).or(page.getByRole("button", { name: "分享", exact: true })).first().click();
  const urlEl = page.getByTestId("share-url");
  await urlEl.waitFor({ state: "visible" });
  const raw = ((await urlEl.inputValue().catch(() => "")) || (await urlEl.innerText())).trim();
  const url = new URL(raw, baseURL ?? page.url()).toString();
  const other = await createPhone(browser, baseURL, world.catalog!);
  await other.page.goto(url);
  const dlg = other.page.getByRole("dialog");
  await dlg.waitFor({ state: "visible" });
  await dlg.getByRole("button", { name: "取代並開啟", exact: true }).click();
  await other.page.goto(new URL("#/itinerary", url).toString());
  await waitItineraryReady(other.page);
  otherDevices.set(page, other.page);
});

/* ------------------------------ Then ------------------------------- */

Then("選片頁 {string} 的場次標記如下：", async ({ page, world }, title: string, table: DataTable) => {
  await openTab(page, world, "選片");
  const rows = table.hashes();
  const fid = filmIdOf(world, title);
  const check = async () => {
    const card = filmCard(page, title);
    await card.waitFor({ state: "visible" });
    await expandCard(card);
    const listed = new Map(rows.map((r) => [sessionOf(world, title, r["場次"]).session_id, r["標記"].trim()]));
    for (const s of world.catalog!.sessions.filter((x) => x.film_id === fid)) {
      const want = listed.get(s.session_id) ?? "一般";
      const row = card.locator(`[data-testid="session-row"][data-date="${s.date}"][data-time="${String(Math.floor(s.start_min / 60)).padStart(2, "0")}:${String(s.start_min % 60).padStart(2, "0")}"]`);
      for (const label of ["一般", "優先", "只看這場"]) {
        await expect(row.getByRole("radio", { name: label, exact: true }), `${s.date} ${label}`).toHaveAttribute("aria-checked", String(label === want));
      }
    }
    // 權威狀態：保存的 session_marks 與畫面一致；一般的場次不保存
    const st = await storedOrDefault(page);
    const stored = Object.fromEntries(Object.entries(st.session_marks ?? {}).filter(([id]) => world.catalog!.sessions.find((x) => x.session_id === id)?.film_id === fid));
    const expected = Object.fromEntries([...listed].filter(([, v]) => v !== "一般").map(([id, v]) => [id, MARK_ENUM[v]]));
    expect(stored).toEqual(expected);
  };
  await check();
  await page.reload(); // 再讀確認
  await check();
});

Then("選片頁 {string} 收合時顯示標記提示 {string}", async ({ page, world }, title: string, hint: string) => {
  await openTab(page, world, "選片");
  const check = async () => {
    const card = filmCard(page, title);
    await expect(card.getByTestId("session-pref-hint")).toHaveText(hint);
  };
  await check();
  await page.reload();
  await check();
});

Then("選片頁 {string} 沒有標記提示", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  await expect(filmCard(page, title).getByTestId("session-pref-hint")).toHaveCount(0);
  const st = await storedOrDefault(page);
  const fid = filmIdOf(world, title);
  const ids = world.catalog!.sessions.filter((s) => s.film_id === fid).map((s) => s.session_id);
  expect(ids.filter((id) => st.session_marks?.[id])).toEqual([]);
});

Then("選片頁的場次標記控制項在手機上高度與寬度都不小於 44px，且畫面不需左右捲動", async ({ page, world }) => {
  expect(page.viewportSize()?.width).toBe(390);
  await openTab(page, world, "選片");
  const card = page.getByTestId("film-card").first();
  await card.waitFor({ state: "visible" });
  await expandCard(card);
  const radios = card.getByTestId("session-pref").getByRole("radio");
  await expect(radios.first()).toBeVisible();
  const boxes = await radios.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ w: b.width, h: b.height, right: b.right })));
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.h, "高度").toBeGreaterThanOrEqual(44);
    expect(b.w, "寬度").toBeGreaterThanOrEqual(44);
    expect(b.right, "不得超出視窗").toBeLessThanOrEqual(390);
  }
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hScroll).toBe(false);
});

const preferredTagOf = (page: Page, title: string): Locator => itineraryItems(page).filter({ hasText: title }).getByTestId("preferred-tag");

Then("行程頁 {string} 顯示優先場小標", async ({ page, world }, title: string) => {
  await openTab(page, world, "行程");
  await expect(preferredTagOf(page, title)).toHaveText("優先場");
});

Then("行程頁 {string} 不顯示優先場小標", async ({ page, world }, title: string) => {
  await openTab(page, world, "行程");
  await expect(itineraryItems(page).filter({ hasText: title })).toHaveCount(1);
  await expect(preferredTagOf(page, title)).toHaveCount(0);
});

interface ShownCard {
  負責人: string;
  片名: string;
  選項A: string;
  選項B: string;
  目前選擇: string;
}

async function shownCards(page: Page): Promise<ShownCard[]> {
  return page.getByTestId("tradeoff-card").evaluateAll((els) =>
    els.map((e) => {
      const head = (testid: string) => (e.querySelector(`[data-testid="${testid}"] [data-testid="tradeoff-head"]`)?.textContent ?? "").replace(/\s+/g, " ").trim();
      return {
        負責人: e.getAttribute("data-owner") === "partner" ? "同伴" : "觀眾",
        片名: e.getAttribute("data-film") ?? "",
        選項A: head("tradeoff-option-a"),
        選項B: head("tradeoff-option-b"),
        目前選擇: (e.getAttribute("data-choice") ?? "").toUpperCase(),
      };
    }),
  );
}

/** 由本機保存內容（含同伴資料）重新計算取捨卡片：(負責人, 片名, 目前選擇) */
async function engineCards(page: Page, world: { catalog: import("../../../src/domain/types").Catalog | null }): Promise<string[]> {
  const st: UserState = await storedOrDefault(page);
  if (!st.partner) return [];
  const input = { ...st, ticket_marks: [] };
  const current = scheduleDuo(world.catalog!, input, st.partner);
  const titleOf = new Map(world.catalog!.films.map((f) => [f.film_id, f.title]));
  return buildTradeoffs(world.catalog!, input, st.partner, current)
    .map((t) => `${t.owner === "partner" ? "同伴" : "觀眾"}|${titleOf.get(t.film_id)}|${t.chosen.toUpperCase()}`)
    .sort();
}

Then("行程頁取捨卡片如下：", async ({ page, world }, table: DataTable) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  const expected = table.hashes().map((r) => ({
    負責人: r["負責人"].trim(),
    片名: r["片名"].trim(),
    選項A: r["選項A"].trim(),
    選項B: r["選項B"].trim(),
    目前選擇: r["目前選擇"].trim(),
  }));
  await expect(page.getByTestId("tradeoff-card")).toHaveCount(expected.length);
  const key = (c: ShownCard) => `${c.負責人}|${c.片名}`;
  const shown = (await shownCards(page)).sort((a, b) => (key(a) < key(b) ? -1 : 1));
  expect(shown).toEqual([...expected].sort((a, b) => (key(a) < key(b) ? -1 : 1)));
  // 權威狀態：卡片集合與目前選擇等於由本機保存內容重新計算的結果
  expect(shown.map((c) => `${key(c)}|${c.目前選擇}`).sort()).toEqual(await engineCards(page, world));
});

Then("行程頁取捨卡片 {string} 的選項B差異如下：", async ({ page, world }, title: string, table: DataTable) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  const card = page.locator(`[data-testid="tradeoff-card"][data-film="${title}"]`).first();
  await expect(card).toBeVisible();
  const lines = (await card.getByTestId("tradeoff-diff-line").allInnerTexts()).map(norm);
  expect(lines).toEqual(table.hashes().map((r) => r["差異"].trim()));
});

Then("行程頁取捨卡片 {string} 提供按鈕 {string}", async ({ page, world }, title: string, button: string) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  const btn = page.locator(`[data-testid="tradeoff-card"][data-film="${title}"]`).first().getByTestId("tradeoff-action");
  await expect(btn).toHaveText(button);
  const box = await btn.boundingBox();
  expect(box!.height, "按鈕高度").toBeGreaterThanOrEqual(44);
});

Then("行程頁沒有取捨卡片", async ({ page, world }) => {
  await openTab(page, world, "行程");
  await waitItineraryReady(page);
  await expect(page.getByTestId("tradeoff-card")).toHaveCount(0);
  expect(await engineCards(page, world)).toEqual([]);
});

Then("本機保存的取捨決定為 {string}", async ({ page, world }, decision: string) => {
  const check = async () => {
    const st = await storedOrDefault(page);
    const titleOf = new Map(world.catalog!.films.map((f) => [f.film_id, f.title]));
    const shown = Object.entries(st.pinned_choices ?? {}).map(([id, v]) => `${titleOf.get(id)}=${v === "prefer_session" ? "看優先場" : v}`);
    expect(shown.length ? shown.join("、") : "無").toBe(decision);
    if (decision === "無") expect(st.pinned_choices).toBeUndefined();
  };
  await check();
  await page.reload(); // 再讀確認
  await check();
});

Then("另一台裝置的場次標記、取捨決定與行程都與這台相同", async ({ page }) => {
  const other = otherDevices.get(page);
  if (!other) throw new Error("尚未用另一台裝置開啟分享連結");
  await navLink(page, "行程").click();
  await waitItineraryReady(page);
  const mine = await snapshotItinerary(page);
  const theirs = await snapshotItinerary(other);
  expect(theirs.map((r) => `${r.date}|${r.participant}|${r.text}`)).toEqual(mine.map((r) => `${r.date}|${r.participant}|${r.text}`));
  const a = await storedOrDefault(page);
  const b = await storedOrDefault(other);
  expect(b.session_marks ?? null).toEqual(a.session_marks ?? null);
  expect(b.pinned_choices ?? null).toEqual(a.pinned_choices ?? null);
  expect(b.partner?.session_marks ?? null).toEqual(a.partner?.session_marks ?? null);
  expect(b.partner?.pinned_choices ?? null).toEqual(a.partner?.pinned_choices ?? null);
});
