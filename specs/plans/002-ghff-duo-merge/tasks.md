# Tasks: 兩人合併選片排程

**Plan Package**: `specs/plans/002-ghff-duo-merge`
**Core Inputs**: `spec.md`, `truth-delta.md`, `specs/truth/techstack.md`, `specs/truth/data/**`, `specs/truth/features/planner/**`, `specs/truth/features/web/**`, `features/acceptance/**`；plan-side 視覺基準沿用 `specs/plans/001-ghff-solo-planner/ui/ui-plan.md`（CL-203：本 plan 不做 `plan.md`、`research.md`、`ui/` 雛形）

## Task Binding Contract

- 每個**開發任務**都必須對應 `truth-delta.md` 中的 ADD / MODIFY / DELETE / NOOP 語意；本輪有 ADD 與 MODIFY，沒有 DELETE。
- 本輪沒有新增技術（`/technical-research` 為 NOOP）：**省略 Setup**。
- Phase 2 `Foundational` 只建立後續實作程式、測試共用元件、入口、fixture、helper 與落點骨架；只放型別、版本常數與測試容器，不放行為。
- Phase 3 `Test Alignment & Implementation` 的目的：在寫產品碼之前，先把本輪所有新增／改動的 DSL 自動化測試對齊最新版 truth。
- Truth 參照必須使用 `specs/truth/**` 路徑；plan 參照才使用當前 plan package 內相對路徑（`spec.md`、`truth-delta.md`）。
- Feature `Shared Must Read` 除 feature、同模組 DSL、對應 `truth-delta` 列外，還必須列入回追到的 planner 產物。本 plan 沒有 `plan.md` 與 `ui/`：web feature 回追到的 plan-side 產物是 001 的 `specs/plans/001-ghff-solo-planner/ui/ui-plan.md`（視覺方向，不是新雛形）；planner 介面（純邏輯）沒有 plan-side 產物，以 `specs/truth/data/data-model.dbml` 為 truth 約束。
- **執行模型：所有實作與測試任務（含 Foundational、Phase 3、Phase 4、Phase 5 與各 review）一律派給 `model: sonnet` 的 subagent；主 session 只做協調與 review。**
- 回歸底線（SC-205）：沒有同伴時，001 的全部既有測試維持通過。任何任務不得為了讓新 feature 通過而改動 001 既有 feature、既有 DSL 語意或既有 Example；既有 stepdef 只有 Phase 3 點名的 `[BDD-ALIGN]` 可以動。
- 新增畫面定位點一律補在 `tests/support/UI-HOOKS.md`（Phase 3 的 web 任務負責），GREEN 階段 `src/ui/**` 必須提供。

## Phase 1: Setup

（省略：本輪沒有新增技術，見 `truth-delta.md` `/technical-research` NOOP。）

## Phase 2: Foundational

**Goal**: 只建立兩人合併所需的型別、版本常數、測試世界容器與 stepdef 落點，讓 Phase 3 不各自發明資料格式。不放任何行為。

