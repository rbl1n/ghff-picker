// planner/兩人合併 stepdefs（specs/truth/features/planner/兩人合併/dsl.md）
// 003：兩人各自片單同時排程。每人的可看、相容、每日上限只約束自己；兩人排入同一場次即為「一起」。
import { expect } from "@playwright/test";
import type { DuoItineraryEntry, ItineraryParticipant, Session, Tier } from "../../../src/domain/types";
import { Then, absMin, compareCounts, compareRanks, enumerateFeasible, ensureState, getCtx, objectiveFrom, oracleAvailable, pairwiseCompatible, requireCatalog, sessionById, titleOf, type Objective } from "../../support/planner-a-helpers";
import { ensurePartner } from "../../support/planner-duo-helpers";
import { minToHhmm } from "../../support/tables";

type Table = { hashes(): Record<string, string>[] };

const PARTICIPANT_TO_ENUM: Record<string, ItineraryParticipant> = { 一起: "together", 觀眾自己: "self", 同伴自己: "partner" };
const PARTICIPANT_ORDER: Record<ItineraryParticipant, number> = { together: 0, self: 1, partner: 2 };
const PARTICIPANT_LABEL: Record<ItineraryParticipant, string> = { together: "一起", self: "觀眾自己", partner: "同伴自己" };

function duoEntries(): DuoItineraryEntry[] {
  const duo = getCtx().world.lastDuo;
  expect(duo, "尚未執行兩人排程（world 沒有同伴資料時本句型不適用）").not.toBeNull();
  return duo!.entries;
}

/** 某人的場次：觀眾 = 一起 + 觀眾自己；同伴 = 一起 + 同伴自己 */
function sessionsOf(entries: DuoItineraryEntry[], who: "self" | "partner"): Session[] {
  return entries
    .filter((e) => e.participant === "together" || e.participant === who)
    .map((e) => sessionById(e.session_id));
}

// 兩人行程依日期排列如下：
Then("兩人行程依日期排列如下：", async ({}, dataTable: Table) => {
  const catalog = requireCatalog();
  const world = getCtx().world;
  const entries = duoEntries();
  const filmOrder = new Map(catalog.films.map((f, i) => [f.film_id, i]));
  const actual = entries.map((e) => {
    const s = sessionById(e.session_id);
    return { e, s, 日期: s.date, 開演: minToHhmm(s.start_min), 片名: titleOf(s.film_id), 參與者: PARTICIPANT_LABEL[e.participant] };
  });

  // 呈現結果：順序依日期、開演時間，同一開演時間依 一起、觀眾自己、同伴自己，再依影片首次出現順序
  for (let i = 1; i < actual.length; i++) {
    const a = actual[i - 1];
    const b = actual[i];
    const key = (x: typeof a) => [absMin(x.s.date, x.s.start_min), PARTICIPANT_ORDER[x.e.participant], filmOrder.get(x.s.film_id) ?? 0];
    const ka = key(a);
    const kb = key(b);
    const cmp = ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
    expect(cmp, `兩人行程須依日期、開演、參與者、影片順序排列（第 ${i} 與 ${i + 1} 列）`).toBeLessThanOrEqual(0);
  }
  const expected = dataTable.hashes();
  expect(actual.length, "兩人行程列數").toBe(expected.length);
  expected.forEach((r, i) => {
    const a = actual[i];
    expect(a.日期, `第 ${i + 1} 列 日期`).toBe(r["日期"].trim());
    expect(a.開演, `第 ${i + 1} 列 開演`).toBe(minToHhmm(toMin(r["開演"])));
    expect(a.片名, `第 ${i + 1} 列 片名`).toBe(r["片名"].trim());
    expect(PARTICIPANT_TO_ENUM[r["參與者"].trim()], `未知參與者 ${r["參與者"]}`).toBeTruthy();
    expect(a.參與者, `第 ${i + 1} 列 參與者`).toBe(r["參與者"].trim());
  });

  // 權威狀態：每人每部片至多一列；一起的場次對兩人都可看、都相容
  const selfSessions = sessionsOf(entries, "self");
  const partnerSessions = sessionsOf(entries, "partner");
  expect(new Set(selfSessions.map((s) => s.film_id)).size, "觀眾每部片至多一列").toBe(selfSessions.length);
  expect(new Set(partnerSessions.map((s) => s.film_id)).size, "同伴每部片至多一列").toBe(partnerSessions.length);
  expect(pairwiseCompatible(selfSessions), "觀眾自己的行程須兩兩相容").toBe(true);
  expect(pairwiseCompatible(partnerSessions), "同伴的行程須兩兩相容").toBe(true);
  for (const e of entries.filter((x) => x.participant === "together")) {
    const s = sessionById(e.session_id);
    expect(oracleAvailable(s, ensureState().availability), `一起的場次 ${s.date} ${titleOf(s.film_id)} 觀眾須有空`).toBe(true);
    expect(oracleAvailable(s, world.partner?.availability), `一起的場次 ${s.date} ${titleOf(s.film_id)} 同伴須有空`).toBe(true);
  }
  // 不該發生：同一場次不得同時標觀眾自己與同伴自己
  expect(new Set(entries.map((e) => e.session_id)).size, "同一場次只能有一列").toBe(entries.length);
});

function toMin(t: string): number {
  const [h, m] = t.trim().split(":").map(Number);
  return h * 60 + m;
}

