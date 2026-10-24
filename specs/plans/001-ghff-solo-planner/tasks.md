# Tasks: 金馬影展個人選片排程與搶票清單

**Plan Package**: `specs/plans/001-ghff-solo-planner`
**Core Inputs**: `spec.md`, `plan.md`, `research.md`, `truth-delta.md`, `specs/truth/techstack.md`, `specs/truth/data/**`, `specs/truth/features/scraper/**`, `specs/truth/features/planner/**`, `specs/truth/features/web/**`, `ui/**`

## Task Binding Contract

- 每個**開發任務**都必須對應 `truth-delta.md` 中的 ADD / MODIFY / DELETE / NOOP 語意；本輪全部為 ADD（起始專案）。
- Phase 1 `Setup` 只做本輪新增技術的基礎建設、技術環境與最後的 smoke-test；不寫 DSL 語意、不寫產品行為。
- Phase 2 `Foundational` 只建立後續實作程式、測試共用元件、入口、fixture、helper 與落點骨架。
- Phase 3 `Test Alignment & Implementation` 的目的：在寫產品碼之前，先把本輪所有 DSL 的自動化測試對齊最新版 truth。
- Truth 參照必須使用 `specs/truth/**` 路徑；plan 參照才使用當前 plan package 內相對路徑。
- Feature `Shared Must Read` 除 feature、同模組 DSL、對應 `truth-delta` 列外，還必須列入回追到的 planner 產物。
- 執行模型：所有實作與測試任務一律派給 `model: sonnet` 的 subagent；主 session 只做協調與 review。

## Phase 1: Setup

**Goal**: 起始專案，新增全部技術：Vite + React + TypeScript 前端、tsx + cheerio 抓資料腳本、lz-string + QR 產生器、playwright-bdd 單一 BDD runner。最後用 smoke-test 確認 runner 能跑到 planner、scraper、web 三種 project。不寫 DSL 語意，不寫產品行為。

- [x] T001 初始化 Node 專案與前端建置
  - Read:
    - `specs/truth/techstack.md` -> 前端
    - `plan.md` -> 原始碼結構
  - `package.json`（type module、Node 20+）、TypeScript strict、Vite + React（`@vitejs/plugin-react`）、`src/main.tsx` 空殼、`.gitignore`。
  - `vite.config.ts` 的 `base` 預留給 GitHub Pages 子路徑（以環境變數設定）。

- [x] T002 加入抓資料與跨裝置相關套件
  - Read:
    - `specs/truth/techstack.md` -> 資料與媒體處理、前端
  - 加入 `tsx`、`cheerio`（devDependencies）、`lz-string`、`qrcode`（含型別）。
  - `package.json` script：`scrape` = `tsx scripts/scrape/scrape.ts`。

- [x] T003 設定 playwright-bdd 與四個 Playwright project
  - Read:
    - `specs/truth/techstack.md` -> 測試與驗證
    - `research.md` -> 決策 7
  - 加入 `@playwright/test`、`playwright-bdd`；`playwright.config.ts` 以 `defineBddConfig` 指向 `specs/truth/features/<介面>/**/*.feature` 與 `tests/steps/<介面>/**/*.ts`。
  - project：`planner`、`scraper`（不開瀏覽器）、`web-desktop`（Desktop Chrome）、`web-mobile`（390×844 手機 viewport）；web project 以 `webServer` 啟動 `vite preview`。
  - scripts：`test` = `bddgen && playwright test`。

- [x] T004 smoke-test 確認 runner 能跑到三個介面
  - Read:
    - `specs/truth/techstack.md` -> 測試與驗證
  - 暫放一份 smoke feature（不在 `specs/truth/**`），planner／scraper／web 各一個空 step，確認 `bddgen` 與 `playwright test` 都跑得到，web project 能開啟 Vite 首頁。完成即刪除 smoke feature。
  - 不跑本輪 Feature，不寫 stepdef 語意。

## Phase 2: Foundational

**Goal**: 只建立後續實作程式、測試共用元件、入口、fixture、helper 與落點骨架，讓 Phase 3 不各自發明資料格式與測試世界。語意對齊不放這裡。

- [x] T005 建立 domain 型別與模組殼
  - Read:
    - `specs/truth/data/data-model.dbml`
    - `plan.md` -> 原始碼結構 `src/domain/`
  - 只做：`src/domain/types.ts` 依 data-model 定義 Film、Session、Venue、Cinema、SessionMark、Tier、UserState、TicketResult、ItineraryEntry、UnscheduledMustFilm、TicketListItem；`time.ts`、`availability.ts`、`compat.ts`、`schedule.ts`、`tickets.ts` 匯出函式簽章，函式體先 `throw new Error("not implemented")`。
  - 不做：不寫任何排程、相容、順序邏輯。

