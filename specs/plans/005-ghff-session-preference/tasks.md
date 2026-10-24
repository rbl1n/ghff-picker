# Tasks: 005-ghff-session-preference

**Plan Package**: `specs/plans/005-ghff-session-preference`
**Truth Root**: `specs/truth`

> 輕量流程（略過 `/system-analysis`、`/ui-plan`）。測試位置：planner `tests/steps/planner/場次偏好.steps.ts`，web `tests/steps/web/場次偏好.steps.ts`；UI 定位點見 `tests/support/UI-HOOKS.md`「006 場次偏好與取捨」。

## Foundational

- [x] T501 資料模型：`data-model.dbml` 新增 `session_marks`、`pinned_choices`（user_state、partner）與衍生實體 `tradeoff`；`schema_version` 維持 3
- [x] T502 DSL：`planner/場次偏好/dsl.md`、`web/場次偏好/dsl.md`、`UI-HOOKS.md`
- [x] T503 型別：`types.ts` 新增 `SessionPref`、`PinnedChoice`、`UnscheduledReason.only_session_unfit`、兩個選填欄位

## RED（失敗的測試）

- [x] T504 planner：`場次偏好.steps.ts`；`未排入原因.steps.ts` 認得新原因
- [x] T505 web：`場次偏好.steps.ts`；world／預載狀態新增標記與決定
- [x] T506 確認失敗原因：把 `makeMarkView` 暫時停用後 planner 14 個 Example 失敗（只看、取捨、備案、未排入原因），還原後通過

## GREEN

### planner / 場次偏好
- [x] T507 `優先與只看這場.feature`：優先沒有代價、優先 > ★、優先不犧牲別部片、優先場影片數最大化、只看硬限制與未排入原因、50 部壓力
- [x] T508 `兩人場次偏好.feature`：一起看勝過優先、同伴標記、優先場合計、只看不放寬、同伴未排入原因
- [x] T509 `兩人取捨.feature`、`取捨卡片的出現條件.feature`：卡片內容與差異、選 B／改回、同伴卡片、無差異不顯示、30 部壓力
- [x] T510 `偏好與備案.feature`：優先場在備案最前、只看時備案只含只看

### domain
- [x] T511 `session-marks.ts`（MarkView）；`schedule.ts`：候選過濾、優先場影片數目標、未排入原因；`tickets.ts`、`division.ts`：備案；`tradeoff.ts`：取捨計算與文字

### web
- [x] T512 `場次標記.feature`、`行程優先場.feature`、`取捨卡片.feature`、`取捨卡片的出現條件.feature`
- [x] T513 `PickPage.tsx`（三態控制、提示）、`ItineraryPage.tsx`（優先場小標、取捨卡片）、`store.ts`（標記、決定、簽章、取捨計算）、`storage.ts`（驗證）、`ImportPage.tsx`（同伴帶入）、`styles.css`

## UI Gate

- [x] T514 手機 390：三態控制 ≥ 44px、無水平溢出（`場次標記.feature` 最後一個 Example）
- [x] T515 截圖：`scratchpad/shots011/` 選片卡片（場次標記）與行程頁取捨卡片

## Regression

- [x] T516 `npx tsc --noEmit` 通過
- [x] T517 `npm test`（planner、scraper、web-desktop、web-mobile）全數通過
- [x] T518 `audit_feature_dsl_topology.py` 對 `planner`、`web` 兩個 root 皆 PASS