interface DuoObjective {
  counts: [number, number, number];
  self: Objective;
  partner: Objective;
  together: number;
  stars: number;
}

function duoObjective(selfSet: { s: Session; tier: Tier; rank: number }[], partnerSet: { s: Session; tier: Tier; rank: number }[]): DuoObjective {
  const toObj = (set: typeof selfSet) => objectiveFrom(set.map((c) => ({ tier: c.tier, rank: c.rank, star: c.s.marks.includes("guest_attending") })));
  const self = toObj(selfSet);
  const partner = toObj(partnerSet);
  const ids = new Set(selfSet.map((c) => c.s.session_id));
  return {
    counts: [0, 1, 2].map((i) => self.counts[i] + partner.counts[i]) as [number, number, number],
    self,
    partner,
    together: partnerSet.filter((c) => ids.has(c.s.session_id)).length,
    stars: self.stars + partner.stars,
  };
}

/** >0 表示 a 較佳。依兩人排程目標：1～3 項字典序；第 4 項兩人皆不劣且至少一人較佳者勝、否則視為相同；再比一起看場次數、★ 合計。 */
function compareDuo(a: DuoObjective, b: DuoObjective): number {
  const c = compareCounts({ counts: a.counts, ranks: [[], [], []], stars: 0 }, { counts: b.counts, ranks: [[], [], []], stars: 0 });
  if (c !== 0) return c;
  const rs = compareRanks(a.self, b.self);
  const rp = compareRanks(a.partner, b.partner);
  if (rs >= 0 && rp >= 0 && (rs > 0 || rp > 0)) return 1;
  if (rs <= 0 && rp <= 0 && (rs < 0 || rp < 0)) return -1;
  return a.together - b.together || a.stars - b.stars;
}

// 兩人行程的排程目標不劣於窮舉所有可行組合
Then("兩人行程的排程目標不劣於窮舉所有可行組合", async () => {
  const catalog = requireCatalog();
  const state = ensureState();
  const partner = ensurePartner();
  const entries = duoEntries();

  // 權威狀態：行程本身符合每人的限制
  const rankOf = (prefs: { film_id: string; tier: Tier; tier_rank?: number }[], filmId: string) => prefs.find((p) => p.film_id === filmId);
  const toSet = (sessions: Session[], prefs: { film_id: string; tier: Tier; tier_rank?: number }[]) =>
    sessions.map((s) => {
      const p = rankOf(prefs, s.film_id);
      expect(p, `${titleOf(s.film_id)} 必須是該人標記過的影片`).toBeTruthy();
      return { s, tier: p!.tier, rank: p!.tier_rank ?? Number.MAX_SAFE_INTEGER };
    });
  const selfSessions = sessionsOf(entries, "self");
  const partnerSessions = sessionsOf(entries, "partner");
  for (const [who, sessions, avail, limit] of [
    ["觀眾", selfSessions, state.availability, state.daily_limit],
    ["同伴", partnerSessions, partner.availability, partner.daily_limit],
  ] as const) {
    expect(new Set(sessions.map((s) => s.film_id)).size, `${who}每部片至多一場`).toBe(sessions.length);
    expect(pairwiseCompatible(sessions), `${who}的行程須兩兩相容`).toBe(true);
    for (const s of sessions) expect(oracleAvailable(s, avail), `${who}的場次 ${s.date} ${titleOf(s.film_id)} 須有空`).toBe(true);
    if (limit !== null) {
      const perDay = new Map<string, number>();
      for (const s of sessions) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
      for (const [d, n] of perDay) expect(n, `${who} ${d} 不得超過每日上限`).toBeLessThanOrEqual(limit);
    }
  }
  const actual = duoObjective(toSet(selfSessions, state.film_preferences), toSet(partnerSessions, partner.film_preferences));

  // 呈現結果：窮舉兩人所有可行組合（各自可行，兩人排入同一場次即為一起），找不到更好的
  const A = enumerateFeasible({ catalog, film_preferences: state.film_preferences, availability: state.availability, daily_limit: state.daily_limit });
  const B = enumerateFeasible({ catalog, film_preferences: partner.film_preferences, availability: partner.availability, daily_limit: partner.daily_limit });
  for (const a of A) {
    for (const b of B) {
      const o = duoObjective(a, b);
      expect(compareDuo(o, actual), `存在更好的兩人組合：觀眾 ${a.map((c) => titleOf(c.s.film_id) + c.s.date).join("、")} / 同伴 ${b.map((c) => titleOf(c.s.film_id) + c.s.date).join("、")}`).toBeLessThanOrEqual(0);
    }
  }
});

// 雙方原始設定與排程前相同
Then("雙方原始設定與排程前相同", async () => {
  const world = getCtx().world;
  expect(world.baseline, "尚未記下排程前快照（缺少 When 觀眾執行排程）").not.toBeNull();
  const now = JSON.stringify({ own: ensureState(), partner: world.partner });
  expect(now, "自己與同伴的分層、層內排序、有空時段、每日上限、手動順序、搶票標記須等於排程前快照").toBe(world.baseline);
  // 不該發生：不得把同伴的分層或時段寫進自己的使用者狀態
  const own = JSON.parse(world.baseline!).own as { film_preferences: { film_id: string }[] };
  expect(ensureState().film_preferences.map((p) => p.film_id).sort()).toEqual(own.film_preferences.map((p) => p.film_id).sort());
});
