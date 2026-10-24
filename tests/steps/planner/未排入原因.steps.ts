import { expect } from "@playwright/test";
import {
  Then,
  ensureState,
  getCtx,
  requireCatalog,
  sessionById,
  titleOf,
} from "../../support/planner-a-helpers";
import type { UnscheduledMustFilm } from "../../../src/domain/types";

type Table = { hashes(): Record<string, string>[] };

function reasonText(u: UnscheduledMustFilm): string {
  switch (u.reason) {
    case "no_available_session":
      return "沒有可看場次";
    case "daily_limit":
      return "受每日上限限制";
    case "conflicts_with_must": {
      if (!u.conflict_film_ids || u.conflict_film_ids.length === 0) return "與（缺少衝堂對象）衝堂";
      return `與${u.conflict_film_ids.map((id) => `「${titleOf(id)}」`).join("、")}衝堂`;
    }
    default:
      return String(u.reason);
  }
}

// 未排入的必看片與原因如下：
Then("未排入的必看片與原因如下：", async ({}, dataTable: Table) => {
  const result = getCtx().world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  const state = ensureState();
  const catalog = requireCatalog();
  const mustIds = new Set(state.film_preferences.filter((p) => p.tier === "must").map((p) => p.film_id));
  const scheduledFilms = new Set(result!.itinerary.map((e) => sessionById(e.session_id).film_id));

  const actual = result!.unscheduled.map((u) => `${titleOf(u.film_id)}=${reasonText(u)}`).sort();
  const expected = dataTable.hashes().map((r) => `${r["片名"].trim()}=${r["原因"].trim()}`).sort();
  expect(actual).toEqual(expected);

  for (const u of result!.unscheduled) {
    expect(mustIds.has(u.film_id), `${titleOf(u.film_id)} 不是必看片`).toBe(true);
    expect(reasonText(u).length, "原因不得空白").toBeGreaterThan(0);
    expect(scheduledFilms.has(u.film_id), `${titleOf(u.film_id)} 已排入行程卻出現在未排入清單`).toBe(false);
    if (u.reason === "conflicts_with_must" && u.conflict_film_ids) {
      const order = catalog.films.map((f) => f.film_id);
      const idx = u.conflict_film_ids.map((id) => order.indexOf(id));
      expect(idx, "衝堂對象須依影片首次出現順序").toEqual([...idx].sort((a, b) => a - b));
    }
  }
});

// 沒有未排入的必看片
Then("沒有未排入的必看片", async () => {
  const result = getCtx().world.lastResult;
  expect(result, "尚未執行排程").not.toBeNull();
  expect(result!.unscheduled).toHaveLength(0);
  const state = ensureState();
  const scheduledFilms = new Set(result!.itinerary.map((e) => sessionById(e.session_id).film_id));
  for (const p of state.film_preferences.filter((x) => x.tier === "must")) {
    expect(scheduledFilms.has(p.film_id), `必看片 ${titleOf(p.film_id)} 應在行程中`).toBe(true);
  }
});
