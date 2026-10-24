import type { DataTable } from "playwright-bdd";
import {
  Given,
  Then,
  When,
  openLanding,
  TIER_LABEL_TO_ENUM,
  buildCatalog,
  buildState,
  dateDisp,
  expect,
  filmCard,
  filmIdOf,
  navLink,
  norm,
  openTab,
  parseSlotText,
  pressSchedule,
  reapplyState,
  sameState,
  slotText,
  storedOrDefault,
} from "../../support/web-a-helpers";
import { minToHhmm, TIER_ENUM_TO_LABEL } from "../../support/tables";
import { engineOf } from "../../support/web-b-helpers";
import {
  addPendingSlots,
  armDuoPreload,
  duoOf,
  pendingToPartner,
  selfSnapshotOf,
} from "../../support/web-duo-helpers";
import {
  availOf,
  complementLines,
  computePlan,
  expectTierOrder,
  filterOf,
  filteredDuoRows,
  hourCellLabel,
  hourCellOf,
  hourStateOf,
  HOUR_STATE_ATTR,
  participantLabel,
  readStateOrEmpty,
  selectDay,
  type HourState,
} from "../../support/web-003-helpers";
import { arrangeItinerary } from "../../support/web-b-helpers";

/* ------------------------------ Given ------------------------------ */

Given("場次快照包含以下場次：", async ({ world }, table: DataTable) => {
  world.catalog = buildCatalog(table.hashes());
});

// T035（003）：同一層級內依表格列順序決定層內名次（先列者在前）；名次由 buildState 依 world.prefs 的累積順序指派
Given("觀眾已標記影片層級如下：", async ({ page, world }, table: DataTable) => {
  for (const r of table.hashes()) {
    world.prefs.push({ title: r["片名"], tier: TIER_LABEL_TO_ENUM[r["層級"]], is_hot: (r["熱門"] ?? "").trim() === "是" });
  }
  await reapplyState(page, world, "選片");
});

// 004：不看與三個層級互斥；Given 只寫入預載狀態
Given("觀眾已把以下影片標為不看：", async ({ page, world }, table: DataTable) => {
  for (const r of table.hashes()) world.skipped.push(r["片名"]);
  await reapplyState(page, world, "選片");
});

// 影片備註：寫入預載狀態的 film_notes
Given("觀眾已為影片加上備註如下：", async ({ page, world }, table: DataTable) => {
  for (const r of table.hashes()) world.notes.push({ title: r["片名"], note: r["備註"] });
  await reapplyState(page, world, "選片");
});

// T037（003）：不可看時段從有空時段扣除（同日期多列逐列累加）；由 buildState 依 world.slots 推導有空時段
Given("觀眾已設定不可看時段如下：", async ({ page, world }, table: DataTable) => {
  for (const r of table.hashes()) {
    world.slots.push({ date: r["日期"], ...parseSlotText(r["時段"]) });
  }
  await reapplyState(page, world, "時段");
});

Given("觀眾已設定每日上限為 {int} 部", async ({ page, world }, limit: number) => {
  world.dailyLimit = limit;
  await reapplyState(page, world, "時段");
});

// T041：權威位置由 分享與保存 上提到介面根，語意不變
Given("觀眾已排好行程", async ({ page, world }) => {
  await arrangeItinerary(page, world);
});

Given("觀眾已排好行程並開啟搶票清單", async ({ page, world }) => {
  await openTab(page, world, "選片");
  await pressSchedule(page);
  await navLink(page, "搶票").click();
  await page.getByTestId("ticket-row").first().waitFor();
});

Given("觀眾已把下列場次標記為搶到：", async ({ page, world }, table: DataTable) => {
  for (const r of table.hashes()) {
    world.marks.push({ title: r["片名"], sessionText: r["場次"], result: "got" });
  }
  await reapplyState(page, world, "搶票");
  if (world.opened) await page.getByTestId("ticket-row").first().waitFor();
});

