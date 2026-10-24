import { useEffect, useRef, useState } from "react";

export const ONBOARDING_STEPS = [
  {
    title: "時段（你什麼時候有空）",
    body: ["在小時格子點掉沒空的時間，預設整天有空。", "可以多選日期一起套用，也能設每日最多看幾場。"],
  },
  {
    title: "選片（你想看什麼）",
    body: [
      "每部片標「必看」「想看」「有空再看」；不想看的標「不看」，就會收起來。",
      "同一層的片可以上移、下移排先後。",
      "開賣會秒殺的片，點「熱門」。",
    ],
  },
  {
    title: "行程與搶票",
    body: ["系統會自動排出最接近理想的片單。", "搶票頁照順序搶，沒搶到按一下就換備案。"],
  },
  {
    title: "兩人一起（可略過）",
    body: [
      "兩人各自設定好，用「分享」連結交換，就會排出哪些一起看、哪些各自看。",
      "資料只存在這台裝置的瀏覽器；換裝置請用分享連結帶過去。",
    ],
  },
] as const;

const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** 使用說明對話框：4 步、略過、Esc 關閉、焦點鎖在對話框內（關閉後焦點還給原本的元素） */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const last = step === ONBOARDING_STEPS.length - 1;
  const cur = ONBOARDING_STEPS[step];

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button.btn-primary")?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (!ref.current?.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="onb-backdrop" onKeyDown={onKeyDown}>
      <section ref={ref} className="dlg onb" role="dialog" aria-modal="true" aria-labelledby="onb-title" data-testid="onboarding-dialog">
        <div className="row">
          <span className="hint" data-testid="onboarding-progress">
            {step + 1}/{ONBOARDING_STEPS.length}
          </span>
          <span className="sp" />
          <button className="btn onb-skip" onClick={onClose}>
            略過
          </button>
        </div>
        <h2 id="onb-title" data-testid="onboarding-title">
          {cur.title}
        </h2>
        <ul className="onb-body">
          {cur.body.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="onb-acts">
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          )}
          {last ? (
            <button className="btn btn-primary" onClick={onClose}>
              開始使用
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              下一步
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
