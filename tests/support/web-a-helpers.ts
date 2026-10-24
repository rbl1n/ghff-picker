import { expect, type Locator, type Page } from "@playwright/test";
import { createBdd, test as base } from "playwright-bdd";
import { sortFilmsByCatalogOrder } from "../../src/domain/catalog-order";
import type { Catalog, Session, Tier, UserState } from "../../src/domain/types";
import { STORAGE_KEY } from "../../src/state/storage";
import { cinemaOfVenue } from "./planner-world";
import { hhmmToMin, marksFromSymbols, minToHhmm, TIER_LABEL_TO_ENUM } from "./tables";
import { availFromSlots, availOf, legacyState, prefsOf, ranked } from "./web-003-helpers";

/* ------------------------------------------------------------------ world */

export interface PendingMark {
  title: string;
  sessionText: string;
  result: "got" | "missed";
}

export interface WebWorld {
  /** Given 場次快照；null 代表空快照 */
  catalog: Catalog | null;
  failSessions: boolean;
  prefs: { title: string; tier: Tier; is_hot: boolean }[];
  slots: { date: string; start_min: number | null; end_min: number | null }[];
  dailyLimit: number | null;
  /** 不看的片名（004） */
  skipped: string[];
  /** 影片備註（片名 → 備註） */
  notes: { title: string; note: string }[];
  marks: PendingMark[];
  /** 是否已經開啟過網站（之後 Given 要直接寫 localStorage 並重新載入） */
  opened: boolean;
  routesReady: boolean;
  /** 非 null = 預載舊版格式（1 = 001、2 = 002）的保存內容，不經 003 的寫入程式 */
  legacyFormat: 1 | 2 | null;
}

export function createWebWorld(): WebWorld {
  return {
    catalog: null,
    failSessions: false,
    prefs: [],
    slots: [],
    dailyLimit: null,
    skipped: [],
    notes: [],
    marks: [],
    opened: false,
    routesReady: false,
    legacyFormat: null,
  };
}

/** web 共用 test：所有 web steps 檔都應該用這個 test / Given / When / Then */
import { seedOnboardingSeen } from "./web-fixtures";
export const test = base.extend<{ world: WebWorld }>({
  // eslint-disable-next-line no-empty-pattern
  world: async ({}, use) => {
    await use(createWebWorld());
  },
  context: async ({ context }, use) => {
    await seedOnboardingSeen(context);
    await use(context);
  },
});
export const { Given, When, Then } = createBdd(test);
export { expect };

/* ---------------------------------------------------------- data builders */

export type Row = Record<string, string>;