// T036（003）：同伴分層的層內名次依列順序
Given("同伴的分層如下：", async ({ world }, table: DataTable) => {
  for (const r of table.hashes()) {
    duoOf(world).pending.prefs.push({ title: r["片名"], tier: TIER_LABEL_TO_ENUM[r["層級"]], is_hot: (r["熱門"] ?? "").trim() === "是" });
  }
});

// T038（003）：同伴不可看時段從同伴有空時段扣除
Given("同伴已設定不可看時段如下：", async ({ world }, table: DataTable) => {
  addPendingSlots(world, table.hashes());
});

// T023
Given("同伴的每日上限已設為 {int} 部", async ({ world }, limit: number) => {
  duoOf(world).pending.dailyLimit = limit;
});

// T024
Given("觀眾已加入同伴，自己名稱為 {string}、同伴名稱為 {string}", async ({ page, world }, self: string, partner: string) => {
  const c = duoOf(world);
  c.selfName = self;
  c.partnerName = partner;
  c.preloaded = pendingToPartner(world, partner);
  c.baseline = selfSnapshotOf(buildState(world));
  // 待載入的同伴資料已預載；之後的同伴 Given 重新累積（供同伴連結使用）
  c.pending = { prefs: [], slots: [], dailyLimit: null };
  await armDuoPreload(page, world);
});

/* ------------------------------ Then ------------------------------- */

Then("畫面顯示錯誤 {string}", async ({ page, world }, message: string) => {
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
  // 權威狀態：失敗的操作沒有改動使用者狀態
  expect(sameState(await storedOrDefault(page), buildState(world))).toBe(true);
  // 不該出現技術錯誤碼或堆疊
  const body = (await page.locator("body").innerText()) ?? "";
  expect(body).not.toMatch(/TypeError|ReferenceError|Error:|ERR_[A-Z_]+|at \S+ \(|undefined|NaN/);
});

Then("畫面不需左右捲動即可讀完每筆影片、場次與備案", async ({ page }) => {
  expect(page.viewportSize()?.width).toBe(390);
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const root = document.documentElement;
    const overflowEls: string[] = [];
    document.querySelectorAll("main *").forEach((el) => {
      const b = (el as HTMLElement).getBoundingClientRect();
      if (b.width > 0 && b.right > vw + 1) overflowEls.push((el.textContent ?? "").trim().slice(0, 30));
    });
    const clipped: string[] = [];
    document.querySelectorAll('[data-testid="ticket-row"], [data-testid="ticket-row"] *').forEach((el) => {
      const h = el as HTMLElement;
      if (h.scrollWidth > h.clientWidth + 1 && getComputedStyle(h).overflowX !== "visible") clipped.push((h.textContent ?? "").trim().slice(0, 30));
    });
    return { hScroll: root.scrollWidth > vw + 1, overflowEls, clipped };
  });
  expect(r.hScroll).toBe(false);
  expect(r.overflowEls).toEqual([]);
  expect(r.clipped).toEqual([]);
  await expect(page.getByTestId("ticket-row").first()).toBeVisible();
});

Then("{string} 顯示熱門標示", async ({ page, world }, title: string) => {
  await openTab(page, world, "選片");
  const card = filmCard(page, title);
  await expect(card.getByTestId("hot-badge")).toBeVisible();
  await expect(card.getByRole("checkbox", { name: /熱門/ })).toBeChecked();
  const fid = filmIdOf(world, title);
  await expect
    .poll(async () => (await storedOrDefault(page)).film_preferences.find((p) => p.film_id === fid)?.is_hot)
    .toBe(true);
  // 再讀確認：重新載入後仍顯示
  await page.reload();
  await expect(filmCard(page, title).getByTestId("hot-badge")).toBeVisible();
});