- [x] T006 建立 state 模組殼
  - Read:
    - `specs/truth/data/data-model.dbml` -> user_state
    - `research.md` -> 決策 5
  - 只做：`src/state/storage.ts`（load/save/clear 簽章、schema_version 常數）、`src/state/share.ts`（encode/decode/qr 簽章）。
  - 不做：不寫實際編碼、localStorage 存取或版本遷移。

- [x] T007 建立 scraper 模組殼與 HTML 樣本落點
  - Read:
    - `research.md` -> 決策 2、官網勘查
    - `plan.md` -> `scripts/scrape/`
  - 只做：`scripts/scrape/parse.ts`（`parseSchedulePage(html, date)` 簽章）、`scripts/scrape/scrape.ts`（逐日抓取殼）、`scripts/scrape/fixtures/` 目錄；存一份 2026-11-06 官網場次頁原始 HTML 當樣本。
  - 不做：不寫解析邏輯。

- [x] T008 建立 planner 與 scraper 測試 world 與 fixture
  - Read:
    - `specs/truth/features/planner/dsl.md`
    - `specs/truth/features/scraper/場次解析/dsl.md`
  - 只做：`tests/support/planner-world.ts`（場次快照、使用者狀態、最後一次排程結果、耗時的容器；影廳 → 影城對照 helper：含「信義威秀」→ xinyi_vieshow，「TITAN」或含「松仁威秀」→ songren_muvie，其他 → unknown）；`tests/support/scraper-world.ts`（HTML 樣本載入 helper）；`tests/support/tables.ts`（日期、HH:MM、標記符號 ⇄ enum 轉換）。
  - 不做：不寫各句 StepDef 語意。

- [x] T009 建立 web 測試 fixture 與畫面殼
  - Read:
    - `specs/truth/features/web/dsl.md`
    - `ui/ui-plan.md` -> 畫面與流程、前端實作切分建議
  - 只做：`tests/support/web-fixtures.ts`（以測試用場次快照取代 `/data/sessions.json` 的路由攔截、預載 localStorage 使用者狀態、讀取目前 localStorage 的 helper、第二個 browser context 代表「另一台裝置」）；`src/ui/` 下 App 與 5 個頁面元件空殼與底部分頁路由；畫面可空白。
  - 不做：不寫任何畫面行為與樣式，不寫 StepDef 語意。

- [x] T010 預留 stepdef 落點
  - Read:
    - `plan.md` -> `tests/steps/`
  - 只做：為每個介面根與模組建立空的 `tests/steps/<介面>/shared.steps.ts` 與 `tests/steps/<介面>/<模組>.steps.ts`（共 15 個檔）。
  - 不做：不寫 ALIGN / REMOVE / RED 語意。

## Phase 3: Test Alignment & Implementation

**Goal**: 把本輪 Feature 用到的 DSL 自動化測試對齊最新版 truth。本輪為起始專案，全部 DSL 句皆為 ADD → `[BDD-RED]`。不寫產品行為。

**DSL 參照**:
- 每一句只屬於一個權威 `dsl.md`：同模組 `specs/truth/features/{介面}/{模組}/dsl.md`，或介面根 `specs/truth/features/{介面}/dsl.md`。不得掃其他模組。
- 讀法：用 task title 的句型對到該檔那一列，以 `StepDef 實作語意` 當作測試程式碼語意。Given / When 讀 `怎麼做`、`權威狀態落地`、`回寫`（web 讀 `使用 fixture`、`頁面操作`、`等待條件`、`回寫資料`）；Then 讀 `必查`（`呈現結果`、`權威狀態`、`再讀確認`、`不該發生`）。
- `truth-delta.md` 只告訴這句是 ADD。語意以 `dsl.md` 那一列為準，不得用 feature 措辭自行發明。

**Markers**:
- `[BDD-RED]`：`ADD`。依 `dsl.md` 該列寫出 stepdef。完成時這句可被跑到，失敗只能是 assertion 或產品行為（例如 domain 殼丟出 not implemented），不能是 undefined step。
- 本輪沒有 `[BDD-ALIGN]`、`[BDD-REMOVE]`。只動測試層，不寫產品碼。

