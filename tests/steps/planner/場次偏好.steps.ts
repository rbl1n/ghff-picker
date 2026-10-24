// planner/場次偏好 stepdefs（specs/truth/features/planner/場次偏好/dsl.md）
// 005：場次標記（優先／只看這場）、取捨決定與取捨卡片。
import { expect } from "@playwright/test";
import type { Catalog, PersonSide, Session, SessionPref } from "../../../src/domain/types";
import { scheduleDuo } from "../../../src/domain/duo";
import {
  buildTradeoffs,
  diffLines,
  giveUpText,
  optionAText,
  optionBText,
  type TextContext,
  type Tradeoff,
} from "../../../src/domain/tradeoff";
import { Given, Then, When, ensureState, findSession, getCtx, requireCatalog, sessionById, titleOf, filmIdOf } from "../../support/planner-a-helpers";
import { computeSchedule, ensurePartner } from "../../support/planner-duo-helpers";

type Table = { hashes(): Record<string, string>[] };

const MARK_TO_ENUM: Record<string, SessionPref> = { 優先: "prefer", 只看這場: "only" };

function sessionOfRef(title: string, spec: string): Session {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2})/.exec(spec.trim());
  if (!m) throw new Error(`場次格式錯誤: ${spec}`);
  return findSession(title, m[1], m[2]);
}

function writeMarks(target: { session_marks?: Record<string, SessionPref> }, rows: Record<string, string>[]): void {
  const marks = { ...(target.session_marks ?? {}) };
  for (const r of rows) {
    const mark = MARK_TO_ENUM[r["標記"].trim()];
    if (!mark) throw new Error(`未知標記: ${r["標記"]}`);
    marks[sessionOfRef(r["片名"].trim(), r["場次"]).session_id] = mark;
  }
  target.session_marks = marks;
}

// 觀眾對場次的標記如下：
Given("觀眾對場次的標記如下：", async ({}, table: Table) => {
  requireCatalog();
  writeMarks(ensureState(), table.hashes());
});

// 同伴對場次的標記如下：
Given("同伴對場次的標記如下：", async ({}, table: Table) => {
  requireCatalog();
  writeMarks(ensurePartner(), table.hashes());
});

function setPin(side: PersonSide, title: string, pinned: boolean): void {
  const target = side === "self" ? ensureState() : ensurePartner();
  const next = { ...(target.pinned_choices ?? {}) };
  if (pinned) next[filmIdOf(title)] = "prefer_session";
  else delete next[filmIdOf(title)];
  if (Object.keys(next).length) target.pinned_choices = next;
  else delete target.pinned_choices;
}

// 觀眾已選擇看 "{片名}" 的優先場
Given("觀眾已選擇看 {string} 的優先場", async ({}, title: string) => {
  requireCatalog();
  setPin("self", title, true);
});

// 同伴已選擇看 "{片名}" 的優先場
Given("同伴已選擇看 {string} 的優先場", async ({}, title: string) => {
  requireCatalog();
  setPin("partner", title, true);
});

function rerun(): void {
  const ctx = getCtx();
  const { result, duo } = computeSchedule(ctx.world, requireCatalog());
  ctx.world.lastResult = result;
  ctx.world.lastDuo = duo;
}

function tradeoffsNow(): Tradeoff[] {
  const world = getCtx().world;
  if (!world.partner || !world.lastDuo) {
    expect(world.partner, "個人模式沒有取捨卡片").toBeNull();
    return [];
  }
  return buildTradeoffs(requireCatalog(), ensureState(), world.partner, world.lastDuo);
}

function textContext(catalog: Catalog): TextContext {
  const world = getCtx().world;
  return {
    titleOf: (id) => titleOf(id),
    sessionOf: (id) => {
      const s = catalog.sessions.find((x) => x.session_id === id);
      if (!s) throw new Error(`no session ${id}`);
      return s;
    },
    nameOf: (side) => (side === "self" ? ensureState().self_name || "我" : world.partner?.display_name || "同伴"),
  };
}

const OWNER_LABEL: Record<PersonSide, string> = { self: "觀眾", partner: "同伴" };

// 觀眾在取捨卡片選擇看 "{片名}" 的優先場
When("觀眾在取捨卡片選擇看 {string} 的優先場", async ({}, title: string) => {
  const card = tradeoffsNow().find((t) => t.owner === "self" && titleOf(t.film_id) === title);
  expect(card, `觀眾沒有「${title}」的取捨卡片`).toBeTruthy();
  setPin("self", title, true);
  rerun();
});

// 觀眾在取捨卡片改回一起看 "{片名}"
When("觀眾在取捨卡片改回一起看 {string}", async ({}, title: string) => {
  expect(ensureState().pinned_choices?.[filmIdOf(title)], `「${title}」須先選擇看優先場`).toBe("prefer_session");
  setPin("self", title, false);
  rerun();
  expect(ensureState().pinned_choices?.[filmIdOf(title)], "決定須被移除").toBeUndefined();
});

// 排在優先場的影片為 "{片名清單}"
Then("排在優先場的影片為 {string}", async ({}, list: string) => {
  const catalog = requireCatalog();
  const state = ensureState();
  const result = getCtx().world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  const order = new Map(catalog.films.map((f, i) => [f.film_id, i]));
  const films = result!.itinerary
    .map((e) => sessionById(e.session_id))
    .filter((s) => state.session_marks?.[s.session_id] === "prefer")
    .map((s) => s.film_id)
    .sort((a, b) => order.get(a)! - order.get(b)!)
    .map((id) => titleOf(id));
  expect(films.length ? films.join("、") : "無").toBe(list);
});

