# Tasks: 兩人各自片單與一起看的排程

**Plan Package**: `specs/plans/003-ghff-duo-personal-lists`
**Core Inputs**: `spec.md`, `truth-delta.md`, `specs/truth/techstack.md`, `specs/truth/data/**`, `specs/truth/features/planner/**`, `specs/truth/features/web/**`, `features/acceptance/**`；plan-side 視覺基準沿用 `specs/plans/001-ghff-solo-planner/ui/ui-plan.md`（CL-203：本 plan 不做 `plan.md`、`research.md`、`ui/` 雛形）

## Task Binding Contract

- 每個**開發任務**都必須對應 `truth-delta.md` 中的 ADD / MODIFY / DELETE / NOOP 語意；本輪有 ADD、MODIFY、DELETE。
- 本輪沒有新增技術（`/technical-research` 為 NOOP）：**省略 Setup**。
- Phase 2 `Foundational` 只建立後續實作程式、測試共用元件、入口、fixture、helper 與落點骨架；只放型別、版本常數、函式簽章殼（`throw new Error("not implemented")`）與測試容器，不放行為。
- Phase 3 `Test Alignment & Implementation` 的目的：在寫產品碼之前，先把本輪所有新增／改動／刪除的 DSL 自動化測試對齊最新版 truth。每條 DSL 一個 task，標 `[BDD-RED]`（ADD）、`[BDD-ALIGN]`（MODIFY）、`[BDD-REMOVE]`（DELETE）。
- Phase 4 每個 ADD／MODIFY 的 truth feature file 一個 phase（`[BDD-GREEN]` → `[BDD-REFACTOR]`）；每個 DELETE 的 feature／DSL 一個 phase（`[CODE-REMOVE]` → `[REGRESSION]`）。DELETE phase 排在所有 ADD／MODIFY phase 之後，因為舊產品碼（`src/domain/merge.ts`、舊的單方統計與「買 2 張」）在新 phase 全綠、畫面不再使用之前不能先刪。
- Truth 參照必須使用 `specs/truth/**` 路徑；plan 參照才使用當前 plan package 內相對路徑（`spec.md`、`truth-delta.md`）。
- Feature `Shared Must Read` 除 feature、同模組 DSL、對應 `truth-delta` 列外，還必須列入回追到的 planner 產物。本 plan 沒有 `plan.md` 與 `ui/`：web feature 回追到的 plan-side 產物是 001 的 `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` 與對應畫面雛形（視覺方向，不是新雛形）；planner 介面（純邏輯）沒有 plan-side 產物，以 `specs/truth/data/data-model.dbml` 為 truth 約束。
- **執行模型：所有實作與測試任務（含 Foundational、Phase 3、Phase 4、Phase 5 與各 review）一律派給 `model: sonnet` 的 subagent；主 session 只做協調與 review。**
- 回歸底線（SC-305）：沒有同伴、沒有調整層內排序與小時格子時，001 的既有測試維持通過。唯一已核准的例外是 `truth-delta.md` 開頭說明的「★ 降為第 5 項」：依賴 ★ 決定同層衝堂勝負的 Example 已在 truth 中以調整分層列順序改寫（`/dsl-refine` MODIFY 列）。任何任務不得為了讓新 feature 通過而改動 truth 的 feature、DSL 或 Example；既有 stepdef 只有 Phase 3 點名的 `[BDD-ALIGN]`／`[BDD-REMOVE]` 可以動。
- 新增畫面定位點一律補在 `tests/support/UI-HOOKS.md`（Phase 3 的 web 任務負責），GREEN 階段 `src/ui/**` 必須提供。
- 保存格式：寫入一律 `schema_version = 3`，讀取接受 1、2、3（`specs/truth/data/data-model.dbml` -> `user_state` Note 的遷移規則）；高於 3 視為版本不符。

## Phase 1: Setup

（省略：本輪沒有新增技術，見 `truth-delta.md` `/technical-research` NOOP。）

## Phase 2: Foundational

**Goal**: 只建立兩人各自片單、有空時段、層內排序所需的型別、版本常數、函式簽章殼、測試世界容器與 fixture helper，讓 Phase 3 不各自發明資料格式。不放任何行為；Phase 3 之前專案必須仍可編譯、001／002 既有測試行為不變。

