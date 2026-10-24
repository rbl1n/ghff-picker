import LZString from "lz-string";
import QRCode from "qrcode";
import type { UserState } from "../domain/types";
import { isUserState } from "./storage";

/** 分享連結的 hash 前綴；匯入頁以此辨識 */
export const SHARE_HASH_PREFIX = "#/import?d=";

/** 整份使用者狀態壓縮成可放進網址的字串 */
export function encodeShare(state: UserState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

/** 由分享連結的 hash（或只有內容字串）還原使用者狀態；損毀或版本不符時丟出錯誤 */
export function decodeShare(hash: string): UserState {
  const marker = "d=";
  const at = hash.indexOf(marker);
  const payload = at >= 0 ? hash.slice(at + marker.length) : hash.replace(/^#\/?/, "");
  if (!payload) throw new Error("empty share payload");
  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (!json) throw new Error("cannot decompress share payload");
  const parsed: unknown = JSON.parse(json);
  if (!isUserState(parsed)) throw new Error("invalid share payload");
  return parsed;
}

/** baseUrl 例如 `https://host/ghff-picker/` */
export function buildShareUrl(state: UserState, baseUrl: string): string {
  return `${baseUrl}${SHARE_HASH_PREFIX}${encodeShare(state)}`;
}

export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 2, width: 440 });
}