**Shared Must Read**:
- `specs/truth/features/scraper/場次解析/dsl.md` -> 全部列
- `specs/truth/features/planner/dsl.md` -> 全部列
- `specs/truth/features/planner/可看判定/dsl.md` -> 全部列
- `specs/truth/features/planner/轉場相容/dsl.md` -> 全部列
- `specs/truth/features/planner/最佳行程/dsl.md` -> 全部列
- `specs/truth/features/planner/未排入原因/dsl.md` -> 全部列
- `specs/truth/features/planner/搶票順序與備案/dsl.md` -> 全部列
- `specs/truth/features/planner/搶票切換/dsl.md` -> 全部列
- `specs/truth/features/web/dsl.md` -> 全部列
- `specs/truth/features/web/選片/dsl.md` -> 全部列
- `specs/truth/features/web/時段/dsl.md` -> 全部列
- `specs/truth/features/web/行程/dsl.md` -> 全部列
- `specs/truth/features/web/搶票/dsl.md` -> 全部列
- `specs/truth/features/web/分享與保存/dsl.md` -> 全部列
- `truth-delta.md` -> `/dsl-refine` 全部 ADD 列
- `tests/support/**`

**Boundary**:
- 一條 DSL 一個 task。
- 只改該句的 stepdef / assertion / 直接依賴的 helper；寫進 task 指定的 steps 檔。
- 不寫產品碼（`src/**`、`scripts/scrape/parse.ts` 的邏輯）。
- review 啟動 subagent；本輪所有 Test Scope 不得再有 undefined step，失敗只能是 assertion 或產品行為。有 issues 就修正再 review，直到沒有任何問題。通過前不解鎖 Phase 4。

**Parallel Hint**:
- T011–T138 依 steps 檔分組派給 sonnet subagent（同一 steps 檔的句由同一個 subagent 依序完成，避免同檔衝突）；T139 等全部回來再啟動 subagent 來 review。

#### scraper/場次解析 → `tests/steps/scraper/場次解析.steps.ts`

- [ ] T011 [P] [BDD-RED] `Given: 官網 "{日期}" 的場次頁含以下場次：`
- [ ] T012 [P] [BDD-RED] `When: 腳本解析該場次頁`
- [ ] T013 [P] [BDD-RED] `Then: 解析出的場次如下：`
- [ ] T014 [P] [BDD-RED] `Then: 解析出的場次所屬影城如下：`
- [ ] T015 [P] [BDD-RED] `Then: 解析出的場次標記如下：`
- [ ] T016 [P] [BDD-RED] `Then: 解析出的場次散場時間如下：`
- [ ] T017 [P] [BDD-RED] `Then: 解析結果共有 {影片數} 部影片`
- [ ] T018 [P] [BDD-RED] `Then: 影片 "{片名}" 有 {場次數} 個場次`
#### planner/（介面根） → `tests/steps/planner/shared.steps.ts`

- [ ] T019 [P] [BDD-RED] `Given: 影展場次表如下：`
- [ ] T020 [P] [BDD-RED] `Given: 觀眾的分層如下：`
- [ ] T021 [P] [BDD-RED] `Given: 觀眾已設定不可看時段如下：`
- [ ] T022 [P] [BDD-RED] `Given: 每日上限已設為 {上限} 部`
- [ ] T023 [P] [BDD-RED] `Given: 觀眾已執行排程並開啟搶票清單`
- [ ] T024 [P] [BDD-RED] `When: 觀眾執行排程`
- [ ] T025 [P] [BDD-RED] `Then: 行程中 "{片名}" 排在 "{場次}"`
#### planner/可看判定 → `tests/steps/planner/可看判定.steps.ts`

- [ ] T026 [P] [BDD-RED] `When: 觀眾查看場次可看狀態`
- [ ] T027 [P] [BDD-RED] `When: 觀眾把不可看時段 "{時段}" 一次套用到以下日期：`
- [ ] T028 [P] [BDD-RED] `Then: 場次可看狀態如下：`
- [ ] T029 [P] [BDD-RED] `Then: 不可看時段設定如下：`
#### planner/轉場相容 → `tests/steps/planner/轉場相容.steps.ts`

- [ ] T030 [P] [BDD-RED] `When: 系統判定以下場次是否相容：`
- [ ] T031 [P] [BDD-RED] `Then: 場次相容判定如下：`
#### planner/最佳行程 → `tests/steps/planner/最佳行程.steps.ts`

- [ ] T032 [P] [BDD-RED] `Given: 影展場次表為 {影片數} 部已分層影片、每部 {場次數} 個場次的壓力資料`
- [ ] T033 [P] [BDD-RED] `Then: 行程依日期排列如下：`
- [ ] T034 [P] [BDD-RED] `Then: 行程中 "{片名}" 標示 "{標示}"`
- [ ] T035 [P] [BDD-RED] `Then: 行程中 "{片名}" 只出現 {次數} 次`
- [ ] T036 [P] [BDD-RED] `Then: 行程中沒有 "{片名}"`
- [ ] T037 [P] [BDD-RED] `Then: 行程沒有任何場次`
- [ ] T038 [P] [BDD-RED] `Then: 行程的排程目標不劣於窮舉所有可行組合`
- [ ] T039 [P] [BDD-RED] `Then: 排程在 {秒} 秒內完成`
#### planner/未排入原因 → `tests/steps/planner/未排入原因.steps.ts`

