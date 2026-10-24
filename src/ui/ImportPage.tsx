import { useMemo } from "react";
import { decodeShare } from "../state/share";
import { replaceUser } from "./store";

/** 開啟分享連結：確認後才取代本機設定；連結損毀時只顯示錯誤 */
export function ImportPage() {
  const decoded = useMemo(() => {
    try {
      return decodeShare(window.location.hash);
    } catch {
      return null;
    }
  }, []);

  if (!decoded) {
    return (
      <section className="banner banner-error">
        <h2>這個分享連結無法讀取，請在原裝置重新產生</h2>
        <a className="btn btn-block" href="#/pick">
          回到選片
        </a>
      </section>
    );
  }

  const confirm = () => {
    replaceUser(decoded);
    window.location.replace("#/tickets");
  };

  return (
    <div className="backdrop">
      <section className="dlg" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">要用這份設定取代此裝置的設定嗎？</h2>
        <p className="hint" style={{ margin: 0 }}>
          這份設定包含 {decoded.film_preferences.length} 部片的標記、不可看時段與搶票順序。此裝置原有的設定會被覆蓋。
        </p>
        <div className="acts2">
          <button className="btn" onClick={() => window.location.replace("#/pick")}>
            取消
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            取代並開始搶票
          </button>
        </div>
      </section>
    </div>
  );
}
