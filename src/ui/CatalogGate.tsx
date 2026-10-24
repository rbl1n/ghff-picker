import type { ReactNode } from "react";
import type { Catalog } from "../domain/types";
import { loadCatalog, useStore } from "./store";

/** 場次快照載入中／失敗時的畫面；載入成功才渲染內容 */
export function CatalogGate({ children }: { children: (catalog: Catalog) => ReactNode }) {
  const { catalog } = useStore();
  if (catalog.status === "loading") return <p className="empty">載入場次中…</p>;
  if (catalog.status === "error") {
    return (
      <div className="banner banner-error" data-testid="load-error">
        <h2>場次資料載入失敗，請重新整理</h2>
        <button className="btn" onClick={() => void loadCatalog()}>
          重試
        </button>
      </div>
    );
  }
  return <>{children(catalog.catalog)}</>;
}
