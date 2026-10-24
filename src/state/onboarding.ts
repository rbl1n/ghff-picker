/** 「已看過使用說明」記錄：獨立於使用者狀態的另一個 localStorage key；存取一律 try/catch */
export const ONBOARDING_KEY = "ghff-picker:onboarding-seen";

export function onboardingSeen(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) !== null;
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // 儲存空間不可用時，本次瀏覽內關閉即可
  }
}
