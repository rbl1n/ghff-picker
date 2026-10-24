import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { loadCatalog } from "./ui/store";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(<App />);
// 場次快照在入口模組就開始載入（不等畫面掛載），並讓頁面的 load 事件等到快照到手後才觸發
await loadCatalog();
