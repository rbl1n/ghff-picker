import { expect } from "@playwright/test";
import { areSessionsCompatible, transferBufferMinutes } from "../../../src/domain/compat";
import { cinemaOfVenue } from "../../support/planner-world";
import {
  When,
  Then,
  findSession,
  getCtx,
  oracleBuffer,
  oracleCompatible,
  parseFilmSessionRef,
  type CompatRow,
} from "../../support/planner-a-helpers";

type Table = { hashes(): Record<string, string>[] };

const ref = (text: string) => {
  const r = parseFilmSessionRef(text);
  return findSession(r.title, r.date, r.start);
};
const key = (a: string, b: string) => `${a.replace(/\s+/g, " ").trim()}|${b.replace(/\s+/g, " ").trim()}`;

// 系統判定以下場次是否相容：
When("系統判定以下場次是否相容：", async ({}, dataTable: Table) => {
  const rows: CompatRow[] = dataTable.hashes().map((r) => {
    const a = ref(r["前場"]);
    const b = ref(r["後場"]);
    return {
      front: r["前場"],
      back: r["後場"],
      a,
      b,
      compatible: areSessionsCompatible(a, b, cinemaOfVenue),
      swappedCompatible: areSessionsCompatible(b, a, cinemaOfVenue),
      buffer: transferBufferMinutes(cinemaOfVenue(a.venue_name), cinemaOfVenue(b.venue_name)),
    };
  });
  getCtx().compat = rows;
});

// 場次相容判定如下：
Then("場次相容判定如下：", async ({}, dataTable: Table) => {
  const results = getCtx().compat;
  expect(results, "尚未執行相容判定").not.toBeNull();
  const map = new Map(results!.map((r) => [key(r.front, r.back), r]));
  for (const row of dataTable.hashes()) {
    const res = map.get(key(row["前場"], row["後場"]));
    expect(res, `找不到判定結果: ${row["前場"]} -> ${row["後場"]}`).toBeDefined();
    const expectCompat = row["相容"].trim() === "相容";
    const expectBuffer = Number(row["轉場緩衝"]);
    expect(res!.compatible, `${row["前場"]} -> ${row["後場"]} 相容與否`).toBe(expectCompat);
    expect(res!.buffer, `${row["前場"]} -> ${row["後場"]} 轉場緩衝`).toBe(expectBuffer);
    // 權威狀態：緩衝由影城組合決定；相容 ⇔ 間隔 ≥ 緩衝
    expect(oracleBuffer(res!.a, res!.b)).toBe(expectBuffer);
    expect(oracleCompatible(res!.a, res!.b)).toBe(expectCompat);
    // 不該發生：互換順序不得被當成相容
    if (expectCompat) expect(res!.swappedCompatible, "前後場互換不得相容").toBe(false);
  }
});
