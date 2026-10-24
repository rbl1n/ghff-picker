// planner/兩人合併 stepdefs：兩人排程效能與可重現（specs/truth/features/planner/兩人合併/兩人排程效能.feature、dsl.md）
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Catalog, DayAvailability, DuoItineraryEntry, FilmPreference, PartnerData, SessionPref, Tier, UserState } from "../../../src/domain/types";
import { scheduleDuo } from "../../../src/domain/duo";
import { buildTradeoffs } from "../../../src/domain/tradeoff";
import { Given, Then, ensureState, getCtx, mulberry32, requireCatalog } from "../../support/planner-a-helpers";
import { ensurePartner } from "../../support/planner-duo-helpers";

const SEED = 20261106;

/** 真實場次表；影廳名稱補上影城前綴（"10廳" -> "台北信義威秀 10廳"），測試端的獨立判定才認得出同影城 */
function realCatalog(): Catalog {
  const raw = JSON.parse(readFileSync(new URL("../../../public/data/sessions.json", import.meta.url), "utf8")) as Catalog;
  const full = new Map(raw.venues.map((v) => [v.venue_name, v.cinema === "xinyi_vieshow" ? `台北信義威秀 ${v.venue_name}` : v.venue_name]));
  return {
    ...raw,
    venues: raw.venues.map((v) => ({ ...v, venue_name: full.get(v.venue_name)! })),
    sessions: raw.sessions.map((s) => ({ ...s, venue_name: full.get(s.venue_name) ?? s.venue_name })),
  };
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function festivalDates(catalog: Catalog): string[] {
  return [...new Set(catalog.sessions.map((s) => s.date))].sort();
}

// 影展場次表為真實場次表
Given("影展場次表為真實場次表", async () => {
  const ctx = getCtx();
  ctx.world.catalog = realCatalog();
  ctx.world.lastResult = null;
  ctx.world.lastDuo = null;
  ctx.world.elapsedMs = null;
});

/** 固定種子洗牌後取前 n 部；kind 決定兩人的片單約三成重疊 */
function pickFilms(catalog: Catalog, rand: () => number, n: number, shared: string[]): string[] {
  const ids = catalog.films.map((f) => f.film_id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const keep = shared.slice(0, Math.round(n * 0.3));
  return [...keep, ...ids.filter((id) => !keep.includes(id))].slice(0, n);
}

function tiered(ids: string[], rand: () => number, must: number, want: number): FilmPreference[] {
  const order = [...ids].sort(() => rand() - 0.5);
  const rank: Record<Tier, number> = { must: 0, want: 0, maybe: 0 };
  return order.map((film_id, i) => {
    const tier: Tier = i < must ? "must" : i < must + want ? "want" : "maybe";
    return { film_id, tier, is_hot: false, tier_rank: ++rank[tier] };
  });
}

// 兩人各有 {片數} 部已分層影片，必看 {必看} 部、想看 {想看} 部，其餘為有空再看
Given("兩人各有 {int} 部已分層影片，必看 {int} 部、想看 {int} 部，其餘為有空再看", async ({}, n: number, must: number, want: number) => {
  const catalog = requireCatalog();
  const rand = mulberry32(SEED);
  const mine = pickFilms(catalog, rand, n, []);
  const theirs = pickFilms(catalog, rand, n, mine);
  ensureState().film_preferences = tiered(mine, rand, must, want);
  ensurePartner().film_preferences = tiered(theirs, rand, must, want);
});

// 觀眾只有平日 18:30 之後有空
Given("觀眾只有平日 18:30 之後有空", async () => {
  const catalog = requireCatalog();
  ensureState().availability = festivalDates(catalog)
    .filter((d) => dayOfWeek(d) >= 1 && dayOfWeek(d) <= 5)
    .map((date): DayAvailability => ({ date, intervals: [{ start_min: 18 * 60 + 30, end_min: 1440 }] }));
});

// 同伴每天有固定種子的忙碌時段
Given("同伴每天有固定種子的忙碌時段", async () => {
  const catalog = requireCatalog();
  const rand = mulberry32(SEED + 1);
  ensurePartner().availability = festivalDates(catalog).map((date): DayAvailability => {
    const a = 9 * 60 + Math.floor(rand() * 8) * 60;
    const c = 12 * 60 + Math.floor(rand() * 8) * 60;
    const busy = [
      [a, a + 120 + Math.floor(rand() * 3) * 60],
      [c, c + 120],
    ].sort((x, y) => x[0] - y[0]);
    const intervals = [];
    let cursor = 0;
    for (const [from, to] of busy) {
      if (from > cursor) intervals.push({ start_min: cursor, end_min: from });
      cursor = Math.max(cursor, to);
    }
    if (cursor < 1440) intervals.push({ start_min: cursor, end_min: 1440 });
    return { date, intervals };
  });
});

// 兩人各有 {片數} 部影片的其中一個場次標為優先
Given("兩人各有 {int} 部影片的其中一個場次標為優先", async ({}, n: number) => {
  const catalog = requireCatalog();
  const rand = mulberry32(SEED + 2);
  const mark = (prefs: FilmPreference[]): Record<string, SessionPref> => {
    const marks: Record<string, SessionPref> = {};
    for (const p of prefs.slice(0, n)) {
      const sessions = catalog.sessions.filter((s) => s.film_id === p.film_id);
      if (sessions.length > 1) marks[sessions[Math.floor(rand() * sessions.length)].session_id] = "prefer";
    }
    return marks;
  };
  ensureState().session_marks = mark(ensureState().film_preferences);
  ensurePartner().session_marks = mark(ensurePartner().film_preferences);
});

function planOf(state: UserState, partner: PartnerData) {
  const catalog = requireCatalog();
  const duo = scheduleDuo(catalog, state, partner);
  return { duo, tradeoffs: buildTradeoffs(catalog, state, partner, duo) };
}

// 再排一次，兩人行程與取捨卡片完全相同
Then("再排一次，兩人行程與取捨卡片完全相同", async () => {
  const world = getCtx().world;
  expect(world.lastDuo, "尚未執行兩人排程").not.toBeNull();
  const first = planOf(ensureState(), world.partner!);
  expect(first.duo.entries, "兩人行程").toEqual(world.lastDuo!.entries);
  const second = planOf(ensureState(), world.partner!);
  expect(second.duo.entries).toEqual(first.duo.entries);
  expect(second.duo.unscheduled).toEqual(first.duo.unscheduled);
  expect(second.tradeoffs).toEqual(first.tradeoffs);
});

const MIRROR = { self: "partner", partner: "self", together: "together" } as const;

function mirrored(entries: DuoItineraryEntry[]): DuoItineraryEntry[] {
  return entries.map((e) => ({ ...e, participant: MIRROR[e.participant], tier: e.partner_tier, partner_tier: e.tier }));
}

// 兩人互換身分重排，兩人行程互為鏡像
Then("兩人互換身分重排，兩人行程互為鏡像", async () => {
  const world = getCtx().world;
  expect(world.lastDuo, "尚未執行兩人排程").not.toBeNull();
  const state = ensureState();
  const partner = world.partner!;
  const swappedSelf: UserState = {
    ...state,
    film_preferences: partner.film_preferences,
    availability: partner.availability,
    daily_limit: partner.daily_limit,
    session_marks: partner.session_marks,
    pinned_choices: partner.pinned_choices,
    ticket_marks: [],
    partner: null,
  };
  const swappedPartner: PartnerData = {
    display_name: partner.display_name,
    daily_limit: state.daily_limit,
    film_preferences: state.film_preferences,
    availability: state.availability,
    session_marks: state.session_marks,
    pinned_choices: state.pinned_choices,
  };
  const swapped = scheduleDuo(requireCatalog(), swappedSelf, swappedPartner);
  const key = (e: DuoItineraryEntry) => `${e.session_id}|${e.participant}|${e.tier}|${e.partner_tier}`;
  expect(mirrored(swapped.entries).map(key).sort()).toEqual(world.lastDuo!.entries.map(key).sort());
});
