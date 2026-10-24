# Truth Delta: 001-ghff-solo-planner

**Plan Package**: `specs/plans/001-ghff-solo-planner`
**Truth Root**: `specs/truth`

> 由 `/specify` 初始化。本 plan 為從零建立，`specs/truth/**` 目前不存在；以下各段由對應 truth owner skill 填寫。

## /technical-research

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `specs/truth/techstack.md` | 系統端：純前端靜態網頁 + 一次性抓資料腳本，無後端 | CL-009；起始專案 |
| ADD | `specs/truth/techstack.md` | 前端：TypeScript、React、Vite、localStorage、網址 hash + QR 跨裝置、GitHub Pages 部署 | FR-018、FR-022、NFR-004、SC-001 |
| ADD | `specs/truth/techstack.md` | 資料：Node + tsx + cheerio 抓官網，JSON 快照，分鐘數時間表示 | FR-001、FR-003、CL-008、NFR-005 |
| ADD | `specs/truth/techstack.md` | 測試：playwright-bdd 單一 runner；流程 E2E（桌機／手機）、排程規則直呼模組、腳本解析樣本 | CL-010、CL-011 |
| ADD | `specs/truth/techstack.md` | 明確不引入：後端、帳號、雲端同步、ILP 求解器、時區函式庫 | CL-009；今日交付 |

## /api-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/contracts/**` | 本專案無後端 API，不建立 contract | CL-009 |

## /data-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `specs/truth/data/data-model.dbml` | 場次快照：catalog、films、venues、sessions；enum cinema（MUVIE = 松仁威秀）、session_mark（含優先特映場） | FR-001、FR-003、FR-010、CL-004、CL-008 |
| ADD | `specs/truth/data/data-model.dbml` | 使用者狀態：user_state、film_preferences（tier、is_hot）、unavailable_slots、ticket_marks；enum tier、ticket_result | FR-004、FR-005、FR-011、FR-015、FR-018、FR-019、FR-022 |
| ADD | `specs/truth/data/data-model.dbml` | 衍生結果（不保存）：itinerary_entries、unscheduled_must_films、ticket_list_items；enum unscheduled_reason | FR-008、FR-012～FR-017、FR-020、FR-021 |

## /dsl-refine

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `specs/truth/features/planner/dsl.md` | 排程引擎介面根共用 DSL：影展場次表、分層、不可看時段、每日上限、排程、行程場次等跨模組句型，及影廳對應影城／場次字串共通約定 | FR-006、FR-010、CL-011；acceptance 全部 planner 相關檔案 |
| ADD | `specs/truth/features/planner/可看判定/**（feature + dsl）` | 場次可看判定：無設定全可看、重疊即不可看、跨午夜、整天不可看、一次套用多日期 | FR-005～FR-007；acceptance/不可看時段排除場次.feature |
| ADD | `specs/truth/features/planner/轉場相容/**（feature + dsl）` | 轉場緩衝與相容判定：同影城 5、同廳相接 5、跨影城 15、TITAN＝松仁威秀、無法判定 15 | FR-009、FR-010、CL-004；acceptance/排出不衝堂的最佳行程.feature Rule 1 |
| ADD | `specs/truth/features/planner/最佳行程/**（feature + dsl）` | 最佳行程：不衝堂與排列、排程目標字典序（必看→想看→有空再看→★）、每部一場、未分層不排、每日上限（含 0 與不設）、非售票、窮舉比對最佳性、同分決勝、50 部 10 秒 | FR-008、FR-009、FR-011、FR-013、FR-014、NFR-001、SC-002、SC-003、SC-005；acceptance/排出不衝堂的最佳行程.feature、看場次表並把影片分成三層.feature（未分層不排） |
| ADD | `specs/truth/features/planner/未排入原因/**（feature + dsl）` | 未排入必看片原因：沒有可看場次、與哪些必看片衝堂、受每日上限限制、全排入時無清單 | FR-012、SC-004；acceptance/不可看時段排除場次.feature、排出不衝堂的最佳行程.feature Rule 2 |
| ADD | `specs/truth/features/planner/搶票順序與備案/**（feature + dsl）` | 搶票順序（層級→熱門→可看場次少→★→手動優先）、排定場次、⊚ 不進清單、備案（★ 先再時間、不衝堂、可看、每日上限、無備案標示） | FR-015～FR-017、SC-006；acceptance/搶票順序清單與備案場次.feature |
| ADD | `specs/truth/features/planner/搶票切換/**（feature + dsl）` | 搶票狀態切換：搶到鎖定、沒搶到換備案（只對 got 相容）、已無可用場次、撤銷、重新排程保留 got 並排除 missed | FR-019～FR-021、NFR-003；acceptance/搶票當下標記結果並切換備案.feature |
| ADD | `specs/truth/features/scraper/dsl.md` | 抓取介面根 DSL（目前無跨模組句型，僅記錄共通約定） | CL-009、research 決策 2 |
| ADD | `specs/truth/features/scraper/場次解析/**（feature + dsl）` | 官網場次頁解析：欄位、MUVIE→松仁威秀、影城無法判定、title 標記對應（含優先特映場）、多標記、無標記、散場與跨午夜、同片多場次 | FR-001、FR-003、SC-007、CL-004、CL-008；acceptance/看場次表並把影片分成三層.feature 場次表欄位與標記 |
| ADD | `specs/truth/features/web/dsl.md` | 網頁介面根共用 DSL：場次快照／分層／不可看時段／每日上限／已排好行程等 Arrange、跨模組 Then（錯誤提示、手機不需左右捲動、熱門標示、時段顯示、清單順序、已搶到、行程顯示） | NFR-002、NFR-004、FR-022；acceptance 全部 web 相關檔案 |
| ADD | `specs/truth/features/web/選片/**（feature + dsl）` | 選片頁：同片場次一起呈現、標記說明、載入失敗與重試、分層／改層／取消、頁首計數、熱門 | FR-002～FR-004、FR-015；acceptance/看場次表並把影片分成三層.feature；ui-plan 選片 |
| ADD | `specs/truth/features/web/時段/**（feature + dsl）` | 時段頁：結束需晚於開始（錯誤與按鈕停用）、多日期套用、整天不可看、刪除、每日上限驗證與清空、選片頁不可看標示 | FR-005～FR-007、FR-011；acceptance/不可看時段排除場次.feature；ui-plan 時段 |
| ADD | `specs/truth/features/web/行程/**（feature + dsl）` | 行程頁：依日期時間軸、摘要、非售票標籤、未標記不出現、空狀態、未排入紅框與原因、條件變更橫幅、重新排程 | FR-012～FR-014；acceptance/排出不衝堂的最佳行程.feature、不可看時段排除場次.feature；ui-plan 行程 |
| ADD | `specs/truth/features/web/搶票/**（feature + dsl）` | 搶票頁：清單順序與排定場次、備案、無不衝堂備案、⊚ 不列入、手動調整順序、手機不需左右捲動、搶到／沒搶到一次點擊換備案、已無可用場次、撤銷、摘要、依搶到結果重新排程 | FR-015～FR-021、NFR-002、NFR-003；acceptance/搶票順序清單與備案場次.feature、搶票當下標記結果並切換備案.feature |
| ADD | `specs/truth/features/web/分享與保存/**（feature + dsl）` | 設定保存（分層、熱門、時段、每日上限、手動順序、搶票標記、行程）與跨裝置分享（QR／連結、取代確認、手機清單相同、手機重開保留、連結損毀） | FR-018、FR-022、SC-001；acceptance/電腦排好用手機搶票.feature、看場次表並把影片分成三層.feature（重開保留） |