- [ ] T040 [P] [BDD-RED] `Then: 未排入的必看片與原因如下：`
- [ ] T041 [P] [BDD-RED] `Then: 沒有未排入的必看片`
#### planner/搶票順序與備案 → `tests/steps/planner/搶票順序與備案.steps.ts`

- [ ] T042 [P] [BDD-RED] `When: 觀眾執行排程並開啟搶票清單`
- [ ] T043 [P] [BDD-RED] `When: 觀眾把 "{片名}" 手動移到第 {位置} 位`
- [ ] T044 [P] [BDD-RED] `Then: 搶票清單順序為 "{順序}"`
- [ ] T045 [P] [BDD-RED] `Then: 搶票清單的排定場次如下：`
- [ ] T046 [P] [BDD-RED] `Then: 搶票清單的備案場次如下：`
- [ ] T047 [P] [BDD-RED] `Then: "{片名}" 不在搶票清單`
#### planner/搶票切換 → `tests/steps/planner/搶票切換.steps.ts`

- [ ] T048 [P] [BDD-RED] `Given: 觀眾已把下列場次標記為搶到：`
- [ ] T049 [P] [BDD-RED] `Given: 觀眾已把下列場次標記為沒搶到：`
- [ ] T050 [P] [BDD-RED] `When: 觀眾把 "{片名}" 的 "{場次}" 場次標記為搶到`
- [ ] T051 [P] [BDD-RED] `When: 觀眾把 "{片名}" 的 "{場次}" 場次標記為沒搶到`
- [ ] T052 [P] [BDD-RED] `When: 觀眾撤銷 "{片名}" 的搶到標記`
- [ ] T053 [P] [BDD-RED] `When: 觀眾撤銷 "{片名}" 的沒搶到標記`
- [ ] T054 [P] [BDD-RED] `When: 觀眾重新排程`
- [ ] T055 [P] [BDD-RED] `Then: "{片名}" 的搶票狀態是 "{狀態}"`
- [ ] T056 [P] [BDD-RED] `Then: "{片名}" 立即改顯示 "{場次}"`
- [ ] T057 [P] [BDD-RED] `Then: "{片名}" 再次顯示 "{場次}"`
- [ ] T058 [P] [BDD-RED] `Then: "{片名}" 標示為已無可用場次`
- [ ] T059 [P] [BDD-RED] `Then: 行程中沒有 "{片名}" 的 "{場次}" 場次`
#### web/（介面根） → `tests/steps/web/shared.steps.ts`

- [ ] T060 [P] [BDD-RED] `Given: 場次快照包含以下場次：`
- [ ] T061 [P] [BDD-RED] `Given: 觀眾已標記影片層級如下：`
- [ ] T062 [P] [BDD-RED] `Given: 觀眾已設定不可看時段如下：`
- [ ] T063 [P] [BDD-RED] `Given: 觀眾已設定每日上限為 {上限} 部`
- [ ] T064 [P] [BDD-RED] `Given: 觀眾已排好行程並開啟搶票清單`
- [ ] T065 [P] [BDD-RED] `Given: 觀眾已把下列場次標記為搶到：`
- [ ] T066 [P] [BDD-RED] `Then: 畫面顯示錯誤 "{錯誤}"`
- [ ] T067 [P] [BDD-RED] `Then: 畫面不需左右捲動即可讀完每筆影片、場次與備案`
- [ ] T068 [P] [BDD-RED] `Then: "{片名}" 顯示熱門標示`
- [ ] T069 [P] [BDD-RED] `Then: 時段頁顯示不可看時段如下：`
- [ ] T070 [P] [BDD-RED] `Then: 時段頁顯示每日上限為 "{上限}"`
- [ ] T071 [P] [BDD-RED] `Then: 搶票清單順序為 "{順序}"`
- [ ] T072 [P] [BDD-RED] `Then: "{片名}" 顯示為已搶到並移到已完成區`
- [ ] T073 [P] [BDD-RED] `Then: 行程頁依日期顯示以下場次：`
#### web/選片 → `tests/steps/web/選片.steps.ts`

