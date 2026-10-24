import { useState } from "react";
import { removePartner, useStore } from "./store";

/** 兩人模式的頂部橫幅（所有分頁共用）；個人模式完全不渲染 */
export function DuoBanner() {
  const { user } = useStore();
  const [confirming, setConfirming] = useState(false);
  const partner = user.partner;
  if (!partner) return null;
  const text = `兩人模式：${user.self_name || "我"} ＋ ${partner.display_name}`;
  return (
    <>
      <div className="duo-banner" data-testid="duo-banner">
        <b data-testid="duo-banner-text">{text}</b>
        <button className="btn" onClick={() => setConfirming(true)}>
          移除同伴
        </button>
      </div>
      {confirming && (
        <section className="dlg" role="dialog" aria-modal="true" aria-labelledby="remove-title" style={{ marginBottom: 12 }}>
          <h2 id="remove-title">要移除同伴「{partner.display_name}」嗎？</h2>
          <p className="hint" style={{ margin: 0 }}>
            同伴的資料會刪除，你自己的設定與搶票標記不變。
          </p>
          <div className="acts2">
            <button className="btn" onClick={() => setConfirming(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                removePartner();
                setConfirming(false);
              }}
            >
              確認
            </button>
          </div>
        </section>
      )}
    </>
  );
}
