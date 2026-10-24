import type { Catalog, DuoItineraryEntry, ItineraryParticipant, PartnerData, PersonSide, Session, Tier, TicketListItem, UserState } from "./types";
import { areSessionsCompatibleEitherOrder, cinemaResolver } from "./compat";
import { availabilityOf, isSessionAvailable } from "./availability";
import { compareSessionsPreferred, isGuestSession } from "./schedule";

const TIER_RANK: Record<Tier, number> = { must: 0, want: 1, maybe: 2 };

/** 兩人分工表的一列（004）：搶票項目 + 負責人 + 張數；order 為該負責人清單內的名次（1 起） */
export interface DuoTicketRow extends TicketListItem {
  /** 負責人（相對本裝置：self = 本裝置使用者） */
  owner: PersonSide;
  /** 一起看（together）或只有某人看（self／partner，相對本裝置） */
  participant: ItineraryParticipant;
  ticket_quantity: number;
  /** 排序依據的層級（一起看取兩人較高者）與熱門（一起看取任一人） */
  tier: Tier;
  is_hot: boolean;
  /** 整體順序（兩人共用，1 起） */
  global_order: number;
  /** 已搶到的場次；未搶到 = 未設 */
  got_session_id?: string;
}

export interface DuoDivisionSummary {
  count: number;
  tickets: number;
}

export interface DuoDivision {
  /** 依整體順序的全部項目 */
  rows: DuoTicketRow[];
  /** 本裝置使用者的清單（我的順序） */
  self: DuoTicketRow[];
  /** 同伴的清單（{同伴}的順序） */
  partner: DuoTicketRow[];
  summary: { self: DuoDivisionSummary; partner: DuoDivisionSummary };
}

