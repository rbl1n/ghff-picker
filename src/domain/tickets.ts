import type { Catalog, ItineraryEntry, Session, TicketListItem, TicketResult, UserState } from "./types";
import { areSessionsCompatibleEitherOrder, cinemaResolver } from "./compat";
import { isSessionWatchable } from "./availability";
import { compareSessionsPreferred, isGuestSession } from "./schedule";

const TIER_RANK = { must: 0, want: 1, maybe: 2 } as const;

/**
 * 搶票清單。每個售票影片一列：
 * - current_session_id：已搶到的場次；否則排定場次（未被標沒搶到且與已搶到場次相容）；否則切到下一個備案；都沒有則 exhausted。
 * - backup_session_ids：可看、未被標沒搶到、與行程中其他影片及已搶到場次相容、不使當天超過每日上限；影人出席優先再依時間。
 * 順序：手動順序（manual_order，以索引為固定名次，"" 為空位）優先，其餘依層級、熱門、可看場次少、★、影片順序。
 */
export function buildTicketList(catalog: Catalog, state: UserState, itinerary: ItineraryEntry[]): TicketListItem[] {
  const cinemaOf = cinemaResolver(catalog);
  const compat = (a: Session, b: Session) => areSessionsCompatibleEitherOrder(a, b, cinemaOf);
  const sessionById = new Map(catalog.sessions.map((s) => [s.session_id, s]));
  const filmOrder = new Map(catalog.films.map((f, i) => [f.film_id, i]));
  const limit = state.daily_limit;
  const missed = new Set(state.ticket_marks.filter((m) => m.result === "missed").map((m) => m.session_id));
  const gotSessions = state.ticket_marks
    .filter((m) => m.result === "got")
    .map((m) => sessionById.get(m.session_id))
    .filter((s): s is Session => !!s);
  const hot = new Map(state.film_preferences.map((p) => [p.film_id, p.is_hot]));

  const planned = itinerary
    .map((e) => ({ entry: e, session: sessionById.get(e.session_id) }))
    .filter((x): x is { entry: ItineraryEntry; session: Session } => !!x.session);

  const rows = planned
    .filter((p) => !p.entry.is_non_ticketed)
    .map(({ entry, session }) => {
      const filmId = session.film_id;
      const others = planned.map((p) => p.session).filter((s) => s.film_id !== filmId);
      const otherGot = gotSessions.filter((s) => s.film_id !== filmId);
      const mine = catalog.sessions.filter((s) => s.film_id === filmId);
      const usable = (s: Session) => !missed.has(s.session_id) && otherGot.every((g) => compat(s, g));
      const watchableMine = mine.filter((s) => isSessionWatchable(s, state.unavailable_slots));

      const backups = watchableMine
        .filter((s) => s.session_id !== session.session_id && usable(s))
        .filter((s) => others.every((o) => compat(s, o)))
        .filter((s) => limit === null || others.filter((o) => o.date === s.date).length + 1 <= limit)
        .sort(compareSessionsPreferred);

      let current: Session | undefined = gotSessions.find((g) => g.film_id === filmId);
      if (!current && usable(session)) current = session;
      if (!current) current = backups[0] ?? watchableMine.filter(usable).sort(compareSessionsPreferred)[0];

      const item: TicketListItem = {
        film_id: filmId,
        order: 0,
        current_session_id: current ? current.session_id : "",
        backup_session_ids: backups.filter((s) => s.session_id !== current?.session_id).map((s) => s.session_id),
        exhausted: !current,
      };
      return { item, tier: entry.tier, star: isGuestSession(session), watchableCount: watchableMine.length };
    });

  rows.sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      Number(hot.get(b.item.film_id) ?? false) - Number(hot.get(a.item.film_id) ?? false) ||
      a.watchableCount - b.watchableCount ||
      Number(b.star) - Number(a.star) ||
      (filmOrder.get(a.item.film_id) ?? 0) - (filmOrder.get(b.item.film_id) ?? 0),
  );

  const ordered = applyManualOrder(rows.map((r) => r.item), state.manual_order);
  return ordered.map((item, i) => ({ ...item, order: i + 1 }));
}

function applyManualOrder(items: TicketListItem[], manual: string[] | null): TicketListItem[] {
  if (!manual || manual.length === 0) return items;
  const n = items.length;
  const result: (TicketListItem | null)[] = new Array(n).fill(null);
  const placed = new Set<string>();
  manual.forEach((filmId, idx) => {
    if (!filmId || placed.has(filmId)) return;
    const item = items.find((x) => x.film_id === filmId);
    if (!item || n === 0) return;
    let slot = Math.min(idx, n - 1);
    while (slot < n && result[slot]) slot++;
    if (slot >= n) {
      slot = Math.min(idx, n - 1);
      while (slot >= 0 && result[slot]) slot--;
    }
    if (slot < 0) return;
    result[slot] = item;
    placed.add(filmId);
  });
  const rest = items.filter((x) => !placed.has(x.film_id));
  let r = 0;
  return result.map((x) => x ?? rest[r++]);
}

/** 手動把影片移到第 position 位（從 1 起算）；manual_order 以索引為名次，"" 為自動排序的空位 */
export function moveFilmInOrder(state: UserState, filmId: string, position: number): UserState {
  const order = (state.manual_order ?? []).map((id) => (id === filmId ? "" : id));
  const idx = Math.max(0, Math.floor(position) - 1);
  while (order.length < idx) order.push("");
  if (order[idx] === undefined || order[idx] === "") order[idx] = filmId;
  else order.splice(idx, 0, filmId);
  while (order.length > 0 && order[order.length - 1] === "") order.pop();
  return { ...state, manual_order: order };
}

export function markSession(state: UserState, sessionId: string, result: TicketResult): UserState {
  if (result === "pending") return clearMark(state, sessionId);
  const marks = state.ticket_marks.filter((m) => m.session_id !== sessionId);
  marks.push({ session_id: sessionId, result });
  return { ...state, ticket_marks: marks };
}

export function clearMark(state: UserState, sessionId: string): UserState {
  return { ...state, ticket_marks: state.ticket_marks.filter((m) => m.session_id !== sessionId) };
}
