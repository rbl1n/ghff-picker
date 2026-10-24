import type { Tier, TicketOrderKeys } from "./types";

export const TIER_ORDER: Record<Tier, number> = { must: 0, want: 1, maybe: 2 };
const NO_RANK = Number.MAX_SAFE_INTEGER;

export type OrderKeyName = "tier" | "hot" | "rank" | "remaining" | "star" | "film_index";

/** 依序比較兩筆的搶票順序鍵；回傳負數＝a 在前。先決定的鍵由 decidingKey 取得 */
export function compareOrderKeys(a: TicketOrderKeys, b: TicketOrderKeys): number {
  return (
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
    Number(b.hot) - Number(a.hot) ||
    (a.rank ?? NO_RANK) - (b.rank ?? NO_RANK) ||
    a.remaining - b.remaining ||
    Number(b.star) - Number(a.star) ||
    a.film_index - b.film_index
  );
}

/** a 排在 b 前面時，第一個分出高下的鍵；完全相同回傳 null；b 其實該在前（例如手動調整）回傳 "manual" */
export function decidingKey(a: TicketOrderKeys, b: TicketOrderKeys): OrderKeyName | "manual" | null {
  const checks: [OrderKeyName, number][] = [
    ["tier", TIER_ORDER[a.tier] - TIER_ORDER[b.tier]],
    ["hot", Number(b.hot) - Number(a.hot)],
    ["rank", (a.rank ?? NO_RANK) - (b.rank ?? NO_RANK)],
    ["remaining", a.remaining - b.remaining],
    ["star", Number(b.star) - Number(a.star)],
    ["film_index", a.film_index - b.film_index],
  ];
  for (const [k, d] of checks) if (d !== 0) return d < 0 ? k : "manual";
  return null;
}
