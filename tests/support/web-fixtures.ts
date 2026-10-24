import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { Catalog, UserState } from "../../src/domain/types";
import { STORAGE_KEY } from "../../src/state/storage";

/** 以測試用場次快照取代 /data/sessions.json 的請求 */
export async function interceptSessions(page: Page, catalog: Catalog): Promise<void> {
  await page.route("**/data/sessions.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }),
  );
}

/** 場次資料無法載入 */
export async function failSessions(page: Page): Promise<void> {
  await page.route("**/data/sessions.json", (route) => route.abort());
}

/** 頁面載入前預載 localStorage 使用者狀態 */
export async function preloadUserState(target: Page | BrowserContext, state: UserState): Promise<void> {
  await target.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(state)] as const,
  );
}

/** 讀取目前 localStorage 中的使用者狀態 */
export async function readUserState(page: Page): Promise<UserState | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return raw ? (JSON.parse(raw) as UserState) : null;
}

/** 第二個 browser context，代表「另一台裝置」 */
export async function newOtherDevice(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}
