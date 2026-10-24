import type { Catalog, CinemaId, Session } from "./types";
import { sessionEndAbs, sessionStartAbs } from "./time";

/** 影廳名稱 → 影城 */
export function cinemaOfVenueName(venueName: string): CinemaId {
  if (venueName.includes("信義威秀")) return "xinyi_vieshow";
  if (venueName.includes("TITAN") || venueName.includes("松仁威秀")) return "songren_muvie";
  return "unknown";
}

/** 以場次快照的影廳表查影城，查不到時依名稱判定 */
export function cinemaResolver(catalog: Catalog): (venueName: string) => CinemaId {
  const map = new Map(catalog.venues.map((v) => [v.venue_name, v.cinema]));
  return (name) => map.get(name) ?? cinemaOfVenueName(name);
}

/** 同影城 5 分鐘；跨影城與無法判定 15 分鐘 */
export function transferBufferMinutes(from: CinemaId, to: CinemaId): number {
  return from === to && from !== "unknown" ? 5 : 15;
}

/** 前場 a、後場 b：後場開演 − 前場散場 ≥ 轉場緩衝 */
export function areSessionsCompatible(a: Session, b: Session, cinemaOf: (venueName: string) => CinemaId): boolean {
  const buffer = transferBufferMinutes(cinemaOf(a.venue_name), cinemaOf(b.venue_name));
  return sessionStartAbs(b) - sessionEndAbs(a) >= buffer;
}

/** 不論先後順序，兩場是否都看得到 */
export function areSessionsCompatibleEitherOrder(
  a: Session,
  b: Session,
  cinemaOf: (venueName: string) => CinemaId,
): boolean {
  const [first, second] = sessionStartAbs(a) <= sessionStartAbs(b) ? [a, b] : [b, a];
  return areSessionsCompatible(first, second, cinemaOf);
}
