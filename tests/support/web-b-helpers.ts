// web-b（行程、搶票、分享與保存）專用 helper。不修改既有 support 檔。
import { expect, type Browser, type Locator, type Page, type BrowserContext } from "@playwright/test";
import type { Catalog, UserState } from "../../src/domain/types";
import { STORAGE_KEY } from "../../src/state/storage";
import { interceptSessions } from "./web-fixtures";
import { dateDisp, navLink, openTab, pressSchedule, storedOrDefault, type WebWorld } from "./web-a-helpers";
import { buildItinerary } from "../../src/domain/schedule";
import { buildTicketList } from "../../src/domain/tickets";
import { minToHhmm } from "./tables";
import { planStateOf } from "./web-duo-helpers";

// ---------------------------------------------------------------- 每個測試一份的暫存（以 page 為 key）
export interface TicketSnapshotRow {
  order: number;
  title: string;
  session: string;
  backups: string[];
}

export interface BState {
  miss?: { elapsedMs: number; clicks: number };
  pendingOrderTitles?: string[];
  desktopSnapshot?: TicketSnapshotRow[];
  desktopState?: UserState | null;
  shareUrl?: string;
  phoneUrl?: string;
  phoneContext?: BrowserContext;
  phonePage?: Page;
}

const store = new WeakMap<Page, BState>();
const allContexts: BrowserContext[] = [];

export function bState(page: Page): BState {
  let s = store.get(page);
  if (!s) {
    s = {};
    store.set(page, s);
  }
  return s;
}

export async function closeExtraContexts(): Promise<void> {
  while (allContexts.length) {
    const c = allContexts.pop()!;
    await c.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------- 文字與格式
export const norm = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** 2026-11-15 → "11/15（日）" */
export const dayLabel = (date: string): string => dateDisp(date);

export function parseSessionSpec(spec: string): { date: string; time: string; star: boolean } {
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})(\s*★)?$/.exec(spec.trim());
  if (!m) throw new Error(`invalid session text: ${spec}`);
  return { date: m[1], time: m[2].padStart(5, "0"), star: Boolean(m[3]) };
}

/** 畫面文字是否呈現 `日期 開演[ ★]`（日期顯示為「11/15（日）」） */
export function expectSessionText(text: string, spec: string): void {
  const { date, time, star } = parseSessionSpec(spec);
  const t = norm(text);
  expect(t, `應含日期 ${dayLabel(date)}`).toContain(dayLabel(date));
  expect(t, `應含開演 ${time}`).toContain(time);
  expect(t.includes("★"), `影人出席標記 ★ 應${star ? "出現" : "不出現"}：${t}`).toBe(star);
}

// ---------------------------------------------------------------- 導覽與等待
export async function gotoTab(page: Page, name: "選片" | "時段" | "行程" | "搶票"): Promise<void> {
  await navLink(page, name).click();
}

export async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("navigation", { name: "主要分頁" }).waitFor({ state: "visible" });
}

const UNSCHEDULED_LABEL = "未排入的必看片";
export const STALE_BANNER_TEXT = "條件已變更，重新排程";
export const EMPTY_ITINERARY_TEXT = "先到選片頁標記想看的片";

export const itineraryItems = (page: Page): Locator => page.getByTestId("itinerary-entry");
export const unscheduledBox = (page: Page): Locator => page.getByTestId("unscheduled-box");

/** 行程頁出現行程、空狀態或原因框（最多 10 秒） */
export async function waitItineraryReady(page: Page): Promise<void> {
  await itineraryItems(page)
    .first()
    .or(page.getByTestId("itinerary-empty"))
    .or(unscheduledBox(page))
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** 開啟選片頁（首次開啟會攔截快照並預載狀態）、按「排行程」一次、等行程頁內容出現 */
export async function arrangeItinerary(page: Page, world: WebWorld): Promise<void> {
  await openTab(page, world, "選片");
  await pressSchedule(page);
}

export const ticketRows = (page: Page): Locator => page.getByTestId("ticket-row");
export const ticketRowOf = (page: Page, title: string): Locator =>
  page.locator(`[data-testid="ticket-row"][data-film="${title}"]`);

export async function waitTicketRows(page: Page): Promise<void> {
  await ticketRows(page).first().waitFor({ state: "visible" });
}

/** 排行程後切到底部「搶票」分頁，等清單列出現 */
export async function arrangeAndOpenTickets(page: Page, world: WebWorld): Promise<void> {
  await arrangeItinerary(page, world);
  await gotoTab(page, "搶票");
  await waitTicketRows(page);
}


// ---------------------------------------------------------------- 搶票清單快照
export async function expandBackups(row: Locator): Promise<void> {
  const details = row.locator("details");
  const n = await details.count();
  for (let i = 0; i < n; i++) await details.nth(i).evaluate((d) => ((d as HTMLDetailsElement).open = true));
}

export async function backupTexts(row: Locator): Promise<string[]> {
  await expandBackups(row);
  const items = row.getByTestId("ticket-backup");
  const n = await items.count();
  if (n === 0) {
    const t = norm(await row.innerText());
    return t.includes("無不衝堂備案") ? ["無不衝堂備案"] : [];
  }
  return (await items.allInnerTexts()).map(norm);
}

export async function snapshotTickets(page: Page): Promise<TicketSnapshotRow[]> {
  await waitTicketRows(page);
  const rows = ticketRows(page);
  const n = await rows.count();
  const out: TicketSnapshotRow[] = [];
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    out.push({
      order: Number(norm(await row.getByTestId("ticket-order").innerText())),
      title: (await row.getAttribute("data-film")) ?? "",
      session: norm(await row.getByTestId("ticket-session").innerText()),
      backups: await backupTexts(row),
    });
  }
  return out;
}

