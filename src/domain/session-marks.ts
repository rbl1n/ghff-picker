import type { PinnedChoice, Session, SessionPref } from "./types";

/** 場次偏好的資料來源：自己（UserState）或同伴（PartnerData）都有這兩個選填欄位 */
export interface MarkSource {
  session_marks?: Record<string, SessionPref>;
  pinned_choices?: Record<string, PinnedChoice>;
}

/**
 * 場次偏好（005）的判讀。受限的片 = 有任何「只看」場次，或已選「看優先場」且有「優先」場次；
 * 受限的片只有「只看」（沒有只看時為「優先」）的場次是候選。
 */
export interface MarkView {
  /** 這場是否標為優先 */
  pref: (sessionId: string) => boolean;
  /** 這部片的候選場次是否被限制（只看，或已選看優先場） */
  restricted: (filmId: string) => boolean;
  /** 這場是否可作為候選（未受限，或受限且屬於限定的標記） */
  allowed: (session: Session) => boolean;
  /** 是否有任何標記或決定（沒有時整個機制不介入） */
  empty: boolean;
}

export function makeMarkView(src: MarkSource, sessionsOf: Map<string, Session[]>): MarkView {
  const marks = src.session_marks ?? {};
  const pins = src.pinned_choices ?? {};
  const empty = Object.keys(marks).length === 0;
  const rule = new Map<string, SessionPref>();
  if (!empty) {
    for (const [filmId, sessions] of sessionsOf) {
      let hasOnly = false;
      let hasPrefer = false;
      for (const s of sessions) {
        const m = marks[s.session_id];
        if (m === "only") hasOnly = true;
        else if (m === "prefer") hasPrefer = true;
      }
      if (hasOnly) rule.set(filmId, "only");
      else if (hasPrefer && pins[filmId] === "prefer_session") rule.set(filmId, "prefer");
    }
  }
  return {
    empty,
    pref: (sessionId) => marks[sessionId] === "prefer",
    restricted: (filmId) => rule.has(filmId),
    allowed: (s) => {
      const r = rule.get(s.film_id);
      return r === undefined || marks[s.session_id] === r;
    },
  };
}

export function groupSessionsByFilm(sessions: Session[]): Map<string, Session[]> {
  const out = new Map<string, Session[]>();
  for (const s of sessions) {
    const arr = out.get(s.film_id);
    if (arr) arr.push(s);
    else out.set(s.film_id, [s]);
  }
  return out;
}
