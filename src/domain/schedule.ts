import type { Catalog, ItineraryEntry, UnscheduledMustFilm, UserState } from "./types";

export interface ScheduleResult {
  itinerary: ItineraryEntry[];
  unscheduled: UnscheduledMustFilm[];
}

export function buildItinerary(_catalog: Catalog, _state: UserState): ScheduleResult {
  throw new Error("not implemented");
}
