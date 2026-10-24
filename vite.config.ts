import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 子路徑以環境變數 BASE_PATH 設定，例如 BASE_PATH=/ghff-picker/
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
});
