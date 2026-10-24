import { availabilityFromUnavailable } from "../domain/availability";
import { initTierRanks } from "../domain/order";
import type { Catalog, DayAvailability, FilmPreference, PartnerData, UnavailableSlot, UserState } from "../domain/types";

function migratePerson<T extends { film_preferences: FilmPreference[]; unavailable_slots?: UnavailableSlot[]; availability?: DayAvailability[] }>(
  person: T,
  filmIds: string[],
): T {
  return {
    ...person,
    availability: person.availability ?? availabilityFromUnavailable(person.unavailable_slots ?? []),
    unavailable_slots: [],
    film_preferences: initTierRanks(person.film_preferences, filmIds),
  };
}

/**
 * schema_version 1、2 -> 3 的讀入遷移（003）：不可看時段從全天有空相減成有空時段、層內名次依場次表影片順序初始化。
 * 自己與 partner 規則相同；只發生在讀入記憶體（下一次保存才以 3 寫回）。已是 3 的資料原樣回傳。
 */
export function migrateToV3(state: UserState, catalog?: Catalog): UserState {
  if (state.schema_version >= 3) return state;
  const filmIds = catalog ? catalog.films.map((f) => f.film_id) : [];
  const migrated = migratePerson(state, filmIds);
  const partner: PartnerData | null | undefined = state.partner ? migratePerson(state.partner, filmIds) : state.partner;
  return { ...migrated, schema_version: 3, ...(state.partner !== undefined ? { partner } : {}) };
}