- [ ] T074 [P] [BDD-RED] `Given: 場次資料無法載入`
- [ ] T075 [P] [BDD-RED] `When: 觀眾把 "{片名}" 標為 "{層級}"`
- [ ] T076 [P] [BDD-RED] `When: 觀眾在選片頁展開 "{片名}"`
- [ ] T077 [P] [BDD-RED] `When: 觀眾查看標記說明`
- [ ] T078 [P] [BDD-RED] `When: 觀眾開啟工具`
- [ ] T079 [P] [BDD-RED] `When: 觀眾取消 "{片名}" 的標記`
- [ ] T080 [P] [BDD-RED] `When: 觀眾把 "{片名}" 標為熱門`
- [ ] T081 [P] [BDD-RED] `Then: 選片頁顯示 "{片名}" 的場次如下：`
- [ ] T082 [P] [BDD-RED] `Then: 畫面顯示標記說明如下：`
- [ ] T083 [P] [BDD-RED] `Then: "{片名}" 的層級顯示為 "{層級}"`
- [ ] T084 [P] [BDD-RED] `Then: 選片頁頁首計數如下：`
- [ ] T085 [P] [BDD-RED] `Then: 畫面提供重試按鈕`
#### web/時段 → `tests/steps/web/時段.steps.ts`

- [ ] T086 [P] [BDD-RED] `When: 觀眾在時段頁對 "{日期}" 輸入不可看時段 "{時段}"`
- [ ] T087 [P] [BDD-RED] `When: 觀眾在時段頁選取以下日期並套用不可看時段 "{時段}"：`
- [ ] T088 [P] [BDD-RED] `When: 觀眾在時段頁把 "{日期}" 整天設為不可看`
- [ ] T089 [P] [BDD-RED] `When: 觀眾在時段頁刪除 "{日期}" 的不可看時段`
- [ ] T090 [P] [BDD-RED] `When: 觀眾在時段頁輸入每日上限 "{上限}"`
- [ ] T091 [P] [BDD-RED] `When: 觀眾在時段頁清空每日上限`
- [ ] T092 [P] [BDD-RED] `When: 觀眾開啟選片頁查看各片場次`
- [ ] T093 [P] [BDD-RED] `Then: 套用按鈕停用`
- [ ] T094 [P] [BDD-RED] `Then: 時段頁沒有任何不可看時段`
- [ ] T095 [P] [BDD-RED] `Then: 時段頁每日上限欄位顯示輸入錯誤`
- [ ] T096 [P] [BDD-RED] `Then: 選片頁的場次可看狀態如下：`
#### web/行程 → `tests/steps/web/行程.steps.ts`

- [ ] T097 [P] [BDD-RED] `Given: 觀眾已排好行程，之後又把 "{片名}" 標為 "{層級}"`
- [ ] T098 [P] [BDD-RED] `When: 觀眾按下排行程`
- [ ] T099 [P] [BDD-RED] `When: 觀眾開啟行程頁`
- [ ] T100 [P] [BDD-RED] `When: 觀眾按下重新排程`
- [ ] T101 [P] [BDD-RED] `Then: 行程頁摘要顯示如下：`
- [ ] T102 [P] [BDD-RED] `Then: 行程頁頂部紅框顯示 "{訊息}"`
- [ ] T103 [P] [BDD-RED] `Then: 行程頁列出未排入的必看片與原因如下：`
- [ ] T104 [P] [BDD-RED] `Then: 行程頁在 "{片名}" 標示 "{標示}"`
- [ ] T105 [P] [BDD-RED] `Then: 行程頁沒有 "{片名}"`
- [ ] T106 [P] [BDD-RED] `Then: 行程頁顯示提示 "{提示}"`
#### web/搶票 → `tests/steps/web/搶票.steps.ts`