// T039（003）：列出的是有空時段的補集（整天有空的日期不列）
Then("時段頁顯示不可看時段如下：", async ({ page, world }, table: DataTable) => {
  await openTab(page, world, "時段");
  const expected = table.hashes().map((r) => `${r["日期"]}|${r["時段"]}`).sort();
  const items = page.getByTestId("slot-item");
  await expect(items.first()).toBeVisible();
  const shown = await items.evaluateAll((els) =>
    els.map((e) => `${e.getAttribute("data-date")}|${(e.querySelector('[data-testid="slot-range"]') ?? e).textContent?.replace(/\s+/g, " ").trim()}`),
  );
  expect(shown.sort()).toEqual(expected);
  // 權威狀態：使用者狀態的有空時段取補集後與畫面一致
  const st = await storedOrDefault(page);
  expect(complementLines(availOf(st)).sort()).toEqual(expected);
});

// T042（003）
Then("時段頁 {string} 的小時格子如下：", async ({ page, world }, date: string, table: DataTable) => {
  await openTab(page, world, "時段");
  const listed = new Map(table.hashes().map((r) => [Number(r["小時"]), r["狀態"] as HourState]));
  const check = async () => {
    await selectDay(page, date);
    const texts = new Map<HourState, string>();
    for (let h = 0; h < 24; h++) {
      const cell = hourCellOf(page, date, h);
      await expect(cell, `${date} ${h} 點格子`).toBeVisible();
      const want: HourState = listed.get(h) ?? "有空";
      // 呈現結果：狀態文字與表格一致（不靠顏色單獨表達）
      const label = await hourCellLabel(cell);
      expect(label, `${h} 點`).toContain(want);
      texts.set(want, label.replace(/\d+/g, "").trim());
      await expect(cell).toHaveAttribute("data-state", HOUR_STATE_ATTR[want]);
      // 權威狀態：等於由使用者狀態的有空時段推導的結果
      expect(hourStateOf(availOf(await readStateOrEmpty(page)), date, h), `${h} 點（保存內容推導）`).toBe(want);
    }
    // 三種狀態在畫面上的文字各不相同（不靠顏色單獨表達）
    expect(new Set(texts.values()).size, "不同狀態的格子文字應不同").toBe(texts.size);
  };
  await check();
  await page.reload(); // 再讀確認
  await check();
});

// T043（003）
Then("選片頁層內順序如下：", async ({ page, world }, table: DataTable) => {
  await openTab(page, world, "選片");
  const rows = table.hashes() as { 層級: string; 順序: string }[];
  await expectTierOrder(page, world.catalog, rows);
  await page.reload(); // 再讀確認：重新載入後仍一致
  await expectTierOrder(page, world.catalog, rows);
});

