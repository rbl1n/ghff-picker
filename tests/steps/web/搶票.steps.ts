import type { DataTable } from "playwright-bdd";
import { Given, When, Then, expect, openTab, reapplyState, storedOrDefault, filmIdOf } from "../../support/web-a-helpers";
import {
  arrangeAndOpenTickets,
  backupTexts,
  bState,
  dayLabel,
  engineOf,
  sessionSpecOf,
  expectNotPressable,
  expectSessionText,
  gotoTab,
  itineraryItems,
  norm,
  parseSessionSpec,
  ticketRowOf,
  ticketRows,
  waitItineraryReady,
  waitTicketRows,
} from "../../support/web-b-helpers";
import { hasPartner, readState } from "../../support/web-duo-helpers";

const canon = (spec: string): string => {
  const { date, time, star } = parseSessionSpec(spec);
  return `${date} ${time}${star ? " ★" : ""}`;
};

// T107
Given("觀眾已把下列場次標記為沒搶到：", async ({ page, world }, dataTable: DataTable) => {
  for (const r of dataTable.hashes()) world.marks.push({ title: r["片名"], sessionText: r["場次"], result: "missed" });
  await reapplyState(page, world, "搶票");
  if (world.opened) await waitTicketRows(page);
});

// T108
Given("觀眾使用手機尺寸的瀏覽器", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

// T109
When("觀眾排好行程並開啟搶票清單", async ({ page, world }) => {
  await arrangeAndOpenTickets(page, world);
});

// T110
When("觀眾把 {string} 移到搶票清單第 {int} 位", async ({ page }, title: string, position: number) => {
  const pending = page.getByTestId("ticket-pending").getByTestId("ticket-row");
  const titles = async () => pending.evaluateAll((els) => els.map((e) => e.getAttribute("data-film")));
  const from = (await titles()).indexOf(title);
  expect(from, `未處理區應有 ${title}`).toBeGreaterThanOrEqual(0);
  const target = position - 1;
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  const row = ticketRowOf(page, title);
  if (touch) {
    // 觸控裝置：上下箭頭連點至目標位置
    const dir = target < from ? "上移" : "下移";
    for (let i = 0; i < Math.abs(target - from); i++) {
      await row.getByRole("button", { name: dir, exact: true }).click();
    }
  } else {
    const dest = pending.nth(target);
    const handle = row.getByTestId("ticket-drag-handle");
    await handle.dragTo(dest, { targetPosition: { x: 20, y: target < from ? 2 : 40 } });
  }
  await expect.poll(async () => (await titles()).indexOf(title)).toBe(target);
});

// T111
When("觀眾在搶票清單按下 {string} 的「搶到」", async ({ page }, title: string) => {
  const row = ticketRowOf(page, title);
  await row.getByRole("button", { name: "搶到", exact: true }).click();
  await expect(row).toHaveAttribute("data-state", "got");
});

// T112
When("觀眾在搶票清單按下 {string} 的「沒搶到」", async ({ page }, title: string) => {
  const row = ticketRowOf(page, title);
  const before = norm(await row.getByTestId("ticket-session").innerText());
  const t0 = Date.now();
  await row.getByRole("button", { name: "沒搶到", exact: true }).click();
  await expect
    .poll(async () => {
      const state = await row.getAttribute("data-state");
      if (state === "dead") return "dead";
      const now = norm(await row.getByTestId("ticket-session").innerText().catch(() => before));
      return now !== before ? "changed" : "same";
    })
    .not.toBe("same");
  bState(page).miss = { elapsedMs: Date.now() - t0, clicks: 1 };
});

// T113
When("觀眾在搶票清單按下 {string} 的「撤銷」", async ({ page }, title: string) => {
  const row = ticketRowOf(page, title);
  await row.getByRole("button", { name: "撤銷", exact: true }).click();
  await expect(row).toHaveAttribute("data-state", "pending");
  await expect(row.getByTestId("ticket-session")).toBeVisible();
});

// T114
When("觀眾查看搶票清單頂部摘要", async ({ page }) => {
  await gotoTab(page, "行程");
  await gotoTab(page, "搶票");
  await page.getByTestId("tickets-summary").waitFor({ state: "visible" });
});

// T115
When("觀眾按下「依搶到結果重新排程」", async ({ page }) => {
  await page.getByRole("link", { name: "依搶到結果重新排程" }).or(page.getByRole("button", { name: "依搶到結果重新排程" })).first().click();
  await waitItineraryReady(page);
  await itineraryItems(page).first().waitFor({ state: "visible" });
});

// T116
Then("搶票清單順序與排定場次如下：", async ({ page, world }, dataTable: DataTable) => {
  await waitTicketRows(page);
  const rows = ticketRows(page);
  const expected = dataTable.hashes();
  await expect(rows).toHaveCount(expected.length);
  const titles = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-film")));
  expect(new Set(titles).size, "同一影片不得出現兩列").toBe(titles.length);
  for (let i = 0; i < expected.length; i++) {
    const row = rows.nth(i);
    expect(Number(norm(await row.getByTestId("ticket-order").innerText()))).toBe(Number(expected[i]["順序"]));
    expect(await row.getAttribute("data-film")).toBe(expected[i]["片名"]);
    expectSessionText(await row.getByTestId("ticket-session").innerText(), expected[i]["排定場次"]);
  }
  // 權威狀態：排定場次等於引擎行程中該片的場次，順序與引擎搶票清單一致
  const eng = await engineOf(page, world);
  expect(eng.tickets.map((t) => eng.titleOfFilm(t.film_id))).toEqual(expected.map((r) => r["片名"]));
  for (const r of expected) {
    const t = eng.tickets.find((x) => eng.titleOfFilm(x.film_id) === r["片名"])!;
    const inItin = eng.itinerary.find((e) => eng.sessionById(e.session_id).film_id === t.film_id);
    expect(sessionSpecOf(eng.sessionById(inItin!.session_id)), `${r["片名"]} 引擎行程場次`).toBe(canon(r["排定場次"]));
  }
});

// T117
Then("搶票清單備案場次如下：", async ({ page, world }, dataTable: DataTable) => {
  await waitTicketRows(page);
  for (const r of dataTable.hashes()) {
    const row = ticketRowOf(page, r["片名"]);
    await expect(row).toBeVisible();
    const actual = await backupTexts(row);
    if (r["備案場次"] === "無不衝堂備案") {
      expect(actual, `${r["片名"]} 應顯示無不衝堂備案`).toEqual(["無不衝堂備案"]);
    } else {
      const expected = r["備案場次"].split("、").map((s) => s.trim());
      expect(actual.length, `${r["片名"]} 備案數`).toBe(expected.length);
      expected.forEach((spec, i) => expectSessionText(actual[i], spec));
    }
  }
  // 權威狀態：備案內容與排程引擎對同一份狀態算出的備案一致
  const eng = await engineOf(page, world);
  for (const r of dataTable.hashes()) {
    const t = eng.tickets.find((x) => eng.titleOfFilm(x.film_id) === r["片名"]);
    expect(t, `引擎搶票清單應含 ${r["片名"]}`).toBeDefined();
    const backups = t!.backup_session_ids.map((id) => sessionSpecOf(eng.sessionById(id)));
    expect(backups, `${r["片名"]} 引擎備案`).toEqual(
      r["備案場次"] === "無不衝堂備案" ? [] : r["備案場次"].split("、").map((x) => canon(x)),
    );
  }
});

// T118
Then("搶票清單沒有 {string}", async ({ page, world }, title: string) => {
  await waitTicketRows(page);
  await expect(ticketRowOf(page, title)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(title);
  // 權威狀態：引擎搶票清單沒有該片，但該片仍在行程中（非售票場次）
  const eng = await engineOf(page, world);
  expect(eng.tickets.map((t) => eng.titleOfFilm(t.film_id))).not.toContain(title);
  // 兩人模式：同伴自己看的片不在自己的清單，但仍在兩人行程中
  const inPlan = eng.plan.duo ?? eng.itinerary;
  expect(inPlan.map((e) => eng.titleOfFilm(eng.sessionById(e.session_id).film_id))).toContain(title);
});

// T119
Then("{string} 立即改顯示 {string}", async ({ page, world }, title: string, session: string) => {
  const row = ticketRowOf(page, title);
  expectSessionText(await row.getByTestId("ticket-session").innerText(), session);
  // 權威狀態：目前場次是引擎對（含已搶到標記的）狀態算出的場次，與所有已搶到場次相容
  const eng = await engineOf(page, world);
  const tk = eng.tickets.find((t) => eng.titleOfFilm(t.film_id) === title);
  expect(tk && sessionSpecOf(eng.sessionById(tk.current_session_id)), `${title} 引擎目前場次`).toBe(canon(session));
  // 不該發生：不得顯示已被標沒搶到的場次
  const state = eng.state;
  const cat = world.catalog!;
  const fid = filmIdOf(world, title);
  const shown = norm(await row.getByTestId("ticket-session").innerText());
  for (const mark of state.ticket_marks) {
    if (mark.result !== "missed") continue;
    const s = cat.sessions.find((x) => x.session_id === mark.session_id);
    if (!s || s.film_id !== fid) continue;
    const hh = String(Math.floor(s.start_min / 60)).padStart(2, "0");
    const mm = String(s.start_min % 60).padStart(2, "0");
    const same = shown.includes(dayLabel(s.date)) && shown.includes(`${hh}:${mm}`);
    expect(same, `不得顯示已標沒搶到的場次 ${s.date} ${hh}:${mm}`).toBe(false);
  }
});

// T120
Then("{string} 再次顯示 {string}", async ({ page, world }, title: string, session: string) => {
  const row = ticketRowOf(page, title);
  await expect(row).toHaveAttribute("data-state", "pending");
  expectSessionText(await row.getByTestId("ticket-session").innerText(), session);
  parseSessionSpec(session);
  // 權威狀態：對應標記已移除（該片的目前場次沒有任何搶票標記）
  const eng = await engineOf(page, world);
  const tk = eng.tickets.find((t) => eng.titleOfFilm(t.film_id) === title);
  expect(tk, `引擎搶票清單應含 ${title}`).toBeDefined();
  expect(eng.sessionById(tk!.current_session_id) && sessionSpecOf(eng.sessionById(tk!.current_session_id))).toBe(canon(session));
  expect(eng.state.ticket_marks.some((m) => m.session_id === tk!.current_session_id)).toBe(false);
});

// T121
Then("{string} 該列顯示 {string}", async ({ page, world }, title: string, message: string) => {
  const row = ticketRowOf(page, title);
  await expect(row).toHaveAttribute("data-state", "dead");
  await expect(row).toContainText(message);
  await expectNotPressable(row, ["搶到", "沒搶到"]);
  // 權威狀態：引擎判定該片已無可用場次
  const eng = await engineOf(page, world);
  expect(eng.tickets.find((t) => eng.titleOfFilm(t.film_id) === title)?.exhausted, `${title} 引擎 exhausted`).toBe(true);
});

// T122
Then("換備案在 {int} 秒內完成", async ({ page }, seconds: number) => {
  const miss = bState(page).miss;
  expect(miss, "When 應已記錄沒搶到的點擊耗時").toBeTruthy();
  expect(miss!.clicks).toBe(1);
  expect(miss!.elapsedMs).toBeLessThanOrEqual(seconds * 1000);
});

// T123
Then("搶票清單頂部顯示 {string}", async ({ page, world }, summary: string) => {
  await expect(page.getByTestId("tickets-summary")).toHaveText(summary);
  const m = /搶到\s*(\d+)\s*部、未搶到\s*(\d+)\s*部/.exec(summary);
  if (m) {
    const state = await storedOrDefault(page);
    const got = state.ticket_marks.filter((t) => t.result === "got").length;
    expect(got, "搶到數等於 got 標記數").toBe(Number(m[1]));
    const eng = await engineOf(page, world);
    expect(eng.tickets.filter((t) => t.exhausted).length, "未搶到數等於無可用場次的影片數").toBe(Number(m[2]));
  }
});

// T124
Then("行程頁中 {string} 排在 {string}", async ({ page, world }, title: string, session: string) => {
  const { date, time } = parseSessionSpec(session);
  const item = itineraryItems(page).filter({ hasText: title });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute("data-date", date);
  await expect(item).toContainText(time);
  await expect(page.getByRole("heading", { name: dayLabel(date) })).toBeVisible();
  // 權威狀態：已搶到的場次保持不變（保存的 got 標記含此場次，且引擎行程也排在此場次）
  const eng = await engineOf(page, world, { replanned: true });
  const fid = filmIdOf(world, title);
  const entry = eng.itinerary.find((e) => eng.sessionById(e.session_id).film_id === fid);
  expect(entry && sessionSpecOf(eng.sessionById(entry.session_id)), `${title} 引擎行程場次`).toBe(canon(session));
  const got = eng.state.ticket_marks.filter((m) => m.result === "got" && eng.sessionById(m.session_id).film_id === fid);
  for (const g of got) expect(g.session_id, `${title} 已搶到場次不變`).toBe(entry!.session_id);
});

// T060（003）：一起看「買 2 張」、自己看「買 1 張」；清單只列自己行程中的場次
Then("搶票清單的購票張數如下：", async ({ page, world }, dataTable: DataTable) => {
  await openTab(page, world, "搶票");
  await expect(ticketRows(page).first()).toBeVisible();
  const expected = dataTable.hashes().map((r) => ({ title: r["片名"], qty: r["張數"].replace(/\s+/g, " ").trim() }));
  const shown = await ticketRows(page).evaluateAll((els) =>
    els.map((e) => ({
      title: e.getAttribute("data-film") ?? "",
      qty: /買\s*\d+\s*張/.exec((e.textContent ?? "").replace(/\s+/g, " "))?.[0].replace(/\s+/g, " ") ?? "",
    })),
  );
  // 不該發生：任何一列缺少張數；表格片集合 = 清單片集合（同伴自己看的片不得出現在清單）
  shown.forEach((r) => expect(r.qty, `${r.title} 應有張數`).not.toBe(""));
  expect(shown.map((r) => r.title).sort(), "清單片集合").toEqual(expected.map((e) => e.title).sort());
  for (const e of expected) {
    const row = shown.find((r) => r.title === e.title)!;
    // 一起看「買 2 張」、自己看「買 1 張」（未處理區與已完成區的列都帶有張數）
    expect(row.qty, `${e.title} 張數`).toBe(e.qty);
    await expect(ticketRowOf(page, e.title).getByTestId("ticket-quantity")).toContainText(e.qty);
  }
  // 權威狀態：本機保存有同伴資料（兩人模式）；張數等於引擎對同一份狀態算出的參與者推導值（一起 2、自己 1）
  expect(hasPartner(await readState(page)), "兩人模式：本機保存有同伴資料").toBe(true);
  const eng = await engineOf(page, world);
  for (const e of expected) {
    const item = eng.tickets.find((t) => eng.titleOfFilm(t.film_id) === e.title);
    expect(`買 ${item?.ticket_quantity} 張`, `${e.title} 引擎推導張數`).toBe(e.qty);
  }
});

// T052
Then("搶票清單不顯示張數", async ({ page, world }) => {
  await openTab(page, world, "搶票");
  const rows = ticketRows(page);
  await expect(rows.first()).toBeVisible();
  const texts = (await rows.evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ")))) as string[];
  texts.forEach((t, i) => expect(t, `第 ${i + 1} 列不應有張數`).not.toMatch(/買\s*\d+\s*張/));
  expect(hasPartner(await readState(page)), "個人模式：本機保存沒有同伴資料").toBe(false);
});