export const norm = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** "2026-11-15" → "11/15（日）" */
export function dateDisp(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}（${"日一二三四五六"[d.getUTCDay()]}）`;
}

export function emptyCatalog(): Catalog {
  return {
    festival_year: 2026,
    source_url: "https://example.invalid/ghff",
    fetched_at: "2026-10-01T00:00:00+08:00",
    films: [],
    venues: [],
    sessions: [],
  };
}

export function buildCatalog(rows: Row[]): Catalog {
  const catalog = emptyCatalog();
  const filmIds = new Map<string, string>();
  for (const r of rows) {
    const title = r["片名"];
    if (!filmIds.has(title)) {
      const id = r["影片編號"]?.trim() || `film-${filmIds.size + 1}`;
      filmIds.set(title, id);
      catalog.films.push({
        film_id: id,
        title,
        runtime_min: Number(r["片長"]),
        rating: r["分級"] || "普",
        ...(r["片號"]?.trim() ? { catalog_no: r["片號"].trim() } : {}),
        // 短片單元：「頁碼 片名」以「、」連接
        ...(r["短片"]?.trim()
          ? {
              shorts: r["短片"].split("、").map((x) => {
                const m = /^(\d{3})\s+(.+)$/.exec(x.trim());
                return m ? { title: m[2], catalog_no: m[1] } : { title: x.trim() };
              }),
            }
          : {}),
      });
    }
    const venue = r["影廳"];
    if (!catalog.venues.some((v) => v.venue_name === venue)) {
      catalog.venues.push({ venue_name: venue, cinema: cinemaOfVenue(venue) });
    }
    const start = hhmmToMin(r["開演"]);
    catalog.sessions.push({
      session_id: `${filmIds.get(title)}-${r["日期"]}-${r["開演"].replace(":", "")}`,
      film_id: filmIds.get(title)!,
      date: r["日期"],
      start_min: start,
      end_min: start + Number(r["片長"]),
      venue_name: venue,
      marks: marksFromSymbols(r["標記"] ?? ""),
    });
  }
  return catalog;
}

export function filmIdOf(world: WebWorld, title: string): string {
  const f = world.catalog?.films.find((x) => x.title === title);
  if (!f) throw new Error(`snapshot has no film "${title}"`);
  return f.film_id;
}

/** "2026-11-15 14:00 ★" → 快照中的場次 */
export function sessionOf(world: WebWorld, title: string, sessionText: string): Session {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2})/.exec(sessionText.trim());
  if (!m) throw new Error(`invalid session text: ${sessionText}`);
  const fid = filmIdOf(world, title);
  const s = world.catalog!.sessions.find(
    (x) => x.film_id === fid && x.date === m[1] && x.start_min === hhmmToMin(m[2]),
  );
  if (!s) throw new Error(`no session ${sessionText} for "${title}"`);
  return s;
}

export function parseSlotText(text: string): { start_min: number | null; end_min: number | null } {
  if (text.trim() === "整天不可看") return { start_min: null, end_min: null };
  const [a, b] = text.split(/[–-]/);
  return { start_min: hhmmToMin(a), end_min: hhmmToMin(b) };
}

export function slotText(slot: { start_min: number | null; end_min: number | null }): string {
  return slot.start_min === null || slot.end_min === null
    ? "整天不可看"
    : `${minToHhmm(slot.start_min)}–${minToHhmm(slot.end_min)}`;
}

/** schema_version 3 的空狀態（003：有空時段取代不可看時段、影片分層帶層內名次） */
export function defaultState(): UserState {
  return {
    schema_version: 3,
    daily_limit: null,
    manual_order: null,
    updated_at: "2026-10-01T00:00:00+08:00",
    film_preferences: [],
    availability: [],
    ticket_marks: [],
  } as unknown as UserState;
}

/** 由 Given 累積的資料組出預載使用者狀態（schema_version 3：層內名次依列順序、不可看時段從有空時段扣除） */
export function buildState(world: WebWorld): UserState {
  const s = defaultState() as unknown as Record<string, unknown>;
  s.daily_limit = world.dailyLimit;
  s.film_preferences = ranked(world.prefs.map((p) => ({ film_id: filmIdOf(world, p.title), tier: p.tier, is_hot: p.is_hot })));
  s.availability = availFromSlots(world.slots);
  if (world.skipped.length) s.skipped_film_ids = world.skipped.map((t) => filmIdOf(world, t));
  if (world.notes.length) s.film_notes = Object.fromEntries(world.notes.map((n) => [filmIdOf(world, n.title), n.note]));
  s.ticket_marks = world.marks.map((m) => ({
    session_id: sessionOf(world, m.title, m.sessionText).session_id,
    result: m.result,
  }));
  return s as unknown as UserState;
}

/** 實際預載進本機保存的內容：舊版格式 Given 之後為 001／002 格式，否則為 schema_version 3 */
export function storageStateOf(world: WebWorld): UserState {
  if (world.legacyFormat === null) return buildState(world);
  return legacyState(world.legacyFormat, {
    prefs: world.prefs.map((p) => ({ film_id: filmIdOf(world, p.title), tier: p.tier, is_hot: p.is_hot })),
    slots: world.slots,
    dailyLimit: world.dailyLimit,
    marks: buildState(world).ticket_marks,
  });
}

function sortedNorm(s: UserState) {
  return {
    daily_limit: s.daily_limit,
    manual_order: s.manual_order,
    film_preferences: [...prefsOf(s)].sort((a, b) => a.film_id.localeCompare(b.film_id)),
    availability: [...availOf(s)].sort((a, b) => a.date.localeCompare(b.date)),
    skipped_film_ids: [...(s.skipped_film_ids ?? [])].sort(),
    ticket_marks: [...s.ticket_marks].sort((a, b) => a.session_id.localeCompare(b.session_id)),
  };
}

export function sameState(a: UserState, b: UserState): boolean {
  return JSON.stringify(sortedNorm(a)) === JSON.stringify(sortedNorm(b));
}

/* ----------------------------------------------------------- page driving */

export const TAB_HASH = { 選片: "pick", 時段: "slots", 行程: "itinerary", 搶票: "tickets", 分享: "share" } as const;
export type TabLabel = keyof typeof TAB_HASH;

/** 第一次開啟前：攔截場次快照、預載使用者狀態（僅在 localStorage 尚無資料時寫入，重新載入不會蓋掉操作結果） */
async function prepare(page: Page, world: WebWorld): Promise<void> {
  if (world.routesReady) return;
  world.routesReady = true;
  await page.route("**/data/sessions.json", (route) =>
    world.failSessions
      ? route.abort()
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(world.catalog ?? emptyCatalog()),
        }),
  );
  const hasState =
    world.prefs.length > 0 || world.skipped.length > 0 || world.notes.length > 0 || world.slots.length > 0 || world.dailyLimit !== null || world.marks.length > 0;
  if (hasState) {
    const json = JSON.stringify(storageStateOf(world));
    await page.addInitScript(
      ([key, value]) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, json] as const,
    );
  }
}

export function navLink(page: Page, label: TabLabel): Locator {
  return page.getByRole("navigation", { name: "主要分頁" }).getByRole("link", { name: label, exact: true });
}

/** 確保目前在指定分頁；尚未開啟網站時以該分頁的網址開啟 */
export async function openTab(page: Page, world: WebWorld, label: TabLabel): Promise<void> {
  const hash = TAB_HASH[label];
  if (!world.opened) {
    await prepare(page, world);
    await page.goto(`/#/${hash}`);
    world.opened = true;
    return;
  }
  const url = page.url();
  if (!url.includes(`#/${hash}`) && !(hash === "slots" && !url.includes("#/"))) {
    await navLink(page, label).click();
  }
}

