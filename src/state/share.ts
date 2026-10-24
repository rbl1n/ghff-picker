import LZString from "lz-string";
import QRCode from "qrcode";
import type { ShareKind, SharePayload, UserState } from "../domain/types";
import { SCHEMA_VERSION, isUserState } from "./storage";

/** 分享連結的 hash 前綴；匯入頁以此辨識 */
export const SHARE_HASH_PREFIX = "#/import?d=";

export interface DecodedShare {
  kind: ShareKind;
  /** 分享者的顯示名稱（personal）；沒有則 null */
  senderName: string | null;
  state: UserState;
}

/** 兩人模式產生 merged、個人模式產生 personal（sender_name 取自己的名稱） */
export function sharePayloadOf(state: UserState): SharePayload {
  const full = { ...state, schema_version: SCHEMA_VERSION };
  if (state.partner) return { kind: "merged", schema_version: SCHEMA_VERSION, state: full };
  return { kind: "personal", schema_version: SCHEMA_VERSION, sender_name: state.self_name ?? null, state: full };
}

export function encodeShare(state: UserState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(sharePayloadOf(state)));
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
    if ((p.kind !== "personal" && p.kind !== "merged") || p.schema_version !== SCHEMA_VERSION || !isUserState(p.state)) {
      throw new Error("invalid share payload");
    }
    if (p.kind === "merged" && !p.state.partner) throw new Error("merged share without partner");
    const sender = typeof p.sender_name === "string" && p.sender_name.trim() ? p.sender_name : null;
    return { kind: p.kind, senderName: sender, state: p.state };
  }
  if (!isUserState(parsed)) throw new Error("invalid share payload");
  return { kind: "personal", senderName: null, state: parsed };
}

/** baseUrl 例如 `https://host/ghff-picker/` */
export function buildShareUrl(state: UserState, baseUrl: string): string {
  return `${baseUrl}${SHARE_HASH_PREFIX}${encodeShare(state)}`;
}

export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 2, width: 440 });
}
