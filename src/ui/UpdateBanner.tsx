import { useBuildStatus } from "../state/build";

/** 偵測到新部署（或保存內容由更新的版本寫入）時置頂提示重新整理 */
export function UpdateBanner() {
  const { updateAvailable, writeBlocked } = useBuildStatus();
  if (!updateAvailable) return null;
  return (
    <div className="update-banner" data-testid="update-banner" role="status">
      <div>
        <b>網站已更新，請重新整理</b>
        {writeBlocked && (
          <div data-testid="write-blocked" className="hint">
            目前版本已過期，修改未保存
          </div>
        )}
      </div>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>
        重新整理
      </button>
    </div>
  );
}
