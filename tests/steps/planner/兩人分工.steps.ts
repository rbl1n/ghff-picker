import type { DataTable } from "playwright-bdd";
import { buildDuoDivision, type DuoTicketRow } from "../../../src/domain/division";
import { scheduleDuo } from "../../../src/domain/duo";
import type { DuoItineraryEntry, PartnerData, Session, Tier, UserState } from "../../../src/domain/types";
import { ensureState } from "../../support/planner-a-helpers";
import { availableForSession, computeDivision, ensurePartner } from "../../support/planner-duo-helpers";
import { Given, Then, expect, filmIdByTitle, formatSession, getWorld, need, sessionById, titleOf } from "../../support/planner-b-helpers";

const TIER_RANK: Record<Tier, number> = { must: 0, want: 1, maybe: 2 };
const PARTICIPANT_LABEL = { together: "一起", self: "觀眾自己", partner: "同伴自己" } as const;

function division() {
  const world = getWorld();
  const { catalog } = need(world);
  const d = computeDivision(world, catalog);
  if (!d) throw new Error("個人模式沒有分工表");
  return { world, catalog, d };
}

const cell = (title: string, r: DuoTicketRow): string => `${title} · 買 ${r.ticket_quantity} 張${r.participant === "together" ? "（一起）" : ""}`;

// 兩人名稱為 "{觀眾名稱}" 與 "{同伴名稱}"
Given("兩人名稱為 {string} 與 {string}", async ({}, selfName: string, partnerName: string) => {
  ensureState().self_name = selfName;
  ensurePartner().display_name = partnerName;
});

// 觀眾的手動順序已設為 "{順序}"
Given("觀眾的手動順序已設為 {string}", async ({}, order: string) => {
  const world = getWorld();
  const { catalog, state } = need(world);
  world.state = { ...state, manual_order: order.split("、").map((t) => filmIdByTitle(catalog, t.trim())) };
});

/** 測試端的獨立重算（不呼叫 src/domain/division）：整體順序與分配 */
function oracle(world: ReturnType<typeof getWorld>, catalog: NonNullable<ReturnType<typeof getWorld>["catalog"]>, entries: DuoItineraryEntry[]) {
  const state = world.state!;
  const partner = world.partner!;
  const selfName = state.self_name || "我";
  const partnerName = partner.display_name;
  const prefOf = (side: "self" | "partner", filmId: string) => (side === "self" ? state : partner).film_preferences.find((p) => p.film_id === filmId);
  const availOf = (side: "self" | "partner") => (side === "self" ? state.availability : partner.availability);
  const filmIdx = (id: string) => catalog.films.findIndex((f) => f.film_id === id);
  const cmp = (a: string, b: string) => {
    const x = Array.from(a), y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    return x.length - y.length;
  };
  const first: "self" | "partner" = cmp(selfName, partnerName) <= 0 ? "self" : "partner";
  const items = entries
    .filter((e) => !e.is_non_ticketed)
    .map((e) => {
      const s = sessionById(catalog, e.session_id);
      const involved: ("self" | "partner")[] = e.participant === "together" ? ["self", "partner"] : [e.participant];
      const tiers = involved.map((p) => (p === "self" ? e.tier : e.partner_tier)!).map((t) => TIER_RANK[t]);
      const hot = involved.some((p) => prefOf(p, s.film_id)?.is_hot);
      const watchable = catalog.sessions.filter((x) => x.film_id === s.film_id && involved.every((p) => availableForSession(x, availOf(p)))).length;
      return { e, s, involved, tier: Math.min(...tiers), hot, watchable, star: s.marks.includes("guest_attending") };
    });
  items.sort(
    (a, b) =>
      a.tier - b.tier || Number(b.hot) - Number(a.hot) || a.watchable - b.watchable || Number(b.star) - Number(a.star) ||
      filmIdx(a.s.film_id) - filmIdx(b.s.film_id) ||
      (a.involved.length === 2 ? 0 : a.involved[0] === first ? 1 : 2) - (b.involved.length === 2 ? 0 : b.involved[0] === first ? 1 : 2),
  );
  const counts = { self: 0, partner: 0 };
  const second = first === "self" ? "partner" : "self";
  return items.map((it) => {
    const owner: "self" | "partner" = it.involved.length === 1 ? it.involved[0] : counts[first] <= counts[second] ? first : second;
    counts[owner]++;
    return { ...it, owner };
  });
}

// 整體搶票順序如下：
Then("整體搶票順序如下：", async ({}, table: DataTable) => {
  const { catalog, d, world } = division();
  const expected = table.hashes();
  expect(d.rows.length, "列數").toBe(expected.length);
  d.rows.forEach((r, i) => {
    expect(r.global_order, `第 ${i + 1} 列整體順序`).toBe(Number(expected[i]["順序"]));
    expect(titleOf(catalog, r.film_id), `第 ${i + 1} 列片名`).toBe(expected[i]["片名"].trim());
    expect(PARTICIPANT_LABEL[r.participant], `第 ${i + 1} 列參與者`).toBe(expected[i]["誰"].trim());
  });
  // 權威狀態：項目集合等於兩人行程中的售票場次，一起看只有一列
  const ticketed = world.lastDuo!.entries.filter((e) => !e.is_non_ticketed);
  expect(d.rows.length, "項目數等於兩人行程的售票場次數").toBe(ticketed.length);
  const sess = world.lastDuo!.entries.filter((e) => e.is_non_ticketed).map((e) => e.session_id);
  for (const r of d.rows) expect(sess, "不得含非售票場次").not.toContain(r.current_session_id);
});