function cardLine(t: Tradeoff, ctx: TextContext) {
  const label = t.owner === "self" ? "你" : ctx.nameOf("partner");
  return {
    負責人: OWNER_LABEL[t.owner],
    片名: ctx.titleOf(t.film_id),
    選項A: optionAText(t, ctx),
    選項B: optionBText(t, ctx, label),
    目前選擇: t.chosen === "a" ? "A" : "B",
  };
}

// 取捨卡片如下：
Then("取捨卡片如下：", async ({}, table: Table) => {
  const catalog = requireCatalog();
  const ctx = textContext(catalog);
  const cards = tradeoffsNow();
  const actual = cards.map((t) => cardLine(t, ctx));
  const expected = table.hashes().map((r) => ({
    負責人: r["負責人"].trim(),
    片名: r["片名"].trim(),
    選項A: r["選項A"].trim(),
    選項B: r["選項B"].trim(),
    目前選擇: r["目前選擇"].trim(),
  }));
  expect(actual, "取捨卡片集合").toEqual(expected);

  // 權威狀態：逐張以實際重跑排程驗證條件（A 不是優先場、B 是優先場、該人影片集合不變、一起看片集合改變）
  const world = getCtx().world;
  const state = ensureState();
  for (const t of cards) {
    const person = t.owner === "self" ? state : world.partner!;
    const flip = (pinned: boolean) => {
      const next = { ...(person.pinned_choices ?? {}) };
      if (pinned) next[t.film_id] = "prefer_session";
      else delete next[t.film_id];
      return { ...person, pinned_choices: next };
    };
    const run = (pinned: boolean) =>
      scheduleDuo(catalog, t.owner === "self" ? { ...state, ...flip(pinned) } : state, t.owner === "partner" ? { ...world.partner!, ...flip(pinned) } : world.partner!);
    const a = run(false);
    const b = run(true);
    const marks = person.session_marks ?? {};
    const sessionsOf = (r: typeof a) =>
      r.entries.filter((e) => (t.owner === "self" ? e.participant !== "partner" : e.participant !== "self")).map((e) => sessionById(e.session_id));
    const aMine = sessionsOf(a).find((s) => s.film_id === t.film_id)!;
    const bMine = sessionsOf(b).find((s) => s.film_id === t.film_id)!;
    expect(marks[aMine.session_id], `${titleOf(t.film_id)} 的 A 選項不應是優先場`).not.toBe("prefer");
    expect(marks[bMine.session_id], `${titleOf(t.film_id)} 的 B 選項應是優先場`).toBe("prefer");
    expect(new Set(sessionsOf(a).map((s) => s.film_id)), "該人的影片集合不變").toEqual(new Set(sessionsOf(b).map((s) => s.film_id)));
    const together = (r: typeof a) => r.entries.filter((e) => e.participant === "together").map((e) => sessionById(e.session_id).film_id).sort().join();
    expect(together(a), "一起看的片集合應改變").not.toBe(together(b));
    expect(t.a.session_id).toBe(aMine.session_id);
    expect(t.b.session_id).toBe(bMine.session_id);
  }
});

// 取捨卡片 "{片名}" 的選項B差異如下：
Then("取捨卡片 {string} 的選項B差異如下：", async ({}, title: string, table: Table) => {
  const ctx = textContext(requireCatalog());
  const card = tradeoffsNow().find((t) => ctx.titleOf(t.film_id) === title);
  expect(card, `沒有「${title}」的取捨卡片`).toBeTruthy();
  expect(diffLines(card!, ctx)).toEqual(table.hashes().map((r) => r["差異"].trim()));
  expect(diffLines(card!, ctx).length).toBeLessThanOrEqual(6);
  expect(giveUpText(card!, ctx).startsWith("放棄：")).toBe(true);
});

// 沒有取捨卡片
Then("沒有取捨卡片", async () => {
  expect(tradeoffsNow().map((t) => `${OWNER_LABEL[t.owner]}|${titleOf(t.film_id)}`)).toEqual([]);
});

// 每部影片的第一個與最後一個場次都標為優先
Given("每部影片的第一個與最後一個場次都標為優先", async () => {
  const catalog = requireCatalog();
  const marks: Record<string, SessionPref> = {};
  for (const film of catalog.films) {
    const sessions = catalog.sessions.filter((s) => s.film_id === film.film_id);
    if (sessions.length === 0) continue;
    marks[sessions[0].session_id] = "prefer";
    marks[sessions[sessions.length - 1].session_id] = "prefer";
  }
  ensureState().session_marks = marks;
});

// 同伴的分層與場次標記和觀眾相同
Given("同伴的分層與場次標記和觀眾相同", async () => {
  const state = ensureState();
  const partner = ensurePartner();
  partner.film_preferences = state.film_preferences.map((p) => ({ ...p }));
  partner.session_marks = { ...(state.session_marks ?? {}) };
});

// 取捨卡片的計算在 10 秒內完成
Then("取捨卡片的計算在 10 秒內完成", async () => {
  const world = getCtx().world;
  expect(world.lastDuo, "尚未執行兩人排程").not.toBeNull();
  const t0 = performance.now();
  const cards = buildTradeoffs(requireCatalog(), ensureState(), world.partner!, world.lastDuo!);
  const ms = performance.now() - t0;
  expect(ms, `取捨計算耗時 ${Math.round(ms)}ms（${cards.length} 張卡片）`).toBeLessThan(10_000);
  expect(cards.length, "每個衝突片只重跑一次，最多 8 張").toBeLessThanOrEqual(8);
});