- [ ] T107 [P] [BDD-RED] `Given: 觀眾已把下列場次標記為沒搶到：`
- [ ] T108 [P] [BDD-RED] `Given: 觀眾使用手機尺寸的瀏覽器`
- [ ] T109 [P] [BDD-RED] `When: 觀眾排好行程並開啟搶票清單`
- [ ] T110 [P] [BDD-RED] `When: 觀眾把 "{片名}" 移到搶票清單第 {位置} 位`
- [ ] T111 [P] [BDD-RED] `When: 觀眾在搶票清單按下 "{片名}" 的「搶到」`
- [ ] T112 [P] [BDD-RED] `When: 觀眾在搶票清單按下 "{片名}" 的「沒搶到」`
- [ ] T113 [P] [BDD-RED] `When: 觀眾在搶票清單按下 "{片名}" 的「撤銷」`
- [ ] T114 [P] [BDD-RED] `When: 觀眾查看搶票清單頂部摘要`
- [ ] T115 [P] [BDD-RED] `When: 觀眾按下「依搶到結果重新排程」`
- [ ] T116 [P] [BDD-RED] `Then: 搶票清單順序與排定場次如下：`
- [ ] T117 [P] [BDD-RED] `Then: 搶票清單備案場次如下：`
- [ ] T118 [P] [BDD-RED] `Then: 搶票清單沒有 "{片名}"`
- [ ] T119 [P] [BDD-RED] `Then: "{片名}" 立即改顯示 "{場次}"`
- [ ] T120 [P] [BDD-RED] `Then: "{片名}" 再次顯示 "{場次}"`
- [ ] T121 [P] [BDD-RED] `Then: "{片名}" 該列顯示 "{訊息}"`
- [ ] T122 [P] [BDD-RED] `Then: 換備案在 {秒} 秒內完成`
- [ ] T123 [P] [BDD-RED] `Then: 搶票清單頂部顯示 "{摘要}"`
- [ ] T124 [P] [BDD-RED] `Then: 行程頁中 "{片名}" 排在 "{場次}"`
#### web/分享與保存 → `tests/steps/web/分享與保存.steps.ts`

- [ ] T125 [P] [BDD-RED] `Given: 觀眾已排好行程`
- [ ] T126 [P] [BDD-RED] `Given: 觀眾已把搶票清單順序手動調整為 "{順序}"`
- [ ] T127 [P] [BDD-RED] `Given: 電腦上已產生分享連結`
- [ ] T128 [P] [BDD-RED] `Given: 手機已用分享連結匯入設定`
- [ ] T129 [P] [BDD-RED] `Given: 分享連結內容已損毀`
- [ ] T130 [P] [BDD-RED] `When: 觀眾關閉工具後重新開啟`
- [ ] T131 [P] [BDD-RED] `When: 觀眾在手機上關閉工具後重新開啟`
- [ ] T132 [P] [BDD-RED] `When: 觀眾在電腦上開啟分享畫面`
- [ ] T133 [P] [BDD-RED] `When: 觀眾用手機開啟該分享連結`
- [ ] T134 [P] [BDD-RED] `When: 觀眾用手機開啟該分享連結並確認取代`
- [ ] T135 [P] [BDD-RED] `Then: 選片頁顯示影片層級如下：`
- [ ] T136 [P] [BDD-RED] `Then: 分享畫面顯示 QR code 與「複製連結」`
- [ ] T137 [P] [BDD-RED] `Then: 手機畫面顯示確認 "{確認}"`
- [ ] T138 [P] [BDD-RED] `Then: 手機的搶票清單與電腦完全相同（順序、排定場次、備案場次）`

- [ ] T139 subagent review (phase quality gate)

## Phase 4A: ADD Feature File - scraper/場次解析/官網場次頁解析.feature