/** Unicode 碼點順序比較（不依語系） */
export function compareUnicode(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

interface PersonView {
  name: string;
  fingerprint: string;
  prefs: Map<string, { tier: Tier; hot: boolean }>;
  avail: ReturnType<typeof availabilityOf>;
  limit: number | null;
}

/** 與「誰是本裝置使用者」「搶票標記」「手動順序」無關的設定指紋；名字相同時用來決定誰先 */
function fingerprintOf(p: {
  display: string;
  daily_limit: number | null;
  film_preferences: UserState["film_preferences"];
  skipped_film_ids?: string[];
  avail: ReturnType<typeof availabilityOf>;
}): string {
  return JSON.stringify([
    p.display,
    p.daily_limit,
    [...p.film_preferences].sort((a, b) => compareUnicode(a.film_id, b.film_id)).map((f) => [f.film_id, f.tier, f.is_hot, f.tier_rank ?? null]),
    [...(p.skipped_film_ids ?? [])].sort(compareUnicode),
    [...p.avail].sort((a, b) => compareUnicode(a.date, b.date)),
  ]);
}

/**
 * 兩人搶票分工（004，FR-401～FR-404）。純函式；結果與「誰是本裝置使用者」無關：
 * - 項目：兩人行程（003）中的售票場次，一起看一筆（2 張）、自己看各一筆（1 張）。
 * - 整體順序：層級（一起取較高）→ 熱門（任一人）→ 可看場次少（一起以兩人都可看計）→ ★ → 影片順序 →
 *   （仍同分）一起看先於個人、名字排序前者先、場次編號。
 * - 分配：自己看的給本人；一起看的給目前筆數較少者，同筆數給名字（Unicode 碼點順序）較前者；
 *   名字相同時改比設定指紋（兩人設定的序列化字串），指紋也相同則兩人完全對稱、誰先都一樣。
 * 手動順序、搶票標記不影響分工；標記只影響每列目前場次與備案。
 */
export function buildDuoDivision(catalog: Catalog, state: UserState, duoEntries: DuoItineraryEntry[], partner: PartnerData): DuoDivision {
  const cinemaOf = cinemaResolver(catalog);
  const compat = (a: Session, b: Session) => areSessionsCompatibleEitherOrder(a, b, cinemaOf);
  const sessionById = new Map(catalog.sessions.map((s) => [s.session_id, s]));
  const filmOrder = new Map(catalog.films.map((f, i) => [f.film_id, i]));

  const view = (side: PersonSide): PersonView => {
    const src = side === "self" ? state : partner;
    const name = side === "self" ? state.self_name || "我" : partner.display_name;
    const avail = availabilityOf(src);
    return {
      name,
      fingerprint: fingerprintOf({ display: name, daily_limit: src.daily_limit, film_preferences: src.film_preferences, skipped_film_ids: src.skipped_film_ids, avail }),
      prefs: new Map(src.film_preferences.map((p) => [p.film_id, { tier: p.tier, hot: p.is_hot }])),
      avail,
      limit: src.daily_limit,
    };
  };
  const people: Record<PersonSide, PersonView> = { self: view("self"), partner: view("partner") };

  // 名字（相同時比指紋）決定誰是「先」的人
  const nameCmp = compareUnicode(people.self.name, people.partner.name) || compareUnicode(people.self.fingerprint, people.partner.fingerprint);
  const first: PersonSide = nameCmp <= 0 ? "self" : "partner";
  const second: PersonSide = first === "self" ? "partner" : "self";
  const rankOfPerson: Record<PersonSide, number> = { [first]: 1, [second]: 2 } as Record<PersonSide, number>;

  // 兩人各自的行程場次（供備案的相容與每日上限）
  const itinerarySessions: Record<PersonSide, Session[]> = { self: [], partner: [] };
  for (const e of duoEntries) {
    const s = sessionById.get(e.session_id);
    if (!s) continue;
    if (e.participant !== "partner") itinerarySessions.self.push(s);
    if (e.participant !== "self") itinerarySessions.partner.push(s);
  }

  interface Item {
    entry: DuoItineraryEntry;
    session: Session;
    involved: PersonSide[];
    tier: Tier;
    hot: boolean;
    watchable: number;
    star: boolean;
  }
  const items: Item[] = [];
  for (const entry of duoEntries) {
    if (entry.is_non_ticketed) continue;
    const session = sessionById.get(entry.session_id);
    if (!session) continue;
    const involved: PersonSide[] = entry.participant === "together" ? ["self", "partner"] : [entry.participant];
    const tiers = involved.map((p) => (p === "self" ? entry.tier : entry.partner_tier)).filter((t): t is Tier => !!t);
    if (tiers.length === 0) continue;
    const tier = tiers.reduce((a, b) => (TIER_RANK[a] <= TIER_RANK[b] ? a : b));
    const hot = involved.some((p) => people[p].prefs.get(session.film_id)?.hot ?? false);
    const watchable = catalog.sessions.filter((s) => s.film_id === session.film_id && involved.every((p) => isSessionAvailable(s, people[p].avail))).length;
    items.push({ entry, session, involved, tier, hot, watchable, star: isGuestSession(session) });
  }
  const ownerRank = (it: Item) => (it.involved.length === 2 ? 0 : rankOfPerson[it.involved[0]]);
  items.sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      Number(b.hot) - Number(a.hot) ||
      a.watchable - b.watchable ||
      Number(b.star) - Number(a.star) ||
      (filmOrder.get(a.session.film_id) ?? 0) - (filmOrder.get(b.session.film_id) ?? 0) ||
      ownerRank(a) - ownerRank(b) ||
      compareUnicode(a.session.session_id, b.session.session_id),
  );

  // 分配
  const counts: Record<PersonSide, number> = { self: 0, partner: 0 };
  const ownerOf = items.map((it) => {
    let owner: PersonSide;
    if (it.involved.length === 1) owner = it.involved[0];
    else owner = counts[first] <= counts[second] ? first : second;
    counts[owner]++;
    return owner;
  });

  // 已搶到：先認「排定場次本身」，再認可看範圍內的其他場次；一個場次只歸一個項目
  const marks = state.ticket_marks;
  const gotIds = marks.filter((m) => m.result === "got").map((m) => m.session_id);
  const missed = new Set(marks.filter((m) => m.result === "missed").map((m) => m.session_id));
  const feasible = (it: Item, s: Session) => it.involved.every((p) => isSessionAvailable(s, people[p].avail));
  const gotOf: (Session | undefined)[] = items.map(() => undefined);
  const claimed = new Set<string>();
  items.forEach((it, i) => {
    if (gotIds.includes(it.session.session_id)) {
      gotOf[i] = it.session;
      claimed.add(it.session.session_id);
    }
  });
  items.forEach((it, i) => {
    if (gotOf[i]) return;
    const id = gotIds.find((g) => !claimed.has(g) && sessionById.get(g)?.film_id === it.session.film_id && feasible(it, sessionById.get(g)!));
    if (id) {
      gotOf[i] = sessionById.get(id);
      claimed.add(id);
    }
  });

  const rows: DuoTicketRow[] = items.map((it, i) => {
    const filmId = it.session.film_id;
    const mine = catalog.sessions.filter((s) => s.film_id === filmId);
    const others: Record<PersonSide, Session[]> = {
      self: itinerarySessions.self.filter((s) => s.film_id !== filmId),
      partner: itinerarySessions.partner.filter((s) => s.film_id !== filmId),
    };
    // 其他項目已搶到的場次，只約束有共同參與者的項目
    const otherGot = items
      .map((o, j) => ({ o, g: gotOf[j] }))
      .filter((x): x is { o: Item; g: Session } => !!x.g && x.o.session.film_id !== filmId && x.o.involved.some((p) => it.involved.includes(p)))
      .map((x) => x.g);
    const usable = (s: Session) => !missed.has(s.session_id) && otherGot.every((g) => compat(s, g));
    const watchable = mine.filter((s) => feasible(it, s));
    const backups = watchable
      .filter((s) => s.session_id !== it.session.session_id && usable(s))
      .filter((s) =>
        it.involved.every(
          (p) =>
            others[p].every((o) => compat(s, o)) &&
            (people[p].limit === null || others[p].filter((o) => o.date === s.date).length + 1 <= people[p].limit!),
        ),
      )
      .sort(compareSessionsPreferred);

    let current: Session | undefined = gotOf[i];
    if (!current && usable(it.session)) current = it.session;
    if (!current) current = backups[0] ?? watchable.filter(usable).sort(compareSessionsPreferred)[0];

    const participant: ItineraryParticipant = it.entry.participant;
    const row: DuoTicketRow = {
      film_id: filmId,
      order: 0,
      global_order: i + 1,
      owner: ownerOf[i],
      participant,
      ticket_quantity: participant === "together" ? 2 : 1,
      tier: it.tier,
      is_hot: it.hot,
      current_session_id: current ? current.session_id : "",
      backup_session_ids: backups.filter((s) => s.session_id !== current?.session_id).map((s) => s.session_id),
      exhausted: !current,
    };
    if (gotOf[i]) row.got_session_id = gotOf[i]!.session_id;
    return row;
  });

  const list = (side: PersonSide) => rows.filter((r) => r.owner === side).map((r, k) => ({ ...r, order: k + 1 }));
  const self = list("self");
  const partnerRows = list("partner");
  const sum = (l: DuoTicketRow[]): DuoDivisionSummary => ({ count: l.length, tickets: l.reduce((a, r) => a + r.ticket_quantity, 0) });
  return { rows, self, partner: partnerRows, summary: { self: sum(self), partner: sum(partnerRows) } };
}