Then("時段頁顯示每日上限為 {string}", async ({ page, world }, limit: string) => {
  await openTab(page, world, "時段");
  const input = page.getByTestId("daily-limit-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(limit === "不設上限" ? "" : limit);
  await expect
    .poll(async () => (await storedOrDefault(page)).daily_limit)
    .toBe(limit === "不設上限" ? null : Number(limit));
});

Then("搶票清單順序為 {string}", async ({ page, world }, order: string) => {
  await openTab(page, world, "搶票");
  const rows = page.getByTestId("ticket-pending").getByTestId("ticket-row");
  await expect(rows.first()).toBeVisible();
  const titles = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-film") ?? ""));
  expect(titles.join("、")).toBe(order);
  // 權威狀態：若有手動順序，畫面順序需與其一致
  const st = await storedOrDefault(page);
  if (st.manual_order && world.catalog) {
    const ids = titles.map((t) => filmIdOf(world, t));
    expect(st.manual_order.filter((id) => ids.includes(id))).toEqual(ids);
  }
  // 權威狀態：自動順序＝引擎搶票清單中尚未搶到的片（依序）
  const eng = await engineOf(page, world);
  const gotFilms = new Set(
    eng.state.ticket_marks.filter((m) => m.result === "got").map((m) => eng.sessionById(m.session_id).film_id),
  );
  expect(eng.tickets.filter((t) => !gotFilms.has(t.film_id)).map((t) => eng.titleOfFilm(t.film_id)).join("、")).toBe(order);
});

Then("{string} 顯示為已搶到並移到已完成區", async ({ page, world }, title: string) => {
  await openTab(page, world, "搶票");
  const done = page.getByTestId("ticket-done").locator(`[data-testid="ticket-row"][data-film="${title}"]`);
  await expect(done).toBeVisible();
  await expect(done).toContainText("已搶到");
  for (const name of ["搶到", "沒搶到"]) {
    const btn = done.getByRole("button", { name, exact: true });
    if ((await btn.count()) > 0) await expect(btn).toBeDisabled();
  }
  await expect(
    page.getByTestId("ticket-pending").locator(`[data-testid="ticket-row"][data-film="${title}"]`),
  ).toHaveCount(0);
  const fid = filmIdOf(world, title);
  await expect
    .poll(async () => {
      const st = await storedOrDefault(page);
      const sessionIds = world.catalog!.sessions.filter((s) => s.film_id === fid).map((s) => s.session_id);
      return st.ticket_marks.some((m) => m.result === "got" && sessionIds.includes(m.session_id));
    })
    .toBe(true);
});

// T040（003）：新增可選欄「參與者」（一起／{名字} 自己）；兩人模式為目前篩選下的內容（預設全部）
Then("行程頁依日期顯示以下場次：", async ({ page, world }, table: DataTable) => {
  await openTab(page, world, "行程");
  const rows = table.hashes();
  const hasParticipant = table.raw()[0].includes("參與者");
  const entries = page.getByTestId("itinerary-entry");
  await expect(entries).toHaveCount(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const e = entries.nth(i);
    await expect(e).toHaveAttribute("data-date", r["日期"]);
    const text = norm(await e.textContent());
    for (const part of [r["開演"], r["散場"], r["片名"], r["影廳"], r["層級"]]) expect(text).toContain(part);
    if (hasParticipant) expect(norm(await e.getByTestId("participant-tag").textContent()), `第 ${i + 1} 列參與者`).toBe(norm(r["參與者"]));
  }
  // 日期分組標題
  for (const d of new Set(rows.map((r) => r["日期"]))) {
    await expect(page.getByRole("heading", { name: dateDisp(d) })).toBeVisible();
  }
  // 權威狀態：畫面行程 = 由目前使用者狀態（兩人模式含同伴資料）算出的行程及篩選
  const st = await storedOrDefault(page);
  const plan = computePlan(world.catalog!, st, false);
  const byId = new Map(world.catalog!.sessions.map((s) => [s.session_id, s]));
  const titleOf = new Map(world.catalog!.films.map((f) => [f.film_id, f.title]));
  const selfName = st.self_name ?? "";
  const partnerName = st.partner?.display_name ?? "";
  const computedRows = st.partner
    ? filteredDuoRows(plan, filterOf(page)).map((it) => ({ id: it.session_id, tier: it.tier, who: participantLabel(it.participant, selfName, partnerName) }))
    : plan.itinerary.map((it) => ({ id: it.session_id, tier: it.tier, who: "" }));
  const computed = computedRows
    .map((it) => {
      const s = byId.get(it.id)!;
      return [s.date, minToHhmm(s.start_min), minToHhmm(s.end_min % 1440), titleOf.get(s.film_id), s.venue_name, TIER_ENUM_TO_LABEL[it.tier], ...(hasParticipant ? [it.who] : [])].join("|");
    })
    .sort();
  const shown = rows
    .map((r) => [r["日期"], r["開演"], r["散場"], r["片名"], r["影廳"], r["層級"], ...(hasParticipant ? [norm(r["參與者"])] : [])].join("|"))
    .sort();
  expect(computed).toEqual(shown);
});

// 004：預設所有 context 已看過使用說明；這個 Given 以 cookie 讓 init script 不預載「已看過」記錄
Given("觀眾是第一次使用，尚未看過使用說明", async ({ context, baseURL }) => {
  await context.addCookies([{ name: "ghff_first_time", value: "1", url: baseURL ?? "http://127.0.0.1:4173" }]);
});

When("觀眾開啟網站首頁", async ({ page, world }) => {
  await openLanding(page, world);
});