/** Given 於頁面已開啟後才補寫狀態：直接寫 localStorage 後重新載入，回到指定分頁 */
export async function reapplyState(page: Page, world: WebWorld, backTo: TabLabel): Promise<void> {
  if (!world.opened) return;
  const json = JSON.stringify(storageStateOf(world));
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, json] as const);
  await page.reload();
  if (!page.url().includes(`#/${TAB_HASH[backTo]}`)) await navLink(page, backTo).click();
}

export async function storedState(page: Page): Promise<UserState | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
  return raw ? (JSON.parse(raw) as UserState) : null;
}

/** 讀保存內容（null 視為預設空狀態） */
export async function storedOrDefault(page: Page): Promise<UserState> {
  return (await storedState(page)) ?? defaultState();
}

/** 在選片頁按「排行程」並等排程結束（行程或空狀態／原因框出現） */
export async function pressSchedule(page: Page): Promise<void> {
  await page.locator("a,button").filter({ hasText: /^排行程$/ }).first().click();
  await page
    .getByTestId("itinerary-entry")
    .or(page.getByTestId("itinerary-empty"))
    .or(page.getByTestId("unscheduled-box"))
    .first()
    .waitFor({ timeout: 10_000 });
}

/* ---------------------------------------------------------- film cards */

export function filmCard(page: Page, title: string): Locator {
  return page.locator(`[data-testid="film-card"][data-title="${title}"]`);
}

