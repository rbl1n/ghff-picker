import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// 建置版本編號：時間戳記（單調遞增），可用環境變數 BUILD_ID 指定（必須是數字）
const BUILD_ID = process.env.BUILD_ID && /^\d+$/.test(process.env.BUILD_ID) ? process.env.BUILD_ID : String(Date.now());

/** 輸出 version.json 到 dist 根目錄（部署後位於網站 base 底下），供執行中的分頁偵測新部署 */
function versionJson(): Plugin {
  return {
    name: "ghff-version-json",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ build_id: BUILD_ID, build_number: Number(BUILD_ID) }) + "\n",
      });
    },
  };
}

// GitHub Pages 子路徑以環境變數 BASE_PATH 設定，例如 BASE_PATH=/ghff-picker/
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionJson()],
});
