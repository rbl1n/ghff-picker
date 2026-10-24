# Truth Delta: 004-ghff-duo-ticket-division

**Plan Package**: `specs/plans/004-ghff-duo-ticket-division`
**Truth Root**: `specs/truth`

> 本 plan 修改既有 truth（001～003 已建立）；流程依 003 精簡：略過 `/system-analysis` 與 `/ui-plan`。
>
> 高影響 MODIFY 的決策依據：spec.md「對既有 truth 的影響」表與 Clarify Round 1（CL-401 輪流分配、CL-402 共用順序、CL-403 不即時同步、CL-404 每筆最多 2 張）。已知的行為變化：
> 1. 003 FR-312「兩人模式搶票清單列本裝置使用者行程中的全部場次」改為只列分給本人的場次；因此 003 中「以觀眾自己的層級與自己標的熱門計算」兩個 Example（planner、web 各兩個，共四個）改由 `兩人分工.feature` 的整體順序 Example 取代（熱門改為取兩人任一人）。
> 2. 001 FR-016「兩人模式可手動調整」改為只在個人模式提供；`合併結果分享.feature` 中依賴手動順序的 Example 去掉手動順序。
> 3. 名字相同時的決勝（spec 邊界情況）：spec 原案「影片順序最前的一起看片給匯出連結較早的一方」需要連結時間，兩台裝置上不一定一致；改為比兩人設定的序列化指紋（不含搶票標記與手動順序），指紋也相同則兩人完全對稱。已寫入 `搶票順序與備案/dsl.md`「兩人分工定義」。

## /technical-research

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/techstack.md` | 已檢查：分工是純函式，沿用 TypeScript、React、localStorage、playwright-bdd；不引入新套件 | CL-403（不即時同步）、CL-404 |

## /api-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/contracts/**` | 已檢查：無後端 API | CL-202、CL-009 |

## /data-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `specs/truth/data/data-model.dbml` -> `ticket_division_items` | 衍生實體（不保存）：片、參與者、負責人、整體順序、清單名次、張數、目前場次、備案 | FR-401～FR-406 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `ticket_list_items` Note、`user_state` Note | 兩人模式的搶票清單 = 分工表中分給本人的列；手動順序只在個人模式有效；標記可標在任一人的列、仍存本機 | FR-312 → FR-403、FR-404、FR-407、FR-409 |
| NOOP | `user_state.schema_version` | 維持 3；沒有新增保存欄位，分享連結格式不變 | FR-409 |

## /dsl-refine

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `planner/dsl.md` Given `兩人名稱為 "{觀眾名稱}" 與 "{同伴名稱}"` | 名字用於分工決勝與摘要 | FR-403 |
| MODIFY | `planner/dsl.md` Given `觀眾已執行排程並開啟搶票清單`；兩人模式說明 | 兩人模式搶票清單 = 分工表中分給觀眾的列；分工不套用手動順序 | FR-312 → FR-403 |
| ADD | `planner/搶票順序與備案/dsl.md`「兩人分工定義」 | 項目、整體順序、分配、名字相同決勝、與本裝置身分無關 | FR-401～FR-404 |
| MODIFY | `planner/搶票順序與備案/dsl.md` When `觀眾執行排程並開啟搶票清單`；Then `搶票清單的購票張數如下：`、`"{片名}" 不在搶票清單`、`搶票清單的備案場次如下：` | 兩人模式的清單範圍與找列規則 | FR-403、FR-407 |
| ADD | 同上 Given `觀眾的手動順序已設為`；Then `整體搶票順序如下：`、`兩人分工表如下：`、`分工摘要為`、`互換身分後兩人的分工表相同` | 分工驗證句型 | FR-402～FR-406 |
| MODIFY | `planner/搶票切換/dsl.md` | 兩人模式的列可在任一人的清單 | FR-407 |
| ADD | `web/搶票/dsl.md` Given `觀眾正在看搶票頁的 "{分頁}" 分頁`；When `觀眾切換到搶票頁的 "{分頁}" 分頁`；Then 分頁、目前分頁列、摘要、狀態、無分頁、調整控制項、空訊息、44px、對方裝置 | 搶票頁分頁與分工列 | FR-405～FR-409 |
| MODIFY | `web/搶票/dsl.md` Then `搶票清單的購票張數如下：`、`搶票清單沒有 "{片名}"` | 範圍改為目前分頁 | FR-405 |
| MODIFY | `web/分享與保存/dsl.md` Then `手機的搶票清單與電腦完全相同…` | 清單只含分給自己的場次 | FR-403 |
| ADD | `web/dsl.md`「005 兩人搶票分工」；`tests/support/UI-HOOKS.md` | 定位點 | FR-405、FR-406 |

## /gherkin-and-dsl

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `planner/搶票順序與備案/兩人分工.feature` | 4 個 Rule、14 個 Example（整體順序 5、分配 5、摘要 1、決定性 3；含 spec 範例） | FR-402～FR-404、FR-406 |
| MODIFY | `planner/搶票順序與備案/兩人搶票清單.feature` | Rule 1 改為「我的順序」；刪除「以觀眾自己的層級與熱門計算」Rule（2 個 Example，併入整體順序） | FR-312 → FR-403 |
| ADD | `planner/搶票切換/兩人沒搶到切換備案.feature` Rule「同伴順序上的片也能標記」 | 1 個 Example | FR-407 |
| ADD | `web/搶票/兩人分工表.feature` | 9 個 Rule：分頁、各分頁列、一起看只在負責人、摘要、對方裝置、無手動調整、空清單、個人模式、手機尺寸 | FR-405、FR-406、FR-408 |
| ADD | `web/搶票/兩人分工標記.feature` | 換備案、已無可用場次、在同伴順序標記 | FR-407、FR-409 |
| MODIFY | `web/搶票/兩人搶票清單.feature` | Rule 1 改為「我的順序」；刪除熱門排序 Rule（2 個 Example） | FR-312 → FR-403 |
| MODIFY | `web/分享與保存/合併結果分享.feature` | 搶票清單一致的 Example 去掉手動順序 | FR-016 兩人模式不提供手動 |
| NOOP | `web/使用說明/**` | 第 4 步只補一句說明文字，標題與步驟數不變，Example 不斷言內文 | 使用說明 |
