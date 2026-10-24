# Phase 0 技術堆疊總結：金馬影展選片排程工具

## 系統端

- 前端：靜態單頁網頁（手機與電腦瀏覽器）
- 抓資料腳本：一次性執行，產出場次快照 JSON
- 後端：無

## 技術堆疊總覽

### 前端

| 類別 | 採用技術 | 用途 |
| --- | --- | --- |
| 語言 | TypeScript | 網頁與排程邏輯 |
| UI 框架 | React | 選片、時段、行程、搶票清單畫面 |
| 建置 | Vite | 開發伺服器與靜態建置 |
| 本機保存 | localStorage | 保存使用者偏好與搶票標記 |
| 跨裝置 | 網址 hash 壓縮（lz-string）+ QR code 產生器 | 電腦排好後帶到手機 |
| 部署 | GitHub Pages（不可用時改 Cloudflare Pages） | 免費靜態託管 |

### 資料與媒體處理

| 類別 | 採用技術 | 用途 |
| --- | --- | --- |
| 執行環境 | Node.js + TypeScript（tsx） | 執行抓資料腳本 |
| HTML 解析 | cheerio | 解析官網場次頁 |
| 資料格式 | JSON 快照（進版控） | 網頁唯一的場次資料來源 |
| 時間表示 | 日期 + 當日分鐘數（Asia/Taipei 牆上時間） | 衝堂與可看時段計算 |

### 測試與驗證

| 類別 | 採用技術 | 用途 |
| --- | --- | --- |
| BDD runner（全端共用） | playwright-bdd | 執行所有 Gherkin `.feature` |
| 前端網頁 BDD | playwright-bdd + Playwright（桌機、手機兩種 viewport） | 使用流程 E2E |
| 排程規則 BDD | playwright-bdd（step 直接呼叫排程模組，不開瀏覽器） | 衝堂、可看、排程目標、搶票順序、備案；窮舉驗證最佳性 |
| 抓資料腳本 BDD | playwright-bdd（step 解析已存 HTML 樣本） | 驗證欄位與標記解析 |

## 本次開發不引入的技術

- 後端 API 與資料庫
- 帳號與登入
- 雲端同步（Gist、Google Drive 等）
- 整數規劃求解器
- 時區函式庫（date-fns-tz 等）
