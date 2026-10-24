import { useEffect, useRef, useState } from "react";
import { buildShareUrl, qrDataUrl } from "../state/share";
import { OFFICIAL_LINKS } from "./links";
import { hasPreviousState, restorePreviousState, useStore } from "./store";

export function SharePage() {
  const { user } = useStore();
  const url = buildShareUrl(user, `${window.location.origin}${import.meta.env.BASE_URL}`);
  const [qr, setQr] = useState<{ url: string; src: string } | "failed" | null>(null);
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    qrDataUrl(url).then(
      (src) => alive && setQr({ url, src }),
      () => alive && setQr("failed"),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setToast("已複製連結");
    } catch {
      input.current?.select();
      setToast("請長按網址，選擇複製");
    }
  };

  return (
    <>
    <section className="card">
      {user.partner && (
        <p style={{ margin: "0 0 8px", textAlign: "center" }}>
          <span className="tag tag-want">合併結果連結</span>
        </p>
      )}
      <p style={{ margin: 0, textAlign: "center" }}>用手機掃描，在手機上打開同一份清單</p>
      <div className="qrbox" data-testid="share-qr" data-url={url}>
        {qr && qr !== "failed" && qr.url === url ? (
          <img className="qr" src={qr.src} alt="分享 QR code" width={220} height={220} />
        ) : (
          <div className="qr qr-wait" aria-hidden="true">
            {qr === "failed" ? "QR code 產生失敗，請改用複製連結" : ""}
          </div>
        )}
      </div>
      <input
        ref={input}
        className="input mono"
        data-testid="share-url"
        readOnly
        value={url}
        aria-label="分享連結"
        onFocus={(e) => e.currentTarget.select()}
        style={{ marginBottom: 10 }}
      />
      <button className="btn btn-primary btn-block" onClick={() => void copy()}>
        複製連結
      </button>
      <div className="toast" role="status">
        {toast}
      </div>
    </section>
    <section className="card" aria-label="復原設定">
      <button className="btn btn-block" disabled={!hasPreviousState()} onClick={() => setConfirming(true)}>
        復原上一版設定
      </button>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        不小心被別的分頁或匯入蓋掉設定時，可以換回上一次保存的版本。
      </p>
      {confirming && (
        <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="restore-title" style={{ marginTop: 10 }}>
          <h2 id="restore-title">要復原上一版設定嗎？</h2>
          <p className="hint" style={{ margin: 0 }}>
            目前的設定會換成上一次保存的版本。
          </p>
          <div className="acts2">
            <button className="btn" onClick={() => setConfirming(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                restorePreviousState();
                setConfirming(false);
              }}
            >
              確認
            </button>
          </div>
        </div>
      )}
    </section>
    <section className="card" data-testid="official-links" aria-label="官方連結">
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>官方連結</h2>
      <ul className="offlinks">
        {OFFICIAL_LINKS.map((l) => (
          <li key={l.key}>
            <a data-testid="official-link" data-key={l.key} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
    </>
  );
}
