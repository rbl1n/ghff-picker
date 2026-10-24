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

// ───────── 002 兩人模式 helper（只放容器與編碼，不放步驟語意） ─────────

import LZString from "lz-string";
import type { PartnerData, SharePayload } from "../../src/domain/types";

/** 分享連結的 hash 前綴（與 001 相同） */
const SHARE_HASH_PREFIX = "#/import?d=";

/** 待載入的同伴資料（同伴 Given 寫入；由「觀眾已加入同伴」或「同伴傳來個人分享連結」取用） */
export interface PendingPartner {
  data: PartnerData;
}

export function emptyPendingPartner(): PendingPartner {
  return { data: { display_name: "同伴", daily_limit: null, film_preferences: [], unavailable_slots: [] } };
}

/** 預載兩人模式 state fixture 的選項：schema_version 2、自己名稱與同伴 */
export function withDuoState(state: UserState, selfName: string, partner: PartnerData): UserState {
  return { ...state, schema_version: 2, self_name: selfName, partner: { ...partner } };
}

/** 自己設定的基準快照（分層、不可看時段、每日上限、手動順序、搶票標記），供「維持加入前的內容」比對 */
export function ownSettingsSnapshot(state: UserState): string {
  return JSON.stringify({
    film_preferences: state.film_preferences,
    unavailable_slots: state.unavailable_slots,
    daily_limit: state.daily_limit,
    manual_order: state.manual_order,
    ticket_marks: state.ticket_marks,
  });
}

function compress(value: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(value));
}

/** 以資料編成指定種類的分享連結（002 payload：kind / schema_version / sender_name / state） */
export function buildShareLink(baseUrl: string, kind: SharePayload["kind"], state: UserState, senderName?: string | null): string {
  const payload: SharePayload = {
    kind,
    schema_version: 2,
    ...(senderName ? { sender_name: senderName } : {}),
    state: kind === "personal" ? { ...state, partner: null, self_name: undefined } : state,
  };
  return `${baseUrl}${SHARE_HASH_PREFIX}${compress(payload)}`;
}

/** 001 版本格式連結：內容為 schema_version 1 的使用者狀態，沒有 kind 欄位 */
export function buildV1ShareLink(baseUrl: string, state: UserState): string {
  const v1: UserState = { ...state, schema_version: 1 };
  delete v1.self_name;
  delete v1.partner;
  return `${baseUrl}${SHARE_HASH_PREFIX}${compress(v1)}`;
}

/** 把連結編碼內容截斷成無法解碼 */
export function corruptShareLink(link: string): string {
  return link.slice(0, link.indexOf("d=") + 2 + 5) + "!!";
}

/** v1 格式的保存內容（不經 002 寫入程式）：預載進本機保存 */
export function buildV1State(base: UserState): UserState {
  const v1: UserState = { ...base, schema_version: 1 };
  delete v1.self_name;
  delete v1.partner;
  return v1;
}

/** 讀取目前本機保存中的同伴資料（沒有 = null） */
export async function readSavedPartner(page: Page): Promise<PartnerData | null> {
  const s = await readUserState(page);
  return s?.partner ?? null;
}
