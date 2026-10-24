import type { CinemaId, Session } from "./types";

export function transferBufferMinutes(_from: CinemaId, _to: CinemaId): number {
  throw new Error("not implemented");
}

export function areSessionsCompatible(_a: Session, _b: Session, _cinemaOf: (venueName: string) => CinemaId): boolean {
  throw new Error("not implemented");
}
