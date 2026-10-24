import LZString from "lz-string";
import QRCode from "qrcode";
import type { ShareKind, SharePayload, UserState } from "../domain/types";
import { SCHEMA_VERSION, isUserState, toStored } from "./storage";
import { migrateToV3 } from "./migrate";

/** 分享連結的 hash 前綴；匯入頁以此辨識 */
export const SHARE_HASH_PREFIX = "#/import?d=";

export interface DecodedShare {
  kind: ShareKind;
  /** 分享者的顯示名稱（personal）；沒有則 null */
  senderName: string | null;
  /** 已遷移成 schema_version 3 的內容 */
  state: UserState;
  /** 連結原本是 1、2 版：層內名次是暫時的，需待場次表就緒後依影片順序初始化 */
  legacy: boolean;
}

/** 兩人模式產生 merged、個人模式產生 personal（sender_name 取自己的名稱） */
export function sharePayloadOf(state: UserState): SharePayload {
  const full = toStored(state);
  if (state.partner) return { kind: "merged", schema_version: SCHEMA_VERSION, state: full };
  return { kind: "personal", schema_version: SCHEMA_VERSION, sender_name: state.self_name ?? null, state: full };
}

export function encodeShare(state: UserState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(sharePayloadOf(state)));
}

const READABLE = [1, 2, 3];

/** 讀入遷移：連結版本與內容版本取較舊者；1、2 版相減轉成 3，只在記憶體 */
function upgrade(state: UserState, payloadVersion: number): { state: UserState; legacy: boolean } {
  const version = Math.min(payloadVersion, state.schema_version);
  return { state: migrateToV3({ ...state, schema_version: version }), legacy: version < SCHEMA_VERSION };
}

/**
 * 由分享連結的 hash（或只有內容字串）還原內容；損毀或版本不符時丟出錯誤。
 * 沒有 kind 的內容是 001 的 UserState，視為個人分享連結。
 */
export function decodeShare(hash: string): DecodedShare {
  const marker = "d=";
  const at = hash.indexOf(marker);
  const payload = at >= 0 ? hash.slice(at + marker.length) : hash.replace(/^#\/?/, "");
  if (!payload) throw new Error("empty share payload");
  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (!json) throw new Error("cannot decompress share payload");
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed === "object" && parsed !== null && "kind" in parsed) {
    const p = parsed as Record<string, unknown>;
    if ((p.kind !== "personal" && p.kind !== "merged") || !READABLE.includes(p.schema_version as number) || !isUserState(p.state)) {
      throw new Error("invalid share payload");
    }
    if (p.kind === "merged" && !p.state.partner) throw new Error("merged share without partner");
    const sender = typeof p.sender_name === "string" && p.sender_name.trim() ? p.sender_name : null;
    return { kind: p.kind, senderName: sender, ...upgrade(p.state, p.schema_version as number) };
  }
  if (!isUserState(parsed)) throw new Error("invalid share payload");
  return { kind: "personal", senderName: null, ...upgrade(parsed, parsed.schema_version) };
}

/** baseUrl 例如 `https://host/ghff-picker/` */
export function buildShareUrl(state: UserState, baseUrl: string): string {
  return `${baseUrl}${SHARE_HASH_PREFIX}${encodeShare(state)}`;
}

export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 2, width: 440 });
}