- [x] T001 擴充 domain 型別與合併函式殼
  - Read:
    - `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload、merged_film_preferences、merged_constraints、single_side_counts、ticket_list_items.ticket_quantity
    - `truth-delta.md` -> `/data-plan` 全部列
    - `src/domain/types.ts`
  - 只做：`src/domain/types.ts` 的 `UserState` 加入選配 `self_name`、`partner`（`display_name`、`daily_limit`、`film_preferences`、`unavailable_slots`）；新增 `ShareKind`（`personal` | `merged`）、`SharePayload`、`MergedView` 型別；`ticket_list_items` 型別加選配 `ticket_quantity`；新增 `src/domain/merge.ts`，匯出 `mergePartner(...)` 與 `singleSideCounts(...)` 簽章，函式體先 `throw new Error("not implemented")`。
  - 不做：不寫合併邏輯、不改 `src/state/storage.ts` 的驗證與版本行為、不改排程與搶票邏輯。既有型別欄位保持相容，使 001 程式碼仍可編譯。

- [x] T002 在 planner 測試世界加入同伴資料容器
  - Read:
    - `specs/truth/features/planner/dsl.md` -> 介面共通約定（個人／兩人模式）
    - `specs/truth/features/planner/兩人合併/dsl.md` -> 兩人合併定義
    - `tests/support/planner-world.ts`
  - 只做：`planner-world.ts` 加入選配 `partner`（分層、熱門、不可看時段、每日上限）、`lastMerged`（最近一次合併結果）、`baseline`（Given 完成時的雙方設定快照）欄位；加入 `effectiveState(world)` helper 簽章：沒有 partner 回傳自己的使用者狀態，有 partner 回傳合併後的排程輸入（實作先呼叫 `src/domain/merge.ts`）。
  - 不做：不寫任何 stepdef 語意；`effectiveState` 在沒有 partner 時必須原樣回傳，不得改變 001 的 planner 測試行為。

- [x] T003 在 web 測試 fixture 加入兩人模式預載與分享連結種類 helper
  - Read:
    - `specs/truth/features/web/dsl.md` -> 介面共通約定、同伴 Given
    - `specs/truth/features/web/兩人模式/dsl.md` -> 開頭說明
    - `specs/truth/features/web/分享與保存/dsl.md` -> 連結種類說明
    - `tests/support/web-fixtures.ts`、`tests/support/UI-HOOKS.md`
  - 只做：`web-fixtures.ts` 加入「待載入的同伴資料」容器、預載 `self_name`／`partner`（schema_version 2）的 state fixture 選項、自己設定基準快照 helper、以資料編成 `personal`／`merged` 分享連結的 helper（含 001 版本格式連結與 v1 格式保存內容的 helper）、讀取目前本機保存同伴資料的 helper。
  - 不做：不寫任何 stepdef 語意；既有 state fixture 預設行為（沒有同伴）不得改變。

- [x] T004 預留新模組 stepdef 落點
  - Read:
    - `tests/steps/planner/shared.steps.ts`
    - `tests/steps/web/shared.steps.ts`
  - 只做：建立空的 `tests/steps/planner/兩人合併.steps.ts` 與 `tests/steps/web/兩人模式.steps.ts`（只有 import 與檔頭註解）。
  - 不做：不寫 ALIGN / RED 語意；不新增其他檔案。

## Phase 3: Test Alignment & Implementation

**Goal**: 把本輪 Feature 用到的 DSL 自動化測試對齊最新版 truth。ADD 句用 `[BDD-RED]`；MODIFY 句（含語意不變的權威位置搬移）用 `[BDD-ALIGN]`；本輪沒有 DELETE。不寫產品行為。

**DSL 參照**:
- 每一句只屬於一個權威 `dsl.md`：同模組 `specs/truth/features/{介面}/{模組}/dsl.md`，或介面根 `specs/truth/features/{介面}/dsl.md`。不得掃其他模組。
- 讀法：用 task title 的句型對到該檔那一列，以 `StepDef 實作語意` 當作測試程式碼語意。Given / When 讀 `怎麼做`、`權威狀態落地`、`回寫`（web 讀 `使用 fixture`、`Arrange 來源`、`頁面操作`、`等待條件`、`回寫資料`）；Then 讀 `必查`（`呈現結果`、`權威狀態`、`再讀確認`、`不該發生`）。
- `truth-delta.md` 只告訴這句是 ADD / MODIFY。語意以 `dsl.md` 那一列為準，不得用 feature 措辭或舊 stepdef 自行發明。
- planner 介面根句型在 `specs/truth/features/planner/dsl.md`；web 介面根句型在 `specs/truth/features/web/dsl.md`。其餘句型在各自模組 `dsl.md`。

**Markers**:
- `[BDD-ALIGN]`：`MODIFY`。既有 stepdef 還在，但語意是舊 truth（或位置搬移）。依 `dsl.md` 該列改測試，讓它表達最新版 `StepDef 實作語意`；沒有同伴時行為必須與改動前完全相同。
- `[BDD-RED]`：`ADD`。依 `dsl.md` 該列寫出 stepdef。完成時這句可被跑到，失敗只能是 assertion 或產品行為（例如 `src/domain/merge.ts` 丟出 not implemented），不能是 undefined step。
- 本輪沒有 `[BDD-REMOVE]`。三個 marker 都只動測試層，不寫產品碼。

**Shared Must Read**:
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、同伴 Given、`觀眾執行排程`、`觀眾已執行排程並開啟搶票清單`、`行程中沒有`、`行程沒有任何場次`
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部列
- `specs/truth/features/planner/搶票順序與備案/dsl.md` -> `觀眾執行排程並開啟搶票清單`
- `specs/truth/features/planner/搶票切換/dsl.md` -> `標記為沒搶到`、`觀眾重新排程`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、同伴 Given
- `specs/truth/features/web/兩人模式/dsl.md` -> 全部列
- `specs/truth/features/web/行程/dsl.md` -> 單方標記統計兩列
- `specs/truth/features/web/搶票/dsl.md` -> 張數兩列
- `specs/truth/features/web/分享與保存/dsl.md` -> 連結種類說明與全部新增／改動列
- `truth-delta.md` -> `/dsl-refine` 全部 ADD / MODIFY 列
- `tests/support/**`

**Boundary**:
- 一條 DSL 一個 task。
- 只改該句的 stepdef / assertion / 直接依賴的 helper；寫進 task 指定的 steps 檔。web 句若需要新定位點，補在 `tests/support/UI-HOOKS.md`。
- 不寫產品碼（`src/**`）。
- review 啟動 subagent；本輪所有 Test Scope 不得再有 undefined step，失敗只能是 assertion 或產品行為；既有 001 feature 不得因 ALIGN 而新增失敗（用沒有同伴的路徑跑 `bddgen` 與既有 planner／web feature 確認）。有 issues 就修正再 review，直到沒有任何問題。通過前不解鎖 Phase 4。


**Parallel Hint**:
- T005–T068 依 steps 檔分組派給 sonnet subagent（同一 steps 檔的句由同一個 subagent 依序完成，避免同檔衝突）；T069 等全部回來再啟動 subagent 來 review。


#### planner/（介面根） → `tests/steps/planner/shared.steps.ts`

- [x] T005 [P] [BDD-RED] `Given: 同伴的分層如下：`
- [x] T006 [P] [BDD-RED] `Given: 同伴已設定不可看時段如下：`
- [x] T007 [P] [BDD-RED] `Given: 同伴的每日上限已設為 {上限} 部`
- [x] T008 [P] [BDD-ALIGN] `When: 觀眾執行排程`
  - Read: `tests/steps/planner/shared.steps.ts`
- [x] T009 [P] [BDD-ALIGN] `Given: 觀眾已執行排程並開啟搶票清單`
  - Read: `tests/steps/planner/shared.steps.ts`
- [x] T010 [P] [BDD-ALIGN] `Then: 行程中沒有 "{片名}"`（權威位置由最佳行程上提到介面根，語意不變）
  - Read: `tests/steps/planner/最佳行程.steps.ts`（搬到 `shared.steps.ts`）
- [x] T011 [P] [BDD-ALIGN] `Then: 行程沒有任何場次`（權威位置由最佳行程上提到介面根，語意不變）
  - Read: `tests/steps/planner/最佳行程.steps.ts`（搬到 `shared.steps.ts`）

#### planner/兩人合併 → `tests/steps/planner/兩人合併.steps.ts`

- [x] T012 [P] [BDD-RED] `When: 觀眾查看兩人合併結果`
- [x] T013 [P] [BDD-RED] `Then: 合併後參與排程的影片如下：`
- [x] T014 [P] [BDD-RED] `Then: 合併後的不可看時段如下：`
- [x] T015 [P] [BDD-RED] `Then: 合併後的每日上限為 "{上限}"`
- [x] T016 [P] [BDD-RED] `Then: 單方標記的影片數如下：`
- [x] T017 [P] [BDD-RED] `Then: 雙方原始設定與合併前相同`

#### planner/搶票順序與備案 → `tests/steps/planner/搶票順序與備案.steps.ts`

- [x] T018 [P] [BDD-ALIGN] `When: 觀眾執行排程並開啟搶票清單`
  - Read: `tests/steps/planner/搶票順序與備案.steps.ts`

#### planner/搶票切換 → `tests/steps/planner/搶票切換.steps.ts`

- [x] T019 [P] [BDD-ALIGN] `When: 觀眾把 "{片名}" 的 "{場次}" 場次標記為沒搶到`
  - Read: `tests/steps/planner/搶票切換.steps.ts`
- [x] T020 [P] [BDD-ALIGN] `When: 觀眾重新排程`
  - Read: `tests/steps/planner/搶票切換.steps.ts`

#### web/（介面根） → `tests/steps/web/shared.steps.ts`

- [x] T021 [P] [BDD-RED] `Given: 同伴的分層如下：`
- [x] T022 [P] [BDD-RED] `Given: 同伴已設定不可看時段如下：`
- [x] T023 [P] [BDD-RED] `Given: 同伴的每日上限已設為 {上限} 部`
- [x] T024 [P] [BDD-RED] `Given: 觀眾已加入同伴，自己名稱為 "{自己}"、同伴名稱為 "{同伴}"`

#### web/兩人模式 → `tests/steps/web/兩人模式.steps.ts`

- [x] T025 [P] [BDD-RED] `Given: 同伴傳來個人分享連結，同伴名稱為 "{名稱}"`
- [x] T026 [P] [BDD-RED] `Given: 同伴傳來個人分享連結`
- [x] T027 [P] [BDD-RED] `Given: 同伴傳來的個人分享連結內容已損毀`
- [x] T028 [P] [BDD-RED] `Given: 觀眾已開啟同伴的個人分享連結`
- [x] T029 [P] [BDD-RED] `Given: 觀眾已選擇當作同伴加入`
- [x] T030 [P] [BDD-RED] `When: 觀眾開啟同伴的個人分享連結`
- [x] T031 [P] [BDD-RED] `When: 觀眾選擇當作同伴加入`
- [x] T032 [P] [BDD-RED] `When: 觀眾選擇取代我的設定`
- [x] T033 [P] [BDD-RED] `When: 觀眾輸入自己名稱 "{自己}"、同伴名稱 "{同伴}" 並確認`
- [x] T034 [P] [BDD-RED] `When: 觀眾確認取代同伴`
- [x] T035 [P] [BDD-RED] `When: 觀眾移除同伴並確認`
- [x] T036 [P] [BDD-RED] `When: 觀眾切到 "{頁面}" 頁`
- [x] T037 [P] [BDD-RED] `Then: 畫面顯示個人連結對話 "{標題}"`
- [x] T038 [P] [BDD-RED] `Then: 畫面要求輸入自己與同伴的名稱，預設為 "{自己}" 與 "{同伴}"`
- [x] T039 [P] [BDD-RED] `Then: 畫面顯示取代同伴確認 "{確認}"`
- [x] T040 [P] [BDD-RED] `Then: 頂部顯示 "{橫幅}"`
- [x] T041 [P] [BDD-RED] `Then: 頂部不顯示兩人模式`
- [x] T042 [P] [BDD-RED] `Then: 此裝置沒有同伴資料`
- [x] T043 [P] [BDD-RED] `Then: 已保存的同伴分層如下：`
- [x] T044 [P] [BDD-RED] `Then: 已保存的同伴不可看時段如下：`
- [x] T045 [P] [BDD-RED] `Then: 已保存的同伴每日上限為 "{上限}"`
- [x] T046 [P] [BDD-RED] `Then: 自己已保存的分層如下：`
- [x] T047 [P] [BDD-RED] `Then: 自己的分層、不可看時段與每日上限維持加入前的內容`
- [x] T048 [P] [BDD-RED] `Then: 已保存的搶票標記如下：`

#### web/行程 → `tests/steps/web/行程.steps.ts`

- [x] T049 [P] [BDD-RED] `Then: 行程頁頂部顯示單方標記統計 "{統計}"`
- [x] T050 [P] [BDD-RED] `Then: 行程頁不顯示單方標記統計`

#### web/搶票 → `tests/steps/web/搶票.steps.ts`

- [x] T051 [P] [BDD-RED] `Then: 搶票清單每列顯示 "{張數}"`
- [x] T052 [P] [BDD-RED] `Then: 搶票清單不顯示張數`

#### web/分享與保存 → `tests/steps/web/分享與保存.steps.ts`

- [x] T053 [P] [BDD-ALIGN] `Then: 手機畫面顯示確認 "{確認}"`
  - Read: `tests/steps/web/分享與保存.steps.ts`
- [x] T054 [P] [BDD-ALIGN] `When: 觀眾用手機開啟該分享連結並確認取代`
  - Read: `tests/steps/web/分享與保存.steps.ts`
- [x] T055 [P] [BDD-ALIGN] `Given: 手機已用分享連結匯入設定`
  - Read: `tests/steps/web/分享與保存.steps.ts`
- [x] T056 [P] [BDD-ALIGN] `Given: 電腦上已產生分享連結`
  - Read: `tests/steps/web/分享與保存.steps.ts`
- [x] T057 [P] [BDD-ALIGN] `Then: 手機的搶票清單與電腦完全相同（順序、排定場次、備案場次）`
  - Read: `tests/steps/web/分享與保存.steps.ts`
- [x] T058 [P] [BDD-RED] `Given: 電腦上已產生合併結果連結`
- [x] T059 [P] [BDD-RED] `Given: 手機已用合併結果連結取代並開啟`
- [x] T060 [P] [BDD-RED] `Given: 裝置上保存的是 001 版本格式的設定，分層如下：`
- [x] T061 [P] [BDD-RED] `Given: 手機收到 001 版本格式的個人分享連結`
- [x] T062 [P] [BDD-RED] `When: 觀眾用手機開啟該分享連結並選擇取代並開啟`
- [x] T063 [P] [BDD-RED] `Then: 手機畫面的分享連結選項為 "{選項}"`
- [x] T064 [P] [BDD-RED] `Then: 分享畫面標示為合併結果連結，並提供 QR code 與「複製連結」`
- [x] T065 [P] [BDD-RED] `Then: 手機畫面顯示合併結果確認 "{確認}"`
- [x] T066 [P] [BDD-RED] `Then: 手機進入兩人模式並顯示 "{橫幅}"`
- [x] T067 [P] [BDD-RED] `Then: 手機的行程與電腦完全相同`
- [x] T068 [P] [BDD-RED] `Then: 重新開啟後仍為兩人模式並顯示 "{橫幅}"`

- [x] T069 subagent review (phase quality gate)

## Phase 4A: ADD Feature File - planner/兩人合併/共同影片與層級合併.feature

**Goal**: 以最小合併邏輯（`src/domain/merge.ts`：共同影片、層級取高、熱門任一、單方標記計數、忽略快照沒有的影片）讓此 feature file 全綠。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/共同影片與層級合併.feature` -> `Feature: 共同影片與層級合併`
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部 Given／When／Then 列與「兩人合併定義」
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、同伴 Given、`觀眾執行排程`
- `truth-delta.md` -> `/dsl-refine` ADD `planner/兩人合併`、`planner/dsl.md` 同伴 Given
- `specs/truth/data/data-model.dbml` -> user_state、partner 系列、merged_film_preferences、merged_constraints、single_side_counts、ticket_list_items.ticket_quantity

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴時（個人模式）行為與輸出必須與改動前完全相同（SC-205），不得改動 001 既有 feature 與 DSL 語意。 本 phase 實作 `mergePartner` 與 `singleSideCounts`。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/共同影片與層級合併.feature`（project：planner）

- [x] T070 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T071 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4B: ADD Feature File - planner/兩人合併/不可看時段與每日上限合併.feature

**Goal**: 補上合併不可看時段（聯集）與合併每日上限（有設定者最小、皆無則不設）。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/不可看時段與每日上限合併.feature` -> `Feature: 不可看時段與每日上限合併`
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部 Given／When／Then 列與「兩人合併定義」
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、同伴 Given、`觀眾執行排程`
- `truth-delta.md` -> `/dsl-refine` ADD `planner/兩人合併`
- `specs/truth/data/data-model.dbml` -> user_state、partner 系列、merged_film_preferences、merged_constraints、single_side_counts、ticket_list_items.ticket_quantity

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴時（個人模式）行為與輸出必須與改動前完全相同（SC-205），不得改動 001 既有 feature 與 DSL 語意。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/不可看時段與每日上限合併.feature`（project：planner）

- [x] T072 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T073 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4C: ADD Feature File - planner/兩人合併/兩人合併排程.feature

**Goal**: 讓排程引擎在有同伴資料時以合併結果為輸入（共同影片、合併層級、合併不可看時段與每日上限），無同伴時路徑不變。

**Shared Must Read**:
- `specs/truth/features/planner/兩人合併/兩人合併排程.feature` -> `Feature: 兩人合併排程`
- `specs/truth/features/planner/兩人合併/dsl.md` -> 全部 Given／When／Then 列
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、同伴 Given、`觀眾執行排程`
- `truth-delta.md` -> `/dsl-refine` ADD `planner/兩人合併`、MODIFY `planner/dsl.md` `觀眾執行排程`、上提的 `行程中沒有`／`行程沒有任何場次`
- `specs/truth/data/data-model.dbml` -> user_state、partner 系列、merged_film_preferences、merged_constraints、single_side_counts、ticket_list_items.ticket_quantity

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴時（個人模式）行為與輸出必須與改動前完全相同（SC-205），不得改動 001 既有 feature 與 DSL 語意。 排程演算法本身不改，只改輸入組裝。

**Test Scope**:
- `specs/truth/features/planner/兩人合併/兩人合併排程.feature`（project：planner）

- [x] T074 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T075 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4D: ADD Feature File - planner/搶票順序與備案/兩人搶票清單.feature

**Goal**: 讓搶票順序與備案以合併層級、合併熱門、合併不可看時段與合併每日上限計算，並輸出 `ticket_quantity`（兩人 = 2）。

**Shared Must Read**:
- `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature` -> `Feature: 兩人搶票清單`
- `specs/truth/features/planner/搶票順序與備案/dsl.md` -> 全部 Given／When／Then 列（本輪改動：`觀眾執行排程並開啟搶票清單`）
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、同伴 Given、`觀眾執行排程`
- `truth-delta.md` -> `/dsl-refine` ADD `planner/搶票順序與備案/兩人搶票清單.feature`、MODIFY `觀眾執行排程並開啟搶票清單`
- `specs/truth/data/data-model.dbml` -> user_state、partner 系列、merged_film_preferences、merged_constraints、single_side_counts、ticket_list_items.ticket_quantity

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴時（個人模式）行為與輸出必須與改動前完全相同（SC-205），不得改動 001 既有 feature 與 DSL 語意。

**Test Scope**:
- `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature`（project：planner）

- [x] T076 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T077 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4E: ADD Feature File - planner/搶票切換/兩人沒搶到切換備案.feature

**Goal**: 讓沒搶到換備案與重新排程在有同伴時使用合併條件（同伴不可看時段內的場次不得成為備案）。

**Shared Must Read**:
- `specs/truth/features/planner/搶票切換/兩人沒搶到切換備案.feature` -> `Feature: 兩人沒搶到切換備案`
- `specs/truth/features/planner/搶票切換/dsl.md` -> `標記為沒搶到`、`觀眾重新排程`與 Then 列
- `specs/truth/features/planner/dsl.md` -> 介面共通約定、同伴 Given、`觀眾執行排程`
- `truth-delta.md` -> `/dsl-refine` ADD `planner/搶票切換/兩人沒搶到切換備案.feature`、MODIFY `標記為沒搶到`、`觀眾重新排程`
- `specs/truth/data/data-model.dbml` -> user_state、partner 系列、merged_film_preferences、merged_constraints、single_side_counts、ticket_list_items.ticket_quantity

**Boundary**:
- 只讓此 Test Scope 全綠；`src/domain` 維持純函式、不依賴 React 與瀏覽器 API；輸出可重現。沒有同伴時（個人模式）行為與輸出必須與改動前完全相同（SC-205），不得改動 001 既有 feature 與 DSL 語意。

**Test Scope**:
- `specs/truth/features/planner/搶票切換/兩人沒搶到切換備案.feature`（project：planner）

- [x] T078 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T079 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4F: ADD Feature File - web/兩人模式/加入同伴.feature

**Goal**: 實作分享連結的個人連結對話（三選項）、當作同伴加入（名稱輸入、不改自己設定、同伴資料另存）、取代我的設定、連結損毀處理；寫入 schema_version 2。

**Shared Must Read**:
- `specs/truth/features/web/兩人模式/加入同伴.feature` -> `Feature: 加入同伴`
- `specs/truth/features/web/兩人模式/dsl.md` -> 全部 Given／When／Then 列與開頭說明
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/兩人模式`
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程、驗證與錯誤回饋
- `specs/plans/001-ghff-solo-planner/ui/share.html` -> 分享畫面既有樣式（對話沿用，不新增雛形）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。 本 phase 實作 `src/ui/ImportPage.tsx` 對話、`src/state/share.ts` 的 personal 種類與 `src/state/storage.ts` 的 partner／self_name 保存；v1 狀態必須仍可載入為個人模式。

**Test Scope**:
- `specs/truth/features/web/兩人模式/加入同伴.feature`（project：web-desktop、web-mobile）

- [x] T080 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T081 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4G: ADD Feature File - web/兩人模式/取代與移除同伴.feature

**Goal**: 實作已有同伴時的取代確認、取代後同伴資料換新、移除同伴（確認、刪同伴資料與名稱、保留自己設定與搶票標記）。

**Shared Must Read**:
- `specs/truth/features/web/兩人模式/取代與移除同伴.feature` -> `Feature: 取代與移除同伴`
- `specs/truth/features/web/兩人模式/dsl.md` -> 全部 Given／When／Then 列與開頭說明
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/兩人模式`
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程、驗證與錯誤回饋

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。

**Test Scope**:
- `specs/truth/features/web/兩人模式/取代與移除同伴.feature`（project：web-desktop、web-mobile）

- [x] T082 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T083 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4H: ADD Feature File - web/兩人模式/兩人模式橫幅.feature

**Goal**: 實作五個分頁共用的頂部橫幅「兩人模式：{自己} ＋ {同伴}」與「移除同伴」入口；個人模式不顯示。

**Shared Must Read**:
- `specs/truth/features/web/兩人模式/兩人模式橫幅.feature` -> `Feature: 兩人模式橫幅`
- `specs/truth/features/web/兩人模式/dsl.md` -> `頂部顯示`、`頂部不顯示兩人模式`、`觀眾切到 … 頁`
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/兩人模式`
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、視覺方向、五個畫面的共同版面

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。 橫幅放在 `src/ui/App.tsx` 的共同版面，不要在各頁複製。

**Test Scope**:
- `specs/truth/features/web/兩人模式/兩人模式橫幅.feature`（project：web-desktop、web-mobile）

- [x] T084 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T085 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4I: ADD Feature File - web/行程/兩人行程.feature

**Goal**: 讓行程頁在兩人模式下以合併結果排程，頂部顯示單方標記統計，空狀態顯示「兩人沒有共同標記的片，先到選片頁一起挑」。

**Shared Must Read**:
- `specs/truth/features/web/行程/兩人行程.feature` -> `Feature: 兩人行程`
- `specs/truth/features/web/行程/dsl.md` -> `行程頁頂部顯示單方標記統計`、`行程頁不顯示單方標記統計` 與本檔用到的既有列
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/行程/兩人行程.feature`、`web/行程/dsl.md` 單方標記統計兩列
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/itinerary.html` -> 行程頁既有樣式（統計列沿用摘要樣式，不新增雛形）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。

**Test Scope**:
- `specs/truth/features/web/行程/兩人行程.feature`（project：web-desktop、web-mobile）

- [x] T086 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T087 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4J: ADD Feature File - web/行程/兩人行程的時段與上限.feature

**Goal**: 確認行程頁在兩人模式下使用合併不可看時段與合併每日上限（產品碼多半已由 4C、4I 具備，本 phase 補缺口）。

**Shared Must Read**:
- `specs/truth/features/web/行程/兩人行程的時段與上限.feature` -> `Feature: 兩人行程的時段與上限`
- `specs/truth/features/web/行程/dsl.md` -> 本檔用到的既有列
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/行程/兩人行程的時段與上限.feature`
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「行程」畫面與流程

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。

**Test Scope**:
- `specs/truth/features/web/行程/兩人行程的時段與上限.feature`（project：web-desktop、web-mobile）

- [x] T088 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T089 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4K: ADD Feature File - web/搶票/兩人搶票清單.feature

**Goal**: 實作搶票清單兩人模式每列「買 2 張」；個人模式不顯示；順序與備案來自合併結果。

**Shared Must Read**:
- `specs/truth/features/web/搶票/兩人搶票清單.feature` -> `Feature: 兩人搶票清單`
- `specs/truth/features/web/搶票/dsl.md` -> `搶票清單每列顯示`、`搶票清單不顯示張數` 與本檔用到的既有列
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/搶票/兩人搶票清單.feature`、`web/搶票/dsl.md` 張數兩列
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「搶票」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/tickets.html` -> 搶票列既有樣式（張數沿用標籤樣式，不新增雛形）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。 張數文字以 `ticket_quantity` 驅動，不另行判斷模式。

**Test Scope**:
- `specs/truth/features/web/搶票/兩人搶票清單.feature`（project：web-desktop、web-mobile）

- [x] T090 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T091 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4L: MODIFY Feature File - web/分享與保存/跨裝置分享.feature

**Goal**: 個人分享連結的接收對話改為三選項（當作同伴加入、取代我的設定、取消）；既有 Rule 與 Example 全部維持通過。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/跨裝置分享.feature` -> `Feature: 跨裝置分享`
- `specs/truth/features/web/分享與保存/dsl.md` -> 全部 Given／When／Then 列（本輪改動列：`手機畫面顯示確認`、`並確認取代`、`匯入設定`、`電腦上已產生分享連結`、`手機的搶票清單與電腦完全相同`、`手機畫面的分享連結選項為`）
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` MODIFY `web/分享與保存/跨裝置分享.feature` 與 dsl 列
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程、驗證與錯誤回饋
- `specs/plans/001-ghff-solo-planner/ui/share.html` -> 分享畫面與接收對話既有樣式

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。 只改接收對話與其選項，不改既有 Rule 的結果；`取代我的設定` 的行為與 001 的取代完全相同。

**Test Scope**:
- `specs/truth/features/web/分享與保存/跨裝置分享.feature`（project：web-desktop、web-mobile）

- [x] T092 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T093 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4M: ADD Feature File - web/分享與保存/合併結果分享.feature

**Goal**: 兩人模式產生合併結果連結（含兩人資料、名稱、手動順序、搶票標記）、接收端對話只提供取代並開啟與取消、取代後進入兩人模式且行程與搶票清單一致、重開仍保留。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/合併結果分享.feature` -> `Feature: 合併結果分享`
- `specs/truth/features/web/分享與保存/dsl.md` -> 合併結果相關 Given／When／Then 列與連結種類說明
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/分享與保存/合併結果分享.feature` 與 dsl 合併結果句型
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、「分享」畫面與流程
- `specs/plans/001-ghff-solo-planner/ui/share.html` -> 分享畫面既有樣式（加上「合併結果連結」標示）

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。 合併結果連結的內容種類為 `merged`；接收端不得出現「當作同伴加入」。

**Test Scope**:
- `specs/truth/features/web/分享與保存/合併結果分享.feature`（project：web-desktop、web-mobile）

- [x] T094 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T095 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4N: ADD Feature File - web/分享與保存/兩人設定保存.feature

**Goal**: 兩人名稱與同伴資料與使用者狀態一起保存，重新開啟後仍為兩人模式（多半已由 4F 具備，本 phase 補缺口）。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/兩人設定保存.feature` -> `Feature: 兩人設定保存`
- `specs/truth/features/web/分享與保存/dsl.md` -> `重新開啟後仍為兩人模式並顯示` 與本檔用到的既有列
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/分享與保存/兩人設定保存.feature`
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、視覺方向

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。

**Test Scope**:
- `specs/truth/features/web/分享與保存/兩人設定保存.feature`（project：web-desktop、web-mobile）

- [x] T096 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T097 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4O: ADD Feature File - web/分享與保存/舊版相容.feature

**Goal**: 確認 schema_version 1 的本機保存與 001 版本產生的分享連結仍可載入為個人模式／個人分享連結。

**Shared Must Read**:
- `specs/truth/features/web/分享與保存/舊版相容.feature` -> `Feature: 舊版相容`
- `specs/truth/features/web/分享與保存/dsl.md` -> `裝置上保存的是 001 版本格式的設定`、`手機收到 001 版本格式的個人分享連結` 與本檔用到的既有列
- `specs/truth/features/web/dsl.md` -> 介面共通約定、本檔用到的介面根共用列（同伴 Given、`觀眾已加入同伴 …`）
- `truth-delta.md` -> `/dsl-refine` ADD `web/分享與保存/舊版相容.feature` 與 dsl 兩列
- `specs/truth/data/data-model.dbml` -> user_state、partner、partner_film_preferences、partner_unavailable_slots、share_payload
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、視覺方向

**Boundary**:
- 只讓此 Test Scope 全綠；畫面必須延續 001 的視覺方向（沿用既有 `src/ui/styles.css` 的色彩、元件與間距，不新增雛形）；排程與合併一律呼叫 `src/domain`，不得在畫面重寫合併或排程邏輯；手機 390px 不得水平捲動。沒有同伴時所有畫面與 001 完全相同（SC-205）。 讀取接受 1 與 2、寫入一律 2；高於 2 仍視為版本不符，顯示 001 的錯誤訊息。

**Test Scope**:
- `specs/truth/features/web/分享與保存/舊版相容.feature`（project：web-desktop、web-mobile）

- [x] T098 [BDD-GREEN] 讓 Test Scope 全綠
- [x] T099 [BDD-REFACTOR] 在綠燈下整理此 feature 的產品碼與測試 helper

## Phase 4Z: ui quality gate

**Goal**: 產品對齊本輪回追到的 plan-side 產物（001 `ui/ui-plan.md` 視覺方向；本 plan 沒有新雛形）。`Test Scope` 全綠不能代替本題。

**Read**:
- `specs/plans/001-ghff-solo-planner/ui/ui-plan.md` -> 視覺方向、驗證與錯誤回饋、五個畫面的流程
- `specs/plans/001-ghff-solo-planner/ui/styles.css`（色彩、元件、間距基準）
- `src/ui/`（尤其 `App.tsx` 兩人模式橫幅、`ImportPage.tsx` 個人連結／合併結果對話、`ItineraryPage.tsx` 單方標記統計與空狀態、`TicketsPage.tsx` 「買 2 張」、`SharePage.tsx` 合併結果標示）

**Boundary**:
- 不改 truth、不加 feature、不重跑 GREEN 當通過條件。
- 檢查新增元素（橫幅、三選項／兩選項對話、名稱輸入畫面、取代／移除確認、統計列、張數標籤）沿用既有 token 與元件樣式，沒有另創視覺語言；手機 390px 走完 加入同伴 → 行程 → 搶票 → 分享 不需水平捲動；個人模式畫面與 001 一致（無橫幅、無張數、無統計）。
- 已知 001 雛形瑕疵不照抄：時間輸入用 24 小時制；無備案時顯示「無不衝堂備案」；標籤多時排序按鈕不換行。

- [x] T100 subagent review (ui quality gate)

## Phase 5: 完整回歸（SC-205）

**Goal**: 跑完整套件，證明沒有同伴時 001 的全部既有測試維持通過，且本輪新增的 planner 與 web feature 全綠。

**Read**:
- `specs/truth/features/planner/**`、`specs/truth/features/web/**`、`specs/truth/features/scraper/**` -> 全部 feature
- `playwright.config.ts` -> projects（planner、scraper、web-desktop、web-mobile）

**Boundary**:
- 不改 truth、不改 feature；只修產品碼或測試 helper 中的真實缺陷。
- 任何 001 既有 Example 失敗都視為本輪迴歸，必須修產品碼，不得改既有 feature、DSL 或把既有 stepdef 放寬成可通過。

- [x] T101 [REGRESSION] 執行 `npx tsc --noEmit` 與 `npm run build`，確認型別與靜態建置通過
- [x] T102 [REGRESSION] 執行完整套件 `npm test`（`bddgen && playwright test`，四個 project：planner、scraper、web-desktop、web-mobile），全部 feature 通過；記錄總 Example 數與失敗數（失敗數必須為 0）
- [x] T103 subagent review (full regression gate)：獨立重跑完整套件一次，並抽查 001 的 `分享與保存/跨裝置分享.feature`、`搶票/搶票標記與切換備案.feature`、`行程/行程呈現.feature` 在個人模式下通過
