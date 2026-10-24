import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const bdd = (iface: "planner" | "scraper" | "web") =>
  defineBddConfig({
    outputDir: `.features-gen/${iface}`,
    features: `specs/truth/features/${iface}/**/*.feature`,
    steps: [`tests/steps/${iface}/**/*.ts`, "tests/support/**/*.ts"],
  });

const webTestDir = bdd("web");

export default defineConfig({
  reporter: "list",
  projects: [
    // 排程規則：step 直接呼叫 src/domain，不開瀏覽器
    { name: "planner", testDir: bdd("planner") },
    // 抓資料腳本：step 解析已存 HTML 樣本，不開瀏覽器
    { name: "scraper", testDir: bdd("scraper") },
    {
      name: "web-desktop",
      testDir: webTestDir,
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "web-mobile",
      testDir: webTestDir,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        baseURL: BASE_URL,
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