- [x] T001 擴充 domain 型別（有空時段、層內名次、參與者）
  - Read:
    - `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、unscheduled_must_films、ticket_list_items
    - `truth-delta.md` -> `/data-plan` 全部列
    - `src/domain/types.ts`
  - 只做：`src/domain/types.ts` 新增 `AvailableInterval`、`DayAvailability`（日期 + 區間；沒有列 = 全天有空）、`ItineraryParticipant`（`self` | `partner` | `together`）、`PersonSide`（`self` | `partner`）、`DuoItineraryEntry`；`FilmPreference` 加選配 `tier_rank`；`UserState` 與 `PartnerData` 加選配 `availability`；`ItineraryEntry` 加選配 `participant`、`partner_tier`；`UnscheduledMustFilm` 加選配 `owner`；`TicketListItem.ticket_quantity` 註解改為「一起 2、自己 1、個人 null」。
  - 不做：不刪除 `UnavailableSlot`、`UserState.unavailable_slots`、`MergedView`、`SingleSideCounts`（留給 Phase 4 的 `[CODE-REMOVE]`，以免 Phase 3 前無法編譯）；不改任何既有函式簽章與行為。

- [x] T002 加入有空時段、層內排序與 v3 遷移的函式簽章殼
  - Read:
    - `specs/truth/data/data-model.dbml` -> user_state Note（遷移規則）、day_availability、available_intervals、film_preferences.tier_rank
    - `specs/truth/features/planner/dsl.md` -> 介面共通約定（層內排序、有空時段）
    - `src/domain/availability.ts`、`src/state/storage.ts`
  - 只做：新增 `src/domain/availability.ts` 的函式簽章殼：`subtractInterval`、`normalizeDay`、`hourCellState`、`toggleHour`、`isSessionAvailable`（皆先 `throw new Error("not implemented")`；既有 `isSessionWatchable`、`applySlotToDates` 原樣保留）；新增 `src/domain/order.ts` 殼：`appendToTier`、`moveWithinTier`、`initTierRanks`；新增 `src/state/migrate.ts` 殼：`migrateToV3(state)`；`src/state/storage.ts` 另外匯出常數 `SCHEMA_VERSION_V3 = 3`（只是常數，`SCHEMA_VERSION` 與寫入、驗證行為不變）。
  - 不做：不寫任何遷移、扣除、排序邏輯；不改 `loadState`／`saveState` 的版本行為與驗證；不改 `isSessionWatchable`。

- [x] T003 加入兩人各自排程的函式簽章殼
  - Read:
    - `specs/truth/features/planner/兩人合併/dsl.md` -> 兩人排程定義
    - `specs/truth/data/data-model.dbml` -> itinerary_entries、unscheduled_must_films、ticket_list_items
    - `src/domain/schedule.ts`、`src/domain/tickets.ts`、`src/domain/merge.ts`
  - 只做：新增 `src/domain/duo.ts`：匯出 `scheduleDuo(catalog, self, partner)`（回傳 `{ entries: DuoItineraryEntry[]; unscheduled: UnscheduledMustFilm[] }`）簽章殼；`src/domain/tickets.ts` 的 `buildTicketList` 加選配參數簽章 `(duo?: { entries: DuoItineraryEntry[]; partner: PartnerData })`（型別先宣告、函式體先忽略該參數）。
  - 不做：不寫排程演算法；不改 `buildItinerary` 與既有 `buildTicketList` 行為；不刪 `src/domain/merge.ts`（Phase 4 的 `[CODE-REMOVE]` 才刪）。

- [x] T004 在 planner 測試世界加入層內名次、有空時段與兩人行程容器
  - Read:
    - `specs/truth/features/planner/dsl.md` -> 介面共通約定（world、層內排序、有空時段、兩人模式的行程）
    - `specs/truth/features/planner/兩人合併/dsl.md` -> 兩人排程定義
    - `tests/support/planner-world.ts`、`tests/support/planner-duo-helpers.ts`
  - 只做：`planner-world.ts` 讓自己與同伴資料都帶層內名次與有空時段欄位；加入 `lastDuo`（最近一次兩人行程）、`lastAvailability`（最近一次有空時段查詢）；`planner-duo-helpers.ts` 加入「以列順序指派層內名次」「從不可看時段扣除」的 helper 簽章。
  - 不做：不寫任何 stepdef 語意；沒有同伴資料時，世界的行為與 001／002 完全相同；不刪除 002 的 `lastMerged` 容器（Phase 3 的 `[BDD-REMOVE]` 與 Phase 4 才刪）。

- [x] T005 在 web 測試 fixture 加入 v3 預載與舊版格式 helper
  - Read:
    - `specs/truth/features/web/dsl.md` -> 介面共通約定、`觀眾已設定不可看時段如下：`、`觀眾已標記影片層級如下：`
    - `specs/truth/features/web/分享與保存/dsl.md` -> 連結種類說明、舊版格式 Given
    - `tests/support/web-fixtures.ts`、`tests/support/web-duo-helpers.ts`、`tests/support/UI-HOOKS.md`
  - 只做：`web-fixtures.ts` 加入：以 schema_version 3 預載（有空時段、層內名次）的 state fixture 選項；以 002 格式（schema_version 2、不可看時段清單）與 001 格式預載保存內容的 helper；把含不可看時段的 001 格式內容編成分享連結、以及編成 schema_version 4 連結的 helper；讀取手機端本機保存的有空時段與層內名次的 helper。
  - 不做：不寫任何 stepdef 語意；既有 state fixture 的預設行為（沒有同伴、沒有有空時段）不得改變；不改 `UI-HOOKS.md` 內容（Phase 3 的 web 任務負責）。

## Phase 3: Test Alignment & Implementation

**Goal**: 在寫產品碼之前，把本輪所有新增、改動、刪除的 DSL 自動化測試對齊最新版 truth。ADD 句用 `[BDD-RED]`；MODIFY 句（含語意不變的權威位置搬移）用 `[BDD-ALIGN]`；DELETE 句用 `[BDD-REMOVE]`。不寫產品行為。

**DSL 參照**:
- 每一句只屬於一個權威 `dsl.md`：同模組 `specs/truth/features/{介面}/{模組}/dsl.md`，或介面根 `specs/truth/features/{介面}/dsl.md`。不得掃其他模組。
- 讀法：用 task title 的句型對到該檔那一列，以 `StepDef 實作語意` 當作測試程式碼語意。Given / When 讀 `怎麼做`、`權威狀態落地`、`回寫`（web 讀 `使用 fixture`、`Arrange 來源`、`頁面操作`、`等待條件`、`回寫資料`）；Then 讀 `必查`（`呈現結果`、`權威狀態`、`再讀確認`、`不該發生`）。
- `truth-delta.md` 只告訴這句是 ADD / MODIFY / DELETE。語意以 `dsl.md` 那一列為準，不得用 feature 措辭或舊 stepdef 自行發明。
- planner 介面根句型在 `specs/truth/features/planner/dsl.md`；web 介面根句型在 `specs/truth/features/web/dsl.md`。其餘句型在各自模組 `dsl.md`。

**Markers**:
- `[BDD-ALIGN]`：`MODIFY`。既有 stepdef 還在，但語意是舊 truth（或位置搬移）。依 `dsl.md` 該列改測試，讓它表達最新版 `StepDef 實作語意`；沒有同伴、沒有層內排序與小時格子時行為必須與改動前完全相同。
- `[BDD-REMOVE]`：`DELETE`。此句已不是 truth。移除或改寫仍綁這句的 stepdef／assertion／helper，不得留下保護舊行為的測試；同步清掉只服務這句的 helper 與 world 欄位。
- `[BDD-RED]`：`ADD`。依 `dsl.md` 該列寫出 stepdef。完成時這句可被跑到，失敗只能是 assertion 或產品行為（例如 `src/domain/duo.ts` 丟出 not implemented），不能是 undefined step。
- 三個 marker 都只動測試層，不寫產品碼。

**Shared Must Read**:
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、被改動的 Given／When 列
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部列
- `specs/truth/features/planner/可看判定/dsl.md`、`最佳行程/dsl.md`、`未排入原因/dsl.md`、`搶票順序與備案/dsl.md`、`搶票切換/dsl.md` -> 本輪改動／新增列
- `specs/truth/features/web/dsl.md` -> 介面共通約定、被改動／新增的列
- `specs/truth/features/web/時段/dsl.md`、`選片/dsl.md`、`行程/dsl.md`、`搶票/dsl.md`、`分享與保存/dsl.md` -> 本輪改動／新增列
- `truth-delta.md` -> `/dsl-refine` 全部 ADD / MODIFY / DELETE 列
- `specs/truth/data/data-model.dbml`
- `tests/support/**`、`tests/steps/**`

**Boundary**:
- 一條 DSL 一個 task。
- 只改該句的 stepdef／assertion／直接依賴的 helper；寫進 task 指定的 steps 檔。web 句若需要新定位點，補在 `tests/support/UI-HOOKS.md`（慣例見該檔開頭）。
- 不寫產品碼（`src/**`）。
- review 啟動 subagent；本輪所有 Test Scope 不得再有 undefined step，失敗只能是 assertion 或產品行為；既有 001 feature 不得因 ALIGN／REMOVE 而新增失敗（用沒有同伴的路徑跑 `bddgen` 與既有 planner／web feature 確認；已核准例外見 Task Binding Contract）；`bddgen` 不得出現 duplicate 或 missing step。有 issues 就修正再 review，直到沒有任何問題。通過前不解鎖 Phase 4。

**Parallel Hint**:
- 依 steps 檔分組派給 sonnet subagent（同一 steps 檔的句由同一個 subagent 依序完成，避免同檔衝突）：planner 7 個 steps 檔、web 6 個 steps 檔，共 13 組可平行；最後一題 review 等全部回來再啟動 subagent。

#### planner/（介面根） → `tests/steps/planner/shared.steps.ts`

- [x] T006 [P] [BDD-ALIGN] `Given: 觀眾的分層如下：`
  - Read: `tests/steps/planner/shared.steps.ts`（層內名次依列順序）
- [x] T007 [P] [BDD-ALIGN] `Given: 同伴的分層如下：`
  - Read: `tests/steps/planner/shared.steps.ts`（層內名次依列順序）
- [x] T008 [P] [BDD-ALIGN] `Given: 觀眾已設定不可看時段如下：`
  - Read: `tests/steps/planner/shared.steps.ts`（改為從有空時段扣除）
- [x] T009 [P] [BDD-ALIGN] `Given: 同伴已設定不可看時段如下：`
  - Read: `tests/steps/planner/shared.steps.ts`（改為從有空時段扣除）
- [x] T010 [P] [BDD-ALIGN] `When: 觀眾執行排程`
  - Read: `tests/steps/planner/shared.steps.ts`（有同伴時產出兩人行程）
- [x] T011 [P] [BDD-ALIGN] `Given: 觀眾已執行排程並開啟搶票清單`
  - Read: `tests/steps/planner/shared.steps.ts`（有同伴時清單只含自己行程並帶張數）

#### planner/可看判定 → `tests/steps/planner/可看判定.steps.ts`

- [x] T012 [P] [BDD-ALIGN] `When: 觀眾查看場次可看狀態`
  - Read: `tests/steps/planner/可看判定.steps.ts`
- [x] T013 [P] [BDD-ALIGN] `When: 觀眾把不可看時段 "{時段}" 一次套用到以下日期：`
  - Read: `tests/steps/planner/可看判定.steps.ts`
- [x] T014 [P] [BDD-ALIGN] `Then: 場次可看狀態如下：`
  - Read: `tests/steps/planner/可看判定.steps.ts`
- [x] T015 [P] [BDD-REMOVE] `Then: 不可看時段設定如下：`
  - Read: `tests/steps/planner/可看判定.steps.ts`
- [x] T016 [P] [BDD-RED] `When: 觀眾查看有空時段`
- [x] T017 [P] [BDD-RED] `Then: 有空時段如下：`

#### planner/最佳行程 → `tests/steps/planner/最佳行程.steps.ts`

- [x] T018 [P] [BDD-ALIGN] `Then: 行程的排程目標不劣於窮舉所有可行組合`
  - Read: `tests/steps/planner/最佳行程.steps.ts`（窮舉比較加入層內排序名次）
- [x] T019 [P] [BDD-ALIGN] `Then: 行程中沒有 "{片名}"`
  - Read: `tests/steps/planner/最佳行程.steps.ts`（權威位置由介面根下放回本模組，語意不變；從 `shared.steps.ts` 搬回）
- [x] T020 [P] [BDD-ALIGN] `Then: 行程沒有任何場次`
  - Read: `tests/steps/planner/最佳行程.steps.ts`（權威位置由介面根下放回本模組，語意不變；從 `shared.steps.ts` 搬回）

#### planner/未排入原因 → `tests/steps/planner/未排入原因.steps.ts`

- [x] T021 [P] [BDD-RED] `Then: 兩人未排入的必看片與原因如下：`

#### planner/兩人合併 → `tests/steps/planner/兩人合併.steps.ts`

- [x] T022 [P] [BDD-REMOVE] `When: 觀眾查看兩人合併結果`
  - Read: `tests/steps/planner/兩人合併.steps.ts`
- [x] T023 [P] [BDD-REMOVE] `Then: 合併後參與排程的影片如下：`
  - Read: `tests/steps/planner/兩人合併.steps.ts`
- [x] T024 [P] [BDD-REMOVE] `Then: 合併後的不可看時段如下：`
  - Read: `tests/steps/planner/兩人合併.steps.ts`
- [x] T025 [P] [BDD-REMOVE] `Then: 合併後的每日上限為 "{上限}"`
  - Read: `tests/steps/planner/兩人合併.steps.ts`
- [x] T026 [P] [BDD-REMOVE] `Then: 單方標記的影片數如下：`
  - Read: `tests/steps/planner/兩人合併.steps.ts`
- [x] T027 [P] [BDD-REMOVE] `Then: 雙方原始設定與合併前相同`
  - Read: `tests/steps/planner/兩人合併.steps.ts`
- [x] T028 [P] [BDD-RED] `Then: 兩人行程依日期排列如下：`
- [x] T029 [P] [BDD-RED] `Then: 兩人行程的排程目標不劣於窮舉所有可行組合`
- [x] T030 [P] [BDD-RED] `Then: 雙方原始設定與排程前相同`

#### planner/搶票順序與備案 → `tests/steps/planner/搶票順序與備案.steps.ts`

- [x] T031 [P] [BDD-ALIGN] `When: 觀眾執行排程並開啟搶票清單`
  - Read: `tests/steps/planner/搶票順序與備案.steps.ts`
- [x] T032 [P] [BDD-RED] `Then: 搶票清單的購票張數如下：`

#### planner/搶票切換 → `tests/steps/planner/搶票切換.steps.ts`

- [x] T033 [P] [BDD-ALIGN] `When: 觀眾把 "{片名}" 的 "{場次}" 場次標記為沒搶到`
  - Read: `tests/steps/planner/搶票切換.steps.ts`
- [x] T034 [P] [BDD-ALIGN] `When: 觀眾重新排程`
  - Read: `tests/steps/planner/搶票切換.steps.ts`

#### web/（介面根） → `tests/steps/web/shared.steps.ts`

- [x] T035 [P] [BDD-ALIGN] `Given: 觀眾已標記影片層級如下：`
  - Read: `tests/steps/web/shared.steps.ts`（層內順序依列順序）
- [x] T036 [P] [BDD-ALIGN] `Given: 同伴的分層如下：`
  - Read: `tests/steps/web/shared.steps.ts`（層內順序依列順序）
- [x] T037 [P] [BDD-ALIGN] `Given: 觀眾已設定不可看時段如下：`
  - Read: `tests/steps/web/shared.steps.ts`（改為從有空時段扣除）
- [x] T038 [P] [BDD-ALIGN] `Given: 同伴已設定不可看時段如下：`
  - Read: `tests/steps/web/shared.steps.ts`（改為從有空時段扣除）
- [x] T039 [P] [BDD-ALIGN] `Then: 時段頁顯示不可看時段如下：`
  - Read: `tests/steps/web/shared.steps.ts`（列出有空時段的補集）
- [x] T040 [P] [BDD-ALIGN] `Then: 行程頁依日期顯示以下場次：`
  - Read: `tests/steps/web/shared.steps.ts`（新增可選欄 `參與者`）
- [x] T041 [P] [BDD-ALIGN] `Given: 觀眾已排好行程`
  - Read: `tests/steps/web/shared.steps.ts`（權威位置由 `分享與保存` 上提到介面根，語意不變；從 `分享與保存.steps.ts` 搬到 `shared.steps.ts`）
- [x] T042 [P] [BDD-RED] `Then: 時段頁 "{日期}" 的小時格子如下：`
- [x] T043 [P] [BDD-RED] `Then: 選片頁層內順序如下：`

#### web/時段 → `tests/steps/web/時段.steps.ts`

- [x] T044 [P] [BDD-RED] `When: 觀眾在時段頁查看 "{日期}" 的小時格子`
- [x] T045 [P] [BDD-RED] `When: 觀眾在時段頁點擊 "{日期}" 的 {小時} 點格子`
- [x] T046 [P] [BDD-RED] `When: 觀眾在時段頁選取以下日期並點擊 {小時} 點格子：`
- [x] T047 [P] [BDD-RED] `Then: 時段頁 "{日期}" 的 24 格皆為有空`
- [x] T048 [P] [BDD-ALIGN] `Then: 選片頁的場次可看狀態如下：`
  - Read: `tests/steps/web/時段.steps.ts`

#### web/選片 → `tests/steps/web/選片.steps.ts`

- [x] T049 [P] [BDD-ALIGN] `When: 觀眾把 "{片名}" 標為 "{層級}"`
  - Read: `tests/steps/web/選片.steps.ts`（新標記或改層排該層最後）
- [x] T050 [P] [BDD-RED] `When: 觀眾把 "{片名}" 在層內上移一位`
- [x] T051 [P] [BDD-RED] `When: 觀眾把 "{片名}" 在層內下移一位`
- [x] T052 [P] [BDD-RED] `Then: "{片名}" 的層內 "{方向}" 按鈕停用`

#### web/行程 → `tests/steps/web/行程.steps.ts`

- [x] T053 [P] [BDD-RED] `When: 觀眾把行程篩選為 "{篩選}"`
- [x] T054 [P] [BDD-RED] `Then: 行程頁的篩選選項為 "{選項}"`
- [x] T055 [P] [BDD-RED] `Then: 行程頁不顯示一起與自己標示及篩選`
- [x] T056 [P] [BDD-ALIGN] `Then: 行程頁列出未排入的必看片與原因如下：`
  - Read: `tests/steps/web/行程.steps.ts`（新增可選欄 `誰`）
- [x] T057 [P] [BDD-REMOVE] `Then: 行程頁頂部顯示單方標記統計 "{統計}"`
  - Read: `tests/steps/web/行程.steps.ts`
- [x] T058 [P] [BDD-REMOVE] `Then: 行程頁不顯示單方標記統計`
  - Read: `tests/steps/web/行程.steps.ts`

#### web/搶票 → `tests/steps/web/搶票.steps.ts`

- [x] T059 [P] [BDD-REMOVE] `Then: 搶票清單每列顯示 "{張數}"`
  - Read: `tests/steps/web/搶票.steps.ts`
- [x] T060 [P] [BDD-RED] `Then: 搶票清單的購票張數如下：`

#### web/分享與保存 → `tests/steps/web/分享與保存.steps.ts`

- [x] T061 [P] [BDD-ALIGN] `Then: 手機的行程與電腦完全相同`
  - Read: `tests/steps/web/分享與保存.steps.ts`（逐列比對一起與自己標示）
- [x] T062 [P] [BDD-ALIGN] `Then: 手機的搶票清單與電腦完全相同（順序、排定場次、備案場次）`
  - Read: `tests/steps/web/分享與保存.steps.ts`（逐列比對張數（一起 2、自己 1））
- [x] T063 [P] [BDD-RED] `Given: 裝置上保存的是 002 版本格式的設定，不可看時段如下：`
- [x] T064 [P] [BDD-RED] `Given: 手機收到 001 版本格式的個人分享連結，不可看時段如下：`
- [x] T065 [P] [BDD-RED] `Given: 分享連結的版本高於本工具支援的版本`
- [x] T066 [P] [BDD-RED] `Then: 手機的時段頁顯示不可看時段如下：`
- [x] T067 [P] [BDD-RED] `Then: 手機的選片頁層內順序如下：`

- [x] T068 subagent review (phase quality gate)

> Parallel Hint 補充：T006–T067 依上列分組平行；T068 等全部回來再啟動 subagent 來 review。

## Phase 4A: MODIFY Feature File - planner/可看判定/場次可看判定.feature

**Goal**: 實作有空時段模型：以分鐘精度從有空時段扣除區間（`subtractInterval`、`normalizeDay`）、`isSessionAvailable` 依開演到散場每一分鐘判斷（含跨午夜）、舊不可看時段相減遷移（`src/state/migrate.ts` 的相減部分）；個人模式可看判定結果與改動前相同。

**Shared Must Read**:
- `specs/truth/features/planner/可看判定/場次可看判定.feature` -> `Feature: 場次可看判定`
- `specs/truth/features/planner/可看判定/dsl.md` -> 全部 When／Then 列
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` MODIFY／ADD／DELETE `planner/可看判定` 全部列
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。 本 phase 實作 `src/domain/availability.ts` 與 `src/state/migrate.ts` 的相減邏輯。

**Test Scope**:
- `specs/truth/features/planner/可看判定/場次可看判定.feature`（project：planner）

- [x] T069 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T070 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4B: MODIFY Feature File - planner/最佳行程/排程目標優先序.feature

**Goal**: 排程目標在有空再看數之後加入層內排序比較（`src/domain/order.ts` 名次比較、`schedule.ts` 目標比較）、★ 降為第 5 項；同層衝堂取名次較前者；比較名次由小到大逐一進行。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> `Feature: 排程目標優先序`
- `specs/truth/features/planner/最佳行程/dsl.md` -> 「排程目標」說明與全部 Then 列
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` MODIFY／ADD／DELETE `planner/最佳行程/排程目標優先序.feature`、`最佳行程/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。 層內排序只在前三項相同時才比較；層級數仍優先。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/排程目標優先序.feature`（project：planner）

- [x] T071 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T072 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4C: MODIFY Feature File - planner/最佳行程/最佳性與可重現.feature

**Goal**: 窮舉驗證納入層內排序；確認 50 部壓力資料仍在 10 秒內完成、同分時固定為場次較早者。

**Shared Must Read**:
- `specs/truth/features/planner/最佳行程/最佳性與可重現.feature` -> `Feature: 最佳性與可重現`
- `specs/truth/features/planner/最佳行程/dsl.md` -> `行程的排程目標不劣於窮舉所有可行組合`、`排程在 {秒} 秒內完成` 與「排程目標」說明
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` ADD `planner/最佳行程/最佳性與可重現.feature` Rule、MODIFY `最佳行程/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。 效能底線：50 部已分層影片、每部 3 場次，排程 10 秒內（NFR-001）。

**Test Scope**:
- `specs/truth/features/planner/最佳行程/最佳性與可重現.feature`（project：planner）

- [x] T073 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T074 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4D: ADD Feature File - planner/兩人合併/兩人各自片單排程.feature

**Goal**: 實作 `src/domain/duo.ts` 的 `scheduleDuo`：每人各自的可看、相容、每日上限只約束自己；每人每片至多一場；只有一人分層的影片只排入該人；兩人皆個人最佳；一起看以同一場次表示（參與者 `together`）；個人模式路徑不受影響。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/兩人各自片單排程.feature` -> `Feature: 兩人各自片單排程`
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部 Then 列與「兩人排程定義」
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` ADD `planner/兩人合併/兩人各自片單排程.feature`、`兩人合併/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。 本 phase 先讓「各自達到個人最佳」成立，一起看的決勝見 4E。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/兩人各自片單排程.feature`（project：planner）

- [x] T075 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T076 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4E: ADD Feature File - planner/兩人合併/一起看的取捨.feature

**Goal**: 在兩人各自個人最佳的組合中，取一起看場次最多者（再比 ★ 合計、再比場次較早）；為一起看而讓任一人少看或改看名次較後的片時不一起看（CL-301）。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/一起看的取捨.feature` -> `Feature: 一起看的取捨`
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部 Then 列與「兩人排程定義」第 4～6 項
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` ADD `planner/兩人合併/一起看的取捨.feature`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/一起看的取捨.feature`（project：planner）

- [x] T077 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T078 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4F: ADD Feature File - planner/兩人合併/兩人行程最佳性.feature

**Goal**: 確認兩人行程在窮舉比對下不劣於任何可行組合（SC-303），且排程在可接受時間內完成。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/兩人行程最佳性.feature` -> `Feature: 兩人行程最佳性`
- `specs/truth/features/planner/兩人合併/dsl.md` -> `兩人行程的排程目標不劣於窮舉所有可行組合` 與「兩人排程定義」
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` ADD `planner/兩人合併/兩人行程最佳性.feature`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。 若窮舉比對與演算法不一致，以 truth 的兩人排程目標為準修正產品碼，不得放寬窮舉。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/兩人行程最佳性.feature`（project：planner）

- [x] T079 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T080 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4G: MODIFY Feature File - planner/未排入原因/未排入必看片原因.feature

**Goal**: 未排入必看片原因在層內排序取捨下仍正確；兩人模式分別列出兩人各自排不進去的必看片並標明是誰的必看（`unscheduled_must_films.owner`）。

**Shared Must Read**:
- `specs/truth/features/planner/未排入原因/未排入必看片原因.feature` -> `Feature: 未排入必看片原因`
- `specs/truth/features/planner/未排入原因/dsl.md` -> 全部 Then 列（含新增的 `兩人未排入的必看片與原因如下：`）
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` ADD／MODIFY `planner/未排入原因`
- `specs/truth/data/data-model.dbml` -> unscheduled_must_films、itinerary_entries

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。 兩人模式的未排入判斷建立在 4D 的 `scheduleDuo` 上，本 phase 只補原因與持有人。

**Test Scope**:
- `specs/truth/features/planner/未排入原因/未排入必看片原因.feature`（project：planner）

- [x] T081 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T082 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4H: MODIFY Feature File - planner/搶票順序與備案/兩人搶票清單.feature

**Goal**: 搶票清單在兩人模式只含觀眾自己的行程、順序以自己的層級與熱門計算、輸出 `ticket_quantity`（一起 2、自己 1）；一起看的片備案須兩人都可看且不使任一人超過自己的上限，自己看的片備案只看觀眾。

**Shared Must Read**:
- `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature` -> `Feature: 兩人搶票清單`
- `specs/truth/features/planner/搶票順序與備案/dsl.md` -> `觀眾執行排程並開啟搶票清單`、`搶票清單的購票張數如下：` 與全部 Then 列
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` MODIFY／ADD `planner/搶票順序與備案`
- `specs/truth/data/data-model.dbml` -> ticket_list_items、itinerary_entries

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。

**Test Scope**:
- `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature`（project：planner）

- [x] T083 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T084 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4I: MODIFY Feature File - planner/搶票切換/兩人沒搶到切換備案.feature

**Goal**: 沒搶到後換備案依參與者判斷：一起看的片須兩人都可看，自己看的片只看觀眾；重新排程時兩人各自重排並固定觀眾的 got 場次。

**Shared Must Read**:
- `specs/truth/features/planner/搶票切換/兩人沒搶到切換備案.feature` -> `Feature: 兩人沒搶到切換備案`
- `specs/truth/features/planner/搶票切換/dsl.md` -> `標記為沒搶到`、`觀眾重新排程` 與 Then 列
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、本檔用到的介面根列（層內排序、有空時段、同伴 Given、`觀眾執行排程`）
- `truth-delta.md` -> `/dsl-refine` MODIFY `planner/搶票切換/dsl.md`、`兩人沒搶到切換備案.feature`
- `specs/truth/data/data-model.dbml` -> ticket_list_items、ticket_marks

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴、沒有層內排序調整與小時格子設定時（個人模式），行為與輸出必須與改動前相同（SC-305；已核准例外見 Task Binding Contract），不得改動 truth 的 feature 與 DSL 語意。

**Test Scope**:
- `specs/truth/features/planner/搶票切換/兩人沒搶到切換備案.feature`（project：planner）

- [x] T085 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T086 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4J: MODIFY Feature File - web/時段/不可看場次標示.feature

**Goal**: 選片頁場次的「不可看」標示改由有空時段以分鐘判斷（呼叫 `src/domain/availability.ts`），涵蓋被切掉幾分鐘的場次；同時讓 `src/state/storage.ts` 讀寫 schema_version 3（寫入一律 3、讀取 3 與既有的 1、2 不退化；1、2 的遷移細節與版本高於 3 的處理由 4T 負責），web 的 state fixture 以 v3 預載。

**Shared Must Read**:
- `specs/truth/features/web/時段/不可看場次標示.feature` -> `Feature: 不可看場次標示`
- `specs/truth/features/web/時段/dsl.md` -> `選片頁的場次可看狀態如下：` 與 `觀眾開啟選片頁查看各片場次`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY／ADD `web/時段`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「選片」「時段」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/index.html` -> 選片頁場次列「不可看」標示既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/時段/不可看場次標示.feature`（project：web-desktop、web-mobile）

- [x] T087 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T088 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4K: ADD Feature File - web/時段/小時格子設定.feature

**Goal**: 時段頁新增 24 格小時格子（有空／沒空／部分沒空）與點擊切換、多日同步；與不可看時段列表編輯同一份有空時段；`src/ui/SlotsPage.tsx`。

**Shared Must Read**:
- `specs/truth/features/web/時段/小時格子設定.feature` -> `Feature: 小時格子設定`
- `specs/truth/features/web/時段/dsl.md` -> 全部新增列（查看／點擊／多日點擊／24 格皆為有空）、根 DSL `時段頁 "{日期}" 的小時格子如下：`、`時段頁顯示不可看時段如下：`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/時段/dsl.md` 與 `小時格子設定.feature`、MODIFY 根 DSL
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「時段」畫面與流程、驗證與錯誤回饋
- `specs/plans/001-ghff-solo-planner/ui/availability.html` -> 時段頁既有樣式（24 小時格子沿用其元件與間距；格子三種狀態需有不同外觀與文字，不靠顏色單獨表達）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。 小時格子點擊規則呼叫 `toggleHour`；觸控目標至少 44px。

**Test Scope**:
- `specs/truth/features/web/時段/小時格子設定.feature`（project：web-desktop、web-mobile）

- [x] T089 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T090 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4L: ADD Feature File - web/選片/層內排序.feature

**Goal**: 選片頁新增「層內順序」檢視：依三層列出已標記影片，每片有上移／下移按鈕（同層第一位上移、最後一位下移停用），調整後保存名次；個人與兩人模式皆調整自己的順序。

**Shared Must Read**:
- `specs/truth/features/web/選片/層內排序.feature` -> `Feature: 層內排序`
- `specs/truth/features/web/選片/dsl.md` -> `上移`、`下移`、`按鈕停用` 與根 DSL `選片頁層內順序如下：`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/選片/層內排序.feature`、`選片/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「選片」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/index.html` -> 選片頁既有樣式（層內順序檢視沿用卡片與層級色塊）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。 名次操作呼叫 `src/domain/order.ts` 的 `moveWithinTier`。

**Test Scope**:
- `specs/truth/features/web/選片/層內排序.feature`（project：web-desktop、web-mobile）

- [x] T091 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T092 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4M: MODIFY Feature File - web/選片/影片分層.feature

**Goal**: 新標記或改層的影片排在目標層最後，原層名次遞補、取消標記後名次連續（`appendToTier`）。

**Shared Must Read**:
- `specs/truth/features/web/選片/影片分層.feature` -> `Feature: 影片分層`
- `specs/truth/features/web/選片/dsl.md` -> `觀眾把 "{片名}" 標為 "{層級}"` 與根 DSL `選片頁層內順序如下：`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/選片/影片分層.feature`、`選片/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「選片」畫面與流程

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/選片/影片分層.feature`（project：web-desktop、web-mobile）

- [x] T093 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T094 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4N: MODIFY Feature File - web/行程/行程呈現.feature

**Goal**: 網頁行程反映層內排序的取捨；個人模式的行程頁不出現一起／自己標示與篩選。

**Shared Must Read**:
- `specs/truth/features/web/行程/行程呈現.feature` -> `Feature: 行程呈現`
- `specs/truth/features/web/行程/dsl.md` -> 全部 Then 列與 `行程頁不顯示一起與自己標示及篩選`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/行程/行程呈現.feature`、`行程/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/itinerary.html` -> 行程頁既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/行程/行程呈現.feature`（project：web-desktop、web-mobile）

- [x] T095 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T096 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4O: MODIFY Feature File - web/行程/未排入必看片.feature

**Goal**: 紅框在兩人模式逐筆標明是誰的必看（`owner`），頂部部數為兩人合計；個人模式紅框不變。

**Shared Must Read**:
- `specs/truth/features/web/行程/未排入必看片.feature` -> `Feature: 未排入必看片`
- `specs/truth/features/web/行程/dsl.md` -> `行程頁列出未排入的必看片與原因如下：`（含 `誰` 欄）
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/行程/未排入必看片.feature`、`行程/dsl.md`
- `specs/truth/data/data-model.dbml` -> unscheduled_must_films、itinerary_entries
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程、驗證與錯誤回饋
- `specs/plans/001-ghff-solo-planner/ui/itinerary.html` -> 未排入必看片紅框既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/行程/未排入必看片.feature`（project：web-desktop、web-mobile）

- [x] T097 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T098 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4P: ADD Feature File - web/行程/兩人行程的一起與自己.feature

**Goal**: `src/ui/ItineraryPage.tsx` 在兩人模式呼叫 `scheduleDuo`，每場標示「一起」或「{名字} 自己」，提供全部／只看自己／只看同伴篩選（預設全部），層級色塊依視角顯示；無共同分層時各自看、不顯示錯誤。

**Shared Must Read**:
- `specs/truth/features/web/行程/兩人行程的一起與自己.feature` -> `Feature: 兩人行程的一起與自己`
- `specs/truth/features/web/行程/dsl.md` -> `行程頁的篩選選項為`、`觀眾把行程篩選為`，以及根 DSL `行程頁依日期顯示以下場次：` 的 `參與者` 欄
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` ADD `web/行程/兩人行程的一起與自己.feature`、`行程/dsl.md`
- `specs/truth/data/data-model.dbml` -> itinerary_entries、unscheduled_must_films、partner 系列
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/itinerary.html` -> 行程頁時間軸既有樣式（一起／{名字} 自己標籤沿用既有標籤元件，篩選用分段控制）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。 篩選只是畫面狀態，不保存、不影響排程。

**Test Scope**:
- `specs/truth/features/web/行程/兩人行程的一起與自己.feature`（project：web-desktop、web-mobile）

- [x] T099 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T100 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4Q: MODIFY Feature File - web/行程/兩人行程的時段與上限.feature

**Goal**: 網頁兩人行程的一起看須兩人都有空、每日上限只約束自己。

**Shared Must Read**:
- `specs/truth/features/web/行程/兩人行程的時段與上限.feature` -> `Feature: 兩人行程的時段與上限`
- `specs/truth/features/web/行程/dsl.md` -> `行程頁依日期顯示以下場次：` 的 `參與者` 欄
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/行程/兩人行程的時段與上限.feature`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/行程/兩人行程的時段與上限.feature`（project：web-desktop、web-mobile）

- [x] T101 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T102 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4R: MODIFY Feature File - web/搶票/兩人搶票清單.feature

**Goal**: `src/ui/TicketsPage.tsx` 在兩人模式只列自己行程的場次，每列依參與者顯示「買 2 張」或「買 1 張」；順序以自己的層級與熱門計算。

**Shared Must Read**:
- `specs/truth/features/web/搶票/兩人搶票清單.feature` -> `Feature: 兩人搶票清單`
- `specs/truth/features/web/搶票/dsl.md` -> `搶票清單的購票張數如下：`、`搶票清單不顯示張數`、`搶票清單順序與排定場次如下：`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY／ADD／DELETE `web/搶票`
- `specs/truth/data/data-model.dbml` -> ticket_list_items、itinerary_entries
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「搶票」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/tickets.html` -> 搶票列既有樣式（張數標籤沿用既有標籤元件）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/搶票/兩人搶票清單.feature`（project：web-desktop、web-mobile）

- [x] T103 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T104 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4S: MODIFY Feature File - web/分享與保存/設定保存.feature

**Goal**: 層內名次與有空時段（含部分沒空的格子）隨 schema_version 3 保存，關閉重開後保留。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/設定保存.feature` -> `Feature: 設定保存`
- `specs/truth/features/web/分享與保存/dsl.md` -> 根 DSL `選片頁層內順序如下：`、`時段頁 "{日期}" 的小時格子如下：`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/分享與保存/設定保存.feature`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/分享與保存/設定保存.feature`（project：web-desktop、web-mobile）

- [x] T105 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T106 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4T: MODIFY Feature File - web/分享與保存/舊版相容.feature

**Goal**: 讀取 schema_version 1、2、3：1、2 依遷移規則轉成 3（不可看時段相減、層內名次依場次表影片順序初始化），只在記憶體轉換、下次保存才寫 3；版本高於 3 顯示損毀錯誤且不改任何資料（`src/state/migrate.ts`、`storage.ts`、`share.ts`）。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/舊版相容.feature` -> `Feature: 舊版相容`
- `specs/truth/features/web/分享與保存/dsl.md` -> 舊版格式 Given、`手機的時段頁顯示不可看時段如下：`、`分享連結的版本高於本工具支援的版本` 與連結種類說明
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY／ADD `web/分享與保存/舊版相容.feature`、`分享與保存/dsl.md`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程、驗證與錯誤回饋
- `specs/plans/001-ghff-solo-planner/ui/share.html` -> 分享與接收對話既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。 001／002 的既有讀取行為（v1 視為個人模式）不得退化。

**Test Scope**:
- `specs/truth/features/web/分享與保存/舊版相容.feature`（project：web-desktop、web-mobile）

- [x] T107 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T108 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4U: MODIFY Feature File - web/分享與保存/跨裝置分享.feature

**Goal**: 個人分享連結內容帶有層內名次與有空時段（schema_version 3），手機確認取代後與電腦一致。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/跨裝置分享.feature` -> `Feature: 跨裝置分享`
- `specs/truth/features/web/分享與保存/dsl.md` -> `手機的選片頁層內順序如下：`、`手機的時段頁顯示不可看時段如下：` 與連結種類說明
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/分享與保存/跨裝置分享.feature`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/share.html` -> 分享畫面既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/分享與保存/跨裝置分享.feature`（project：web-desktop、web-mobile）

- [x] T109 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T110 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4V: MODIFY Feature File - web/分享與保存/合併結果分享.feature

**Goal**: 兩人設定連結（merged）內容含兩人各自的片單、層內名次與有空時段，手機取代並開啟後行程（含一起／自己標示）與搶票清單（含 2／1 張）與電腦一致。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/合併結果分享.feature` -> `Feature: 合併結果分享`
- `specs/truth/features/web/分享與保存/dsl.md` -> `手機的行程與電腦完全相同`、`手機的搶票清單與電腦完全相同…`（含參與者標示與張數）與合併結果連結句型
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/分享與保存/dsl.md`、`合併結果分享.feature`
- `specs/truth/data/data-model.dbml` -> user_state、day_availability、available_intervals、film_preferences、partner 系列、itinerary_entries、ticket_list_items、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/share.html` -> 合併結果連結標示既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與兩人推導一律呼叫 `src/domain`，不得在畫面重寫排程、扣除或排序邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 相同（SC-305）。

**Test Scope**:
- `specs/truth/features/web/分享與保存/合併結果分享.feature`（project：web-desktop、web-mobile）

- [x] T111 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T112 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4W: DELETE Feature / DSL Truth - web/行程/兩人行程.feature（單方標記統計與無共同分層空狀態）

**Goal**: 移除 002 的單方標記統計提示、「兩人沒有共同標記的片，先到選片頁一起挑」空狀態與只含共同影片的行程邏輯；畫面改由 4P 的兩人行程承接。

**Shared Must Read**:
- `specs/truth/features/web/行程/兩人行程的一起與自己.feature`（取代 `兩人行程.feature`）
- `specs/truth/features/web/行程/dsl.md` -> 現存列（已無單方標記統計兩列）
- `truth-delta.md` -> `/dsl-refine` DELETE `web/行程/兩人行程.feature`、DELETE `web/行程/dsl.md` 單方標記統計兩列
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 「行程」畫面與流程
- `src/ui/ItineraryPage.tsx` -> 單方標記統計列與「兩人沒有共同標記的片，先到選片頁一起挑」空狀態
- `src/domain/merge.ts` 的 `singleSideCounts`（僅供上述畫面使用的部分）

**Boundary**:
- 只刪只服務已刪除 truth 的產品碼；不改 truth；個人模式畫面不得變動；若 `src/domain/merge.ts` 的 `mergePartner` 仍被其他處引用，留給 4Y 一併處理。

**Test Scope**:
- `specs/truth/features/web/行程/兩人行程的一起與自己.feature`（project：web-desktop、web-mobile）
- `specs/truth/features/web/行程/行程呈現.feature`、`未排入必看片.feature`、`兩人行程的時段與上限.feature`（project：web-desktop、web-mobile）

- [x] T113 [CODE-REMOVE] 移除只服務舊行為的產品碼與殘留 helper
- [x] T114 [REGRESSION] 跑 Test Scope，確認新版 truth 成立

## Phase 4X: DELETE Feature / DSL Truth - web/搶票/每列買 2 張（兩人搶票清單的舊 Rule 與句型）

**Goal**: 移除「兩人模式每列一律買 2 張」的產品行為（`ticket_quantity` 固定 2）與只服務它的 helper；張數改由參與者推導。

**Shared Must Read**:
- `specs/truth/features/web/搶票/兩人搶票清單.feature`（已改寫）
- `specs/truth/features/web/搶票/dsl.md` -> 現存列（已無 `搶票清單每列顯示`）
- `truth-delta.md` -> `/dsl-refine` DELETE `web/搶票/dsl.md` `搶票清單每列顯示`
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 「搶票」畫面與流程
- `src/domain/tickets.ts`、`src/ui/TicketsPage.tsx` -> 把 `ticket_quantity` 固定設為 2 的路徑

**Boundary**:
- 只刪只服務已刪除 truth 的產品碼；不改 truth；個人模式清單（不顯示張數）不得變動。

**Test Scope**:
- `specs/truth/features/web/搶票/兩人搶票清單.feature`、`搶票清單呈現.feature`、`搶票標記與切換備案.feature`（project：web-desktop、web-mobile）

- [x] T115 [CODE-REMOVE] 移除只服務舊行為的產品碼與殘留 helper
- [x] T116 [REGRESSION] 跑 Test Scope，確認新版 truth 成立

## Phase 4Y: DELETE Feature / DSL Truth - planner/兩人合併/兩人合併排程.feature、共同影片與層級合併.feature、不可看時段與每日上限合併.feature 與六個合併 DSL 句型

**Goal**: 刪除 002 的合併產品碼：`src/domain/merge.ts`（`mergePartner`、`singleSideCounts`）、`MergedView`、`SingleSideCounts` 型別、`UserState.unavailable_slots`／`PartnerData.unavailable_slots` 與舊不可看時段處理；清掉 planner 測試世界的 `lastMerged` 與只服務合併的 helper。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/dsl.md` -> 現存列（已無合併句型）
- `specs/truth/features/planner/兩人合併/兩人各自片單排程.feature`、`一起看的取捨.feature`、`兩人行程最佳性.feature`（取代三個已刪 feature）
- `truth-delta.md` -> `/dsl-refine` DELETE `planner/兩人合併` 全部列、`/data-plan` DELETE `unavailable_slots`、`merged_*`、`single_side_counts`、`partner_unavailable_slots`
- `src/domain/merge.ts`、`src/domain/types.ts` -> 合併與舊不可看時段的型別與函式
- `tests/support/planner-world.ts`、`planner-duo-helpers.ts` -> `lastMerged` 與合併 helper

**Boundary**:
- 只刪只服務已刪除 truth 的產品碼；刪除前先全文搜尋確認 `mergePartner`、`singleSideCounts`、`MergedView`、`unavailable_slots` 已無任何引用（`src/ui`、`src/state`、`tests`）；`tsc --noEmit` 必須通過；不改 truth。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/兩人各自片單排程.feature`、`一起看的取捨.feature`、`兩人行程最佳性.feature`（project：planner）
- `specs/truth/features/planner/可看判定/場次可看判定.feature`、`最佳行程/**`、`未排入原因/**`、`搶票順序與備案/**`、`搶票切換/**`（project：planner）

- [x] T117 [CODE-REMOVE] 移除只服務舊行為的產品碼與殘留 helper
- [x] T118 [REGRESSION] 跑 Test Scope，確認新版 truth 成立

## Phase 4Z: ui quality gate

**Goal**: 產品對齊本輪回追到的 plan-side 產物（001 `ui/ui-plan.md` 視覺方向與五個畫面雛形；本 plan 沒有新雛形）。`Test Scope` 全綠不能代替本題。

**Read**:
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、驗證與錯誤回饋、「選片」「時段」「行程」「搶票」「分享」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/styles.css`（色彩、元件、間距基準）與 `index.html`、`availability.html`、`itinerary.html`、`tickets.html`、`share.html`
- `src/ui/`（尤其 `SlotsPage.tsx` 小時格子、`PickPage.tsx` 層內順序檢視、`ItineraryPage.tsx` 一起／自己標示與篩選、`TicketsPage.tsx` 張數、`ImportPage.tsx` 與 `SharePage.tsx`）

**Boundary**:
- 不改 truth、不加 feature、不重跑 GREEN 當通過條件。
- 檢查新增元素（24 小時格子與三種狀態、層內上移／下移按鈕、一起／{名字} 自己標籤、篩選分段控制、買 1／2 張標籤、紅框的人名）沿用既有 token 與元件樣式，沒有另創視覺語言；格子三種狀態不只靠顏色（有文字或圖示）；觸控目標至少 44px；手機 390px 走完 時段 → 選片層內順序 → 行程 → 搶票 → 分享 不需水平捲動；個人模式畫面與 001 一致（無一起／自己標示、無篩選、無張數）。
- 已知 001 雛形瑕疵不照抄：時間輸入用 24 小時制；無備案時顯示「無不衝堂備案」；標籤多時排序按鈕不換行。

- [x] T119 subagent review (ui quality gate)

## Phase 5: 完整回歸（SC-305）

**Goal**: 跑完整套件，證明沒有同伴、沒有層內排序調整與小時格子時 001 的既有測試維持通過（已核准例外見 Task Binding Contract），且本輪新增與改動的 planner 與 web feature 全綠；舊的合併產品碼已清除。

**Read**:
- `specs/truth/features/planner/**`、`specs/truth/features/web/**`、`specs/truth/features/scraper/**` -> 全部 feature
- `playwright.config.ts` -> projects（planner、scraper、web-desktop、web-mobile）
- `truth-delta.md` -> `/dsl-refine` 全部列

**Boundary**:
- 不改 truth、不改 feature；只修產品碼或測試 helper 中的真實缺陷。
- 任何 001 既有 Example 失敗都視為本輪迴歸，必須修產品碼，不得改既有 feature、DSL 或把既有 stepdef 放寬成可通過。
- 稽核：`python3 ~/.claude/skills/gherkin-and-dsl/scripts/audit_feature_dsl_topology.py --root specs/truth/features/<planner|web|scraper>` 三個介面必須 PASS（本檔產出時已 PASS）。

- [x] T120 [REGRESSION] 執行 `npx tsc --noEmit` 與 `npm run build`，確認型別與靜態建置通過；全文搜尋 `mergePartner`、`singleSideCounts`、`unavailable_slots` 在 `src`、`tests` 已無殘留
- [x] T121 [REGRESSION] 執行完整套件 `npm test`（`bddgen && playwright test`，四個 project：planner、scraper、web-desktop、web-mobile），全部 feature 通過；記錄總 Example 數與失敗數（失敗數必須為 0）
- [x] T122 subagent review (full regression gate)：獨立重跑完整套件一次，並抽查 001 的 `web/分享與保存/跨裝置分享.feature`、`web/搶票/搶票標記與切換備案.feature`、`web/行程/行程呈現.feature` 在個人模式下通過，以及 `planner/最佳行程/排程目標優先序.feature` 的層級數優先規則