export async function expandCard(card: Locator): Promise<void> {
  const details = card.locator("details").first();
  if ((await details.count()) > 0) {
    if (!(await details.evaluate((e) => (e as HTMLDetailsElement).open))) await card.locator("summary").first().click();
  } else {
    const btn = card.getByRole("button", { name: /展開/ });
    if ((await btn.count()) > 0) await btn.first().click();
  }
}

export const MARK_NAME = ["影人出席", "華語無中英字幕", "非英語無英文字幕", "非售票活動"];

export const TIER_LABELS = ["必看", "想看", "有空再看"] as const;
/** 卡片上已啟用的層級按鈕（不含「不看」） */
export const TIER_BUTTON = /^(必看|想看|有空再看)$/;
export { TIER_LABEL_TO_ENUM };

/** 004：切到選片頁的篩選 chip，回傳目前列出的片名（依畫面順序） */
export async function titlesUnderFilter(page: Page, filter: string): Promise<string[]> {
  const chip = page.getByRole("button", { name: filter, exact: true }).filter({ has: page.locator("xpath=self::*[contains(@class,'chip')]") });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  // 等清單穩定：兩次讀取一致
  let prev = "";
  await expect
    .poll(async () => {
      const cur = (await page.getByTestId("film-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-title")))).join("、");
      const stable = cur === prev;
      prev = cur;
      return stable;
    })
    .toBe(true);
  return page.getByTestId("film-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-title") ?? ""));
}

/** 004：驗證某篩選列出的片名、與保存的 skipped_film_ids 一致；重新載入後再驗一次 */
export async function expectFilterTitles(page: Page, world: WebWorld, filter: string, expected: string[]): Promise<void> {
  const check = async () => {
    expect(await titlesUnderFilter(page, filter), `${filter} 篩選`).toEqual(expected);
    const st = await storedOrDefault(page);
    const skipped = new Set(st.skipped_film_ids ?? []);
    const cat = world.catalog!;
    const idOf = (t: string) => cat.films.find((f) => f.title === t)!.film_id;
    const prefIds = new Set(st.film_preferences.map((p) => p.film_id));
    const want = sortFilmsByCatalogOrder(cat.films)
      .filter((f) => {
        if (filter === "不看") return skipped.has(f.film_id);
        if (skipped.has(f.film_id)) return false;
        return filter === "全部" || (filter === "已標記" ? prefIds.has(f.film_id) : !prefIds.has(f.film_id));
      })
      .map((f) => f.title);
    expect(want).toEqual(expected);
    for (const t of expected) if (filter === "不看") expect(skipped.has(idOf(t))).toBe(true);
    for (const id of skipped) expect(prefIds.has(id), "不看與層級互斥").toBe(false);
  };
  await check();
  await page.reload();
  await check();
}

/** 004：開啟網站首頁（無 hash），首次開啟時先攔截場次快照與預載狀態 */
export async function openLanding(page: Page, world: WebWorld): Promise<void> {
  if (!world.opened) {
    await prepare(page, world);
    world.opened = true;
  }
  await page.goto("/");
  await page.getByRole("navigation", { name: "主要分頁" }).waitFor({ state: "visible" });
}

/** 004：以指定 hash 開啟（例如分享連結），首次開啟時先攔截場次快照與預載狀態 */
export async function openUrl(page: Page, world: WebWorld, url: string): Promise<void> {
  if (!world.opened) {
    await prepare(page, world);
    world.opened = true;
  }
  await page.goto(url);
}

/** 選片頁目前列出的影片卡（畫面順序）的片名 */
export async function shownFilmTitles(page: Page): Promise<string[]> {
  return page.getByTestId("film-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-title") ?? ""));
}
