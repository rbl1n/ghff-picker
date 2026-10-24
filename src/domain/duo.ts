import type { Catalog, DuoItineraryEntry, ItineraryParticipant, PartnerData, Session, UnscheduledMustFilm, UserState } from "./types";
import { assignSessions, explainUnscheduled, makeContext, personInputOf, personalFilmSet, preparePerson } from "./schedule";
import { sessionStartAbs } from "./time";
import { availabilityOf, isSessionAvailable } from "./availability";

export interface DuoSchedule {
  entries: DuoItineraryEntry[];
  /** 兩人各自排不進去的必看片，owner 標明是誰的 */
  unscheduled: UnscheduledMustFilm[];
}

const PARTICIPANT_ORDER: Record<ItineraryParticipant, number> = { together: 0, self: 1, partner: 2 };

/**
 * 兩人各自片單同時排程（003，CL-301）。
 * 每人的可看、相容、每日上限只約束自己；先各自求個人最佳（必看／想看／有空再看數與層內排序），
 * 再在「兩人都是個人最佳」的組合中，選一起看場次最多者，其次兩人 ★ 合計，其餘同分固定為場次較早者。
 * 搶票標記只屬於自己（self）；同伴沒有標記。
 */
export function scheduleDuo(catalog: Catalog, self: UserState, partner: PartnerData): DuoSchedule {
  const ctx = makeContext(catalog);
  // 004：搶票標記可標在同伴的順序上；落在自己沒空時段的標記（同伴自己看的場次）不拿來固定自己的行程
  const sessionById = new Map(catalog.sessions.map((s) => [s.session_id, s]));
  const selfAvail = availabilityOf(self);
  const ownMarks = self.ticket_marks.filter((m) => {
    const s = sessionById.get(m.session_id);
    return !!s && isSessionAvailable(s, selfAvail);
  });
  const plans = [
    preparePerson(ctx, personInputOf({ ...self, ticket_marks: ownMarks })),
    preparePerson(ctx, personInputOf({ ...partner, ticket_marks: [] })),
  ];
  const sets = plans.map((p) => personalFilmSet(p));
  const { sessions } = assignSessions(plans, sets);

  const bySession = new Map<string, { session: Session; self: boolean; partner: boolean }>();
  sessions.forEach((list, p) => {
    for (const s of list) {
      const e = bySession.get(s.session_id) ?? { session: s, self: false, partner: false };
      if (p === 0) e.self = true;
      else e.partner = true;
      bySession.set(s.session_id, e);
    }
  });
  const entries: DuoItineraryEntry[] = [...bySession.values()]
    .map(({ session, self: mine, partner: theirs }) => {
      const participant: ItineraryParticipant = mine && theirs ? "together" : mine ? "self" : "partner";
      return {
        session,
        entry: {
          session_id: session.session_id,
          participant,
          tier: mine ? plans[0].tierOf.get(session.film_id)! : null,
          partner_tier: theirs ? plans[1].tierOf.get(session.film_id)! : null,
          is_non_ticketed: session.marks.includes("non_ticketed"),
        } as DuoItineraryEntry,
      };
    })
    .sort(
      (a, b) =>
        sessionStartAbs(a.session) - sessionStartAbs(b.session) ||
        PARTICIPANT_ORDER[a.entry.participant] - PARTICIPANT_ORDER[b.entry.participant] ||
        (ctx.filmOrder.get(a.session.film_id) ?? 0) - (ctx.filmOrder.get(b.session.film_id) ?? 0) ||
        (a.session.session_id < b.session.session_id ? -1 : 1),
    )
    .map((x) => x.entry);

  return {
    entries,
    unscheduled: [
      ...explainUnscheduled(ctx, plans[0], sessions[0], "self"),
      ...explainUnscheduled(ctx, plans[1], sessions[1], "partner"),
    ],
  };
}
