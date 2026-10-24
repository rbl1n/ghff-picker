import { useMemo, useState } from "react";
import type { PartnerData } from "../domain/types";
import { decodeShare, type DecodedShare } from "../state/share";
import { replaceUser, setPartner, useStore } from "./store";

const DEFAULT_SELF = "我";
const DEFAULT_PARTNER = "同伴";

type Stage = "choose" | "name" | "replace";

/** 開啟分享連結：確認後才改寫本機設定；連結損毀時只顯示錯誤 */
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
  return decoded.kind === "merged" ? <MergedDialog decoded={decoded} /> : <PersonalDialog decoded={decoded} />;
}

const cancel = () => window.location.replace("#/pick");

/** 合併結果連結：只能取代並開啟或取消 */
function MergedDialog({ decoded }: { decoded: DecodedShare }) {
  const { state } = decoded;
  const title = `這是「${state.self_name || DEFAULT_SELF} ＋ ${state.partner?.display_name || DEFAULT_PARTNER}」的合併結果。`;
  const confirm = () => {
    replaceUser(state);
    window.location.replace("#/tickets");
  };
  return (
    <div className="backdrop">
      <section className="dlg" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">{title}</h2>
        <p className="hint" style={{ margin: 0 }}>
          開啟後會取代此裝置目前的設定。
        </p>
        <div className="acts2">
          <button className="btn" onClick={cancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            取代並開啟
          </button>
        </div>
      </section>
    </div>
  );
}

/** 個人分享連結：當作同伴加入／取代我的設定／取消 */
function PersonalDialog({ decoded }: { decoded: DecodedShare }) {
  const { user } = useStore();
  const [stage, setStage] = useState<Stage>("choose");
  const [selfName, setSelfName] = useState(DEFAULT_SELF);
  const [partnerName, setPartnerName] = useState(decoded.senderName ?? DEFAULT_PARTNER);
  const { state } = decoded;

  const partnerOf = (name: string): PartnerData => ({
    display_name: name,
    daily_limit: state.daily_limit,
    film_preferences: state.film_preferences,
    unavailable_slots: state.unavailable_slots,
  });
  const finish = () => window.location.replace("#/itinerary");

  const replaceMine = () => {
    replaceUser({ ...state, self_name: null, partner: null });
    window.location.replace("#/tickets");
  };
  const join = () => setStage(user.partner ? "replace" : "name");
  const confirmName = () => {
    setPartner(partnerOf(partnerName.trim() || DEFAULT_PARTNER), selfName.trim() || DEFAULT_SELF);
    finish();
  };
  const confirmReplace = () => {
    setPartner(partnerOf(decoded.senderName ?? DEFAULT_PARTNER), user.self_name || DEFAULT_SELF);
    finish();
  };

  if (stage === "name") {
    return (
      <div className="backdrop">
        <section className="dlg" role="dialog" aria-modal="true" aria-labelledby="name-title" data-testid="name-dialog">
          <h2 id="name-title">兩人的名稱</h2>
          <label className="field">
            <span>自己名稱</span>
            <input className="input" value={selfName} onChange={(e) => setSelfName(e.target.value)} />
          </label>
          <label className="field">
            <span>同伴名稱</span>
            <input className="input" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
          </label>
          <div className="acts2">
            <button className="btn" onClick={cancel}>
              取消
            </button>
            <button className="btn btn-primary" onClick={confirmName}>
              確認
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (stage === "replace") {
    return (
      <div className="backdrop">
        <section className="dlg" role="dialog" aria-modal="true" aria-labelledby="replace-title" data-testid="replace-partner-dialog">
          <h2 id="replace-title">要用這份取代目前的同伴嗎？</h2>
          <p className="hint" style={{ margin: 0 }}>
            目前的同伴「{user.partner?.display_name}」的資料會被換掉，你自己的設定不變。
          </p>
          <div className="acts2">
            <button className="btn" onClick={cancel}>
              取消
            </button>
            <button className="btn btn-primary" onClick={confirmReplace}>
              確認
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="backdrop">
      <section className="dlg" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">{decoded.senderName ? `這是「${decoded.senderName}」的選片。` : "這是同伴的選片。"}</h2>
        <p className="hint" style={{ margin: 0 }}>
          這份設定包含 {state.film_preferences.length} 部片的標記、不可看時段與搶票順序。要用這份設定取代此裝置的設定嗎？也可以改成當作同伴加入，不動你自己的設定。
        </p>
        <div className="acts2 acts3">
          <button className="btn btn-primary" onClick={join}>
            當作同伴加入
          </button>
          <button className="btn" onClick={replaceMine}>
            取代我的設定
          </button>
          <button className="btn" onClick={cancel}>
            取消
          </button>
        </div>
      </section>
    </div>
  );
}
