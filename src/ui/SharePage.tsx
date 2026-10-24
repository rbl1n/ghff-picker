import { useEffect, useRef, useState } from "react";
import { buildShareUrl, qrDataUrl } from "../state/share";
import { useStore } from "./store";

export function SharePage() {
  const { user } = useStore();
  const url = buildShareUrl(user, `${window.location.origin}${import.meta.env.BASE_URL}`);
  const [qr, setQr] = useState<{ url: string; src: string } | "failed" | null>(null);
  const [toast, setToast] = useState("");
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
  );
}
