import type { Catalog, ItineraryEntry, TicketListItem, TicketResult, UserState } from "./types";

export function buildTicketList(_catalog: Catalog, _state: UserState, _itinerary: ItineraryEntry[]): TicketListItem[] {
  throw new Error("not implemented");
}

export function moveFilmInOrder(_state: UserState, _filmId: string, _position: number): UserState {
  throw new Error("not implemented");
}

export function markSession(_state: UserState, _sessionId: string, _result: TicketResult): UserState {
  throw new Error("not implemented");
}

export function clearMark(_state: UserState, _sessionId: string): UserState {
  throw new Error("not implemented");
}