**Goal**: 以最小解析邏輯讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/scraper/場次解析/官網場次頁解析.feature` -> `Feature: 官網場次頁解析`
- `specs/truth/features/scraper/場次解析/dsl.md` -> 本檔 Given／When／Then 全部列
- `truth-delta.md` -> `/dsl-refine` ADD `scraper/場次解析`
- `specs/truth/data/data-model.dbml` -> catalog、films、venues、sessions、cinema、session_mark
- `research.md` -> 決策 2、官網勘查

**Boundary**:
- 只讓此 Test Scope 全綠；只改 `scripts/scrape/**`。

**Test Scope**:
- `specs/truth/features/scraper/場次解析/官網場次頁解析.feature`（project：scraper）

- [ ] T140 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T141 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4A2: 產生場次快照

**Goal**: scraper 全綠後，實際抓取官網產出 `public/data/sessions.json`，供網頁使用。

**Read**:
- `research.md` -> 官網勘查（未驗證項：◆ 原文、跨午夜、11/07～11/09）
- `specs/truth/data/data-model.dbml` -> catalog

**Boundary**:
- 不改 truth；遇到未驗證項與樣本不符時，回報差異並補 HTML 樣本，不自行改 feature。

- [ ] T142 執行 `npm run scrape` 產出快照，回報場次數、影片數、影廳→影城對照、各標記數量，並人工抽樣 20 筆與官網比對（SC-007）

## Phase 4B: ADD Feature File - planner/可看判定/場次可看判定.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/可看判定/場次可看判定.feature` -> `Feature: 場次可看判定`
- `specs/truth/features/planner/可看判定/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/可看判定`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/可看判定/場次可看判定.feature`（project：planner）

- [ ] T143 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T144 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4C: ADD Feature File - planner/轉場相容/轉場緩衝與相容判定.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/轉場相容/轉場緩衝與相容判定.feature` -> `Feature: 轉場緩衝與相容判定`
- `specs/truth/features/planner/轉場相容/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/轉場相容`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/轉場相容/轉場緩衝與相容判定.feature`（project：planner）

- [ ] T145 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T146 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4D: ADD Feature File - planner/最佳行程/行程不衝堂與排列.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/行程不衝堂與排列.feature` -> `Feature: 行程不衝堂與排列`
- `specs/truth/features/planner/最佳行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/最佳行程`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/行程不衝堂與排列.feature`（project：planner）

- [ ] T147 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T148 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4E: ADD Feature File - planner/最佳行程/行程範圍.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/行程範圍.feature` -> `Feature: 行程範圍`
- `specs/truth/features/planner/最佳行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/最佳行程`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/行程範圍.feature`（project：planner）

- [ ] T149 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T150 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4F: ADD Feature File - planner/最佳行程/排程目標優先序.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> `Feature: 排程目標優先序`
- `specs/truth/features/planner/最佳行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/最佳行程`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/排程目標優先序.feature`（project：planner）

- [ ] T151 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T152 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4G: ADD Feature File - planner/最佳行程/每日上限.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/每日上限.feature` -> `Feature: 每日上限`
- `specs/truth/features/planner/最佳行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/最佳行程`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/每日上限.feature`（project：planner）

- [ ] T153 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T154 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4H: ADD Feature File - planner/最佳行程/最佳性與可重現.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/最佳性與可重現.feature` -> `Feature: 最佳性與可重現`
- `specs/truth/features/planner/最佳行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/最佳行程`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/最佳性與可重現.feature`（project：planner）

- [ ] T155 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T156 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4I: ADD Feature File - planner/未排入原因/未排入必看片原因.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/未排入原因/未排入必看片原因.feature` -> `Feature: 未排入必看片原因`
- `specs/truth/features/planner/未排入原因/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/未排入原因`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/未排入原因/未排入必看片原因.feature`（project：planner）

- [ ] T157 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T158 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4J: ADD Feature File - planner/搶票順序與備案/搶票順序.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/搶票順序與備案/搶票順序.feature` -> `Feature: 搶票順序`
- `specs/truth/features/planner/搶票順序與備案/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/搶票順序與備案`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/搶票順序與備案/搶票順序.feature`（project：planner）

- [ ] T159 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T160 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4K: ADD Feature File - planner/搶票順序與備案/備案場次.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/搶票順序與備案/備案場次.feature` -> `Feature: 備案場次`
- `specs/truth/features/planner/搶票順序與備案/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/搶票順序與備案`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/搶票順序與備案/備案場次.feature`（project：planner）

- [ ] T161 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T162 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4L: ADD Feature File - planner/搶票切換/標記搶到與沒搶到.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/搶票切換/標記搶到與沒搶到.feature` -> `Feature: 標記搶到與沒搶到`
- `specs/truth/features/planner/搶票切換/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/搶票切換`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/搶票切換/標記搶到與沒搶到.feature`（project：planner）

- [ ] T163 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T164 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4M: ADD Feature File - planner/搶票切換/重新排程保留搶到結果.feature

**Goal**: 以最小排程引擎邏輯（`src/domain/`）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/搶票切換/重新排程保留搶到結果.feature` -> `Feature: 重新排程保留搶到結果`
- `specs/truth/features/planner/搶票切換/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/planner/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `planner/搶票切換`
- `specs/truth/data/data-model.dbml` -> sessions、user_state、衍生結果表
- `research.md` -> 決策 4（排程演算法）、決策 6（時間處理）

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出必須可重現（同輸入同輸出）。

**Test Scope**:
- `specs/truth/features/planner/搶票切換/重新排程保留搶到結果.feature`（project：planner）

- [ ] T165 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T166 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4N: ADD Feature File - web/選片/選片頁瀏覽.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/選片/選片頁瀏覽.feature` -> `Feature: 選片頁瀏覽`
- `specs/truth/features/web/選片/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/選片`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「選片」畫面與流程
- `ui/index.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/選片/選片頁瀏覽.feature`（project：web-desktop、web-mobile）

- [ ] T167 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T168 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4O: ADD Feature File - web/選片/影片分層.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/選片/影片分層.feature` -> `Feature: 影片分層`
- `specs/truth/features/web/選片/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/選片`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「選片」畫面與流程
- `ui/index.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/選片/影片分層.feature`（project：web-desktop、web-mobile）

- [ ] T169 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T170 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4P: ADD Feature File - web/時段/不可看時段設定.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/時段/不可看時段設定.feature` -> `Feature: 不可看時段設定`
- `specs/truth/features/web/時段/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/時段`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「時段」畫面與流程
- `ui/availability.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/時段/不可看時段設定.feature`（project：web-desktop、web-mobile）

- [ ] T171 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T172 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4Q: ADD Feature File - web/時段/不可看場次標示.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/時段/不可看場次標示.feature` -> `Feature: 不可看場次標示`
- `specs/truth/features/web/時段/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/時段`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「時段」畫面與流程
- `ui/availability.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/時段/不可看場次標示.feature`（project：web-desktop、web-mobile）

- [ ] T173 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T174 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4R: ADD Feature File - web/行程/行程呈現.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/行程/行程呈現.feature` -> `Feature: 行程呈現`
- `specs/truth/features/web/行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/行程`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程
- `ui/itinerary.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/行程/行程呈現.feature`（project：web-desktop、web-mobile）

- [ ] T175 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T176 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4S: ADD Feature File - web/行程/未排入必看片.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/行程/未排入必看片.feature` -> `Feature: 未排入必看片`
- `specs/truth/features/web/行程/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/行程`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程
- `ui/itinerary.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/行程/未排入必看片.feature`（project：web-desktop、web-mobile）

- [ ] T177 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T178 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4T: ADD Feature File - web/搶票/搶票清單呈現.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/搶票/搶票清單呈現.feature` -> `Feature: 搶票清單呈現`
- `specs/truth/features/web/搶票/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/搶票`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「搶票」畫面與流程
- `ui/tickets.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/搶票/搶票清單呈現.feature`（project：web-desktop、web-mobile）

- [ ] T179 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T180 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4U: ADD Feature File - web/搶票/搶票標記與切換備案.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/搶票/搶票標記與切換備案.feature` -> `Feature: 搶票標記與切換備案`
- `specs/truth/features/web/搶票/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/搶票`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「搶票」畫面與流程
- `ui/tickets.html` -> 雛形全文

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/搶票/搶票標記與切換備案.feature`（project：web-desktop、web-mobile）

- [ ] T181 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T182 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4V: ADD Feature File - web/分享與保存/設定保存.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/設定保存.feature` -> `Feature: 設定保存`
- `specs/truth/features/web/分享與保存/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/分享與保存`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程
- `ui/share.html` -> 雛形全文
- `research.md` -> 決策 5（保存與跨裝置）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/分享與保存/設定保存.feature`（project：web-desktop、web-mobile）

- [ ] T183 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T184 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4W: ADD Feature File - web/分享與保存/跨裝置分享.feature

**Goal**: 以最小畫面行為讓此 feature file 全綠，畫面對齊雛形。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/跨裝置分享.feature` -> `Feature: 跨裝置分享`
- `specs/truth/features/web/分享與保存/dsl.md` -> 本檔 Given／When／Then 全部列
- `specs/truth/features/web/dsl.md` -> 本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/分享與保存`
- `specs/truth/data/data-model.dbml` -> user_state
- `ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程
- `ui/share.html` -> 雛形全文
- `research.md` -> 決策 5（保存與跨裝置）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須對齊該雛形。排程結果一律呼叫 `src/domain`，不得在畫面重寫排程邏輯。

**Test Scope**:
- `specs/truth/features/web/分享與保存/跨裝置分享.feature`（project：web-desktop、web-mobile）

- [ ] T185 [BDD-GREEN] 讓 Test Scope 全綠
- [ ] T186 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4Y: research quality gate

**Goal**: 產品對齊本輪回追到的 plan-side 產物 `research.md`。`Test Scope` 全綠不能代替本題。

**Read**:
- `research.md` -> 決策 1～7
- `scripts/scrape/`、`src/domain/`、`src/state/`、`playwright.config.ts`

**Boundary**:
- 不改 truth、不加 feature、不重跑 GREEN 當通過條件。

- [ ] T187 subagent review (research quality gate)

## Phase 4Z: ui quality gate

**Goal**: 產品對齊本輪回追到的 plan-side 產物 `ui/**`。`Test Scope` 全綠不能代替本題。

**Read**:
- `ui/ui-plan.md` -> 視覺方向、畫面與流程、驗證與錯誤回饋
- `ui/index.html`、`ui/availability.html`、`ui/itinerary.html`、`ui/tickets.html`、`ui/share.html`、`ui/styles.css`
- `src/ui/`

**Boundary**:
- 不改 truth、不加 feature、不重跑 GREEN 當通過條件。
- 已知雛形瑕疵不照抄：時間輸入用 24 小時制；無備案時顯示「無不衝堂備案」；標籤多時排序按鈕不換行。

- [ ] T188 subagent review (ui quality gate)