// 兩人分工表如下：
Then("兩人分工表如下：", async ({}, table: DataTable) => {
  const { catalog, d, world } = division();
  const rows = table.hashes();
  const mine = d.self.map((r) => cell(titleOf(catalog, r.film_id), r));
  const theirs = d.partner.map((r) => cell(titleOf(catalog, r.film_id), r));
  expect(mine, "觀眾的清單").toEqual(rows.map((r) => r["觀眾"].trim()).filter((x) => x !== ""));
  expect(theirs, "同伴的清單").toEqual(rows.map((r) => r["同伴"].trim()).filter((x) => x !== ""));
  d.self.forEach((r, i) => expect(r.order, "觀眾清單名次").toBe(i + 1));
  d.partner.forEach((r, i) => expect(r.order, "同伴清單名次").toBe(i + 1));
  // 權威狀態：一起看的片只在一人的清單；自己看的片在本人清單；每人清單順序與整體順序一致
  for (const r of d.self) expect(r.participant === "partner", "同伴自己看的不在觀眾清單").toBe(false);
  for (const r of d.partner) expect(r.participant === "self", "觀眾自己看的不在同伴清單").toBe(false);
  const together = d.rows.filter((r) => r.participant === "together");
  for (const t of together) {
    const n = [...d.self, ...d.partner].filter((r) => r.global_order === t.global_order).length;
    expect(n, "一起看的片只出現在一人的清單").toBe(1);
  }
  for (const list of [d.self, d.partner]) {
    const g = list.map((r) => r.global_order);
    expect(g, "清單順序與整體順序一致").toEqual([...g].sort((a, b) => a - b));
    list.forEach((r) => expect(r.ticket_quantity, "每列都有張數").toBeGreaterThan(0));
  }
  // 逐筆重算（名字不同時）
  const { state } = need(world);
  if ((state.self_name || "我") !== world.partner!.display_name) {
    const o = oracle(world, catalog, world.lastDuo!.entries);
    const key = (e: { s: Session; owner: string }) => `${e.s.film_id}|${e.owner}`;
    expect(d.rows.map((r) => `${r.film_id}|${r.owner}`), "逐筆重算的分配").toEqual(o.map(key));
  }
});

// 分工摘要為 "{摘要}"
Then("分工摘要為 {string}", async ({}, summary: string) => {
  const { d, world } = division();
  const { state } = need(world);
  const selfName = state.self_name || "我";
  const partnerName = world.partner!.display_name;
  const sum = (rows: DuoTicketRow[]) => ({ count: rows.length, tickets: rows.reduce((a, r) => a + r.ticket_quantity, 0) });
  const a = sum(d.self);
  const b = sum(d.partner);
  expect(`${selfName} ${a.count} 筆 ${a.tickets} 張・${partnerName} ${b.count} 筆 ${b.tickets} 張`).toBe(summary);
  // 權威狀態：兩人張數合計 = 一起 ×2 + 自己 ×1
  const entries = world.lastDuo!.entries.filter((e) => !e.is_non_ticketed);
  expect(a.tickets + b.tickets).toBe(entries.reduce((n, e) => n + (e.participant === "together" ? 2 : 1), 0));
});

// 互換身分後兩人的分工表相同
Then("互換身分後兩人的分工表相同", async () => {
  const { catalog, d, world } = division();
  const { state } = need(world);
  const partner = world.partner!;
  expect(state.ticket_marks, "比較前提：沒有搶票標記").toHaveLength(0);
  const swappedSelf: UserState = {
    ...state,
    self_name: partner.display_name,
    daily_limit: partner.daily_limit,
    film_preferences: partner.film_preferences,
    availability: partner.availability,
    unavailable_slots: partner.unavailable_slots,
    skipped_film_ids: partner.skipped_film_ids,
    manual_order: null,
    partner: null,
  };
  const swappedPartner: PartnerData = {
    display_name: state.self_name || "我",
    daily_limit: state.daily_limit,
    film_preferences: state.film_preferences,
    availability: state.availability,
    unavailable_slots: state.unavailable_slots,
    skipped_film_ids: state.skipped_film_ids,
  };
  const duo = scheduleDuo(catalog, swappedSelf, swappedPartner);
  const swapped = buildDuoDivision(catalog, swappedSelf, duo.entries, swappedPartner);
  const shape = (rows: DuoTicketRow[]) =>
    rows.map((r) => ({
      film: titleOf(catalog, r.film_id),
      qty: r.ticket_quantity,
      together: r.participant === "together",
      current: formatSession(sessionById(catalog, r.current_session_id)),
      backups: r.backup_session_ids.map((id) => formatSession(sessionById(catalog, id))),
    }));
  expect(shape(swapped.self), "對調後的觀眾清單等於原本的同伴清單").toEqual(shape(d.partner));
  expect(shape(swapped.partner), "對調後的同伴清單等於原本的觀眾清單").toEqual(shape(d.self));
});
