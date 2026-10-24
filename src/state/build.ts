import { useSyncExternalStore } from "react";

/** 本分頁執行的建置版本編號（時間戳記，單調遞增）；測試可用 window.__GHFF_BUILD__ 覆寫 */
export const BUILD_NUMBER: number = (() => {
  const o = typeof window !== "undefined" ? (window as unknown as { __GHFF_BUILD__?: unknown }).__GHFF_BUILD__ : undefined;
  return typeof o === "number" && Number.isFinite(o) ? o : typeof __BUILD_ID__ !== "undefined" ? Number(__BUILD_ID__) : 0;
})();

interface BuildStatus {
  /** 部署的版本與本分頁不同，或保存內容由更新的版本寫入 */
  updateAvailable: boolean;
  /** 保存內容由更新的版本寫入：本分頁不得寫入 */
  stale: boolean;
  /** 曾有修改因為過期而被擋下 */
  writeBlocked: boolean;
}

let status: BuildStatus = { updateAvailable: false, stale: false, writeBlocked: false };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<BuildStatus>): void {
  const next = { ...status, ...patch };
  if (next.updateAvailable === status.updateAvailable && next.stale === status.stale && next.writeBlocked === status.writeBlocked) return;
  status = next;
  listeners.forEach((l) => l());
}

export function useBuildStatus(): BuildStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

/** 保存內容的寫入版本比本分頁新 = 本分頁過期；回傳是否過期 */
export function noteStoredBuild(writtenBy: unknown): boolean {
  const stale = typeof writtenBy === "number" && Number.isFinite(writtenBy) && writtenBy > BUILD_NUMBER;
  if (stale) setStatus({ stale: true, updateAvailable: true });
  return stale;
}

export function noteWriteBlocked(): void {
  setStatus({ stale: true, updateAvailable: true, writeBlocked: true });
}

/** 讀 version.json（相對於網站 base、不使用快取）；與本分頁版本不同就標示有更新。失敗一律忽略 */
export async function checkDeployedBuild(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" });
    if (!res.ok) return;
    const v: unknown = await res.json();
    const n = typeof v === "object" && v !== null ? (v as { build_number?: unknown }).build_number : undefined;
    if (typeof n === "number" && Number.isFinite(n) && n !== BUILD_NUMBER) setStatus({ updateAvailable: true });
  } catch {
    // 離線、開發伺服器沒有 version.json 等：不處理
  }
}

const POLL_MS = 5 * 60 * 1000;

if (typeof window !== "undefined") {
  void checkDeployedBuild();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkDeployedBuild();
  });
  window.setInterval(() => void checkDeployedBuild(), POLL_MS);
}