/** 按鈕不存在或皆為 disabled */
export async function expectNotPressable(row: Locator, names: string[]): Promise<void> {
  for (const name of names) {
    const btn = row.getByRole("button", { name, exact: true });
    const n = await btn.count();
    for (let i = 0; i < n; i++) await expect(btn.nth(i)).toBeDisabled();
  }
}

// ---------------------------------------------------------------- 手機 context（另一台裝置）
export async function createPhone(
  browser: Browser,
  baseURL: string | undefined,
  catalog: Catalog,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  allContexts.push(context);
  const page = await context.newPage();
  await interceptSessions(page, catalog);
  return { context, page };
}

const REDIRECT_METHODS = [
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByTestId",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
  "evaluate",
  "evaluateHandle",
  "url",
  "goto",
  "reload",
  "waitForSelector",
  "waitForLoadState",
  "waitForFunction",
  "viewportSize",
  "setViewportSize",
  "content",
  "title",
] as const;

/**
 * 根 steps（畫面顯示錯誤、畫面不需左右捲動…）一律操作測試的 `page` fixture。
 * 手機建立後，把 `page` 的操作方法轉接到手機頁，讓這些共用句型檢查「手機畫面」。
 * 之後桌機頁不再被使用（桌機基準已存成快照）。
 */
export function redirectPageTo(page: Page, target: Page): void {
  const p = page as unknown as Record<string, unknown>;
  const t = target as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of REDIRECT_METHODS) {
    p[m] = (...args: unknown[]) => t[m](...args);
  }
}

/** 根 steps 若要自行取得目前代表「使用者眼前畫面」的頁面可用 */
export function activePage(page: Page): Page {
  return bState(page).phonePage ?? page;
}

export function corruptShareUrl(url: string): string {
  const idx = url.search(/[#?]/);
  const head = idx >= 0 ? url.slice(0, idx + 1) : url + "#";
  const payload = idx >= 0 ? url.slice(idx + 1) : "";
  return head + payload.slice(0, Math.max(1, payload.length >> 1)) + "!@#%";
}

/** 把手動順序（片名）寫進已開啟頁面的 localStorage 使用者狀態並重新載入 */
export async function applyManualOrder(page: Page, world: WebWorld, titles: string[]): Promise<void> {
  const ids = titles.map((t) => {
    const f = world.catalog?.films.find((x) => x.title === t);
    if (!f) throw new Error(`snapshot has no film "${t}"`);
    return f.film_id;
  });
  await page.evaluate(
    ([key, order]) => {
      const raw = window.localStorage.getItem(key);
      const state = raw
        ? JSON.parse(raw)
        : {
            schema_version: 1,
            daily_limit: null,
            manual_order: null,
            updated_at: new Date().toISOString(),
            film_preferences: [],
            unavailable_slots: [],
            ticket_marks: [],
          };
      state.manual_order = order;
      window.localStorage.setItem(key, JSON.stringify(state));
    },
    [STORAGE_KEY, ids] as const,
  );
  await page.reload();
}


// ---------------------------------------------------------------- 排程引擎對照（權威狀態）
/**
 * 以目前保存的使用者狀態呼叫 src/domain，算出行程與搶票清單，供 Then 比對畫面。
 * 搶票當下（FR-020）清單建立在排程當時的行程上，搶票標記只用來切換備案；
 * 只有「依搶到結果重新排程」後（FR-021）行程才納入標記，此時傳 replanned: true。
 */
export async function engineOf(page: Page, world: WebWorld, opts: { replanned?: boolean } = {}) {
  const state = await storedOrDefault(page);
  const catalog = world.catalog;
  if (!catalog) throw new Error("缺少場次快照");
  // 兩人模式：排程與搶票清單的輸入為合併結果；個人模式原樣（planStateOf 回傳同一物件）
  const effective = planStateOf(catalog, state);
  const planState = opts.replanned ? effective : { ...effective, ticket_marks: [] };
  const { itinerary, unscheduled } = buildItinerary(catalog, planState);
  const tickets = buildTicketList(catalog, effective, itinerary);
  const sessionById = (id: string) => {
    const s = catalog.sessions.find((x) => x.session_id === id);
    if (!s) throw new Error(`unknown session ${id}`);
    return s;
  };
  const titleOfFilm = (id: string) => catalog.films.find((f) => f.film_id === id)?.title ?? id;
  return { state, itinerary, unscheduled, tickets, sessionById, titleOfFilm };
}

/** 場次 → `日期 開演[ ★]`（與 DSL「場次」字串格式相同） */
export function sessionSpecOf(s: { date: string; start_min: number; marks: string[] }): string {
  return `${s.date} ${minToHhmm(s.start_min)}${s.marks.includes("guest_attending") ? " ★" : ""}`;
}

/** 引擎的未排入原因 → 畫面應含的文字片段（衝堂對象全部要出現） */
export function reasonFragments(reason: string, conflictTitles: string[]): string[] {
  if (reason === "no_available_session") return ["沒有可看場次"];
  if (reason === "daily_limit") return ["受每日上限限制"];
  return ["衝堂", ...conflictTitles];
}
