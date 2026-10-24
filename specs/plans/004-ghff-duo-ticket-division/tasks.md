# Tasks: 004-ghff-duo-ticket-division

**Plan Package**: `specs/plans/004-ghff-duo-ticket-division`
**Truth Root**: `specs/truth`

> 流程依 003 精簡（略過 `/system-analysis`、`/ui-plan`）。測試位置：planner 用 `tests/steps/planner/**`，web 用 `tests/steps/web/**`；UI 定位點見 `tests/support/UI-HOOKS.md`「005 兩人搶票分工」。

## Foundational

- [x] T401 資料模型：`specs/truth/data/data-model.dbml` 新增衍生實體 `ticket_division_items`，更新 `ticket_list_items` 說明；`schema_version` 維持 3
- [x] T402 DSL：planner 根 `dsl.md` 新增 `兩人名稱為`、更新 `觀眾已執行排程並開啟搶票清單`；`搶票順序與備案/dsl.md` 新增「兩人分工定義」與分工句型；`搶票切換/dsl.md` 補兩人模式找列規則；web `搶票/dsl.md` 新增分頁、摘要、分工列句型
- [x] T403 domain：新增 `src/domain/division.ts` 的 `buildDuoDivision`（整體順序、分配、備案、標記認領）；`tickets.ts` 的 `buildTicketList` 回到個人模式專用；`duo.ts` 排程時不以同伴自己看的場次標記固定自己的行程

## RED（失敗的測試）

- [x] T404 planner：`tests/steps/planner/兩人分工.steps.ts`（整體順序、分工表、摘要、互換身分、名稱、手動順序）；`搶票順序與備案.steps.ts`／`搶票切換.steps.ts` 兩人模式改在分工表中找列
- [x] T405 web：`tests/steps/web/搶票.steps.ts`（分頁、摘要、分工列、標記狀態、無調整控制項、手機尺寸、對方裝置比對）；`web-003-helpers.ts` 引擎對照改為分工表
- [x] T406 確認失敗原因：未接上分工時，兩人模式「我的順序」缺 `ticket-participant`／分頁／摘要；舊的熱門排序兩個 Example 與分工規則衝突（已依 truth-delta 改寫）

## GREEN

### planner / 搶票順序與備案
- [x] T407 `兩人分工.feature`：整體順序（層級取高、熱門取任一人、可看場次以兩人都可看計）、分配、摘要、互換身分、名字相同、手動順序無影響
- [x] T408 `兩人搶票清單.feature`：改為「我的順序」；刪除以觀眾自己熱門計算的 Rule（併入整體順序）

### planner / 搶票切換
- [x] T409 `兩人沒搶到切換備案.feature`：新增同伴順序上的片也能標記

### web / 搶票
- [x] T410 `兩人分工表.feature`：分頁、各分頁列、摘要、對方裝置、無調整控制項、空清單、個人模式、手機尺寸
- [x] T411 `兩人分工標記.feature`：換備案、已無可用場次、在同伴順序標記
- [x] T412 `兩人搶票清單.feature`：改為「我的順序」；刪除熱門排序 Rule
- [x] T413 `合併結果分享.feature`：搶票清單一致的 Example 去掉手動順序（兩人模式不提供）
- [x] T414 `src/ui/TicketsPage.tsx`：分頁、摘要、`ticket-participant`、隱藏手動調整、空狀態；`styles.css`、`Onboarding.tsx` 第 4 步補一句

## UI Gate

- [x] T415 手機 390 寬度：無水平溢出、分頁與按鈕高度 ≥ 44px（`兩人分工表.feature` 最後一個 Example）
- [x] T416 截圖：`scratchpad/shots005/` 搶票「我的順序」與「小美的順序」

## Regression

- [x] T417 `npx tsc --noEmit` 通過
- [x] T418 `npm test`（planner、scraper、web-desktop、web-mobile）全數通過
- [x] T419 `audit_feature_dsl_topology.py` 對 `planner`、`web` 兩個 root 皆 PASS
