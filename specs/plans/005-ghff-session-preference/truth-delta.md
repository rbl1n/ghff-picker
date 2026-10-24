# Truth Delta: 005-ghff-session-preference

**Plan Package**: `specs/plans/005-ghff-session-preference`
**Truth Root**: `specs/truth`

> 輕量流程（依 003／004）：略過 `/system-analysis` 與 `/ui-plan`。決策依據：spec.md Clarify（CL-501 標記、CL-502 只看硬限制、CL-503 優先軟偏好與目標順序、CL-504 取捨卡片與決定）。已知的行為變化：
> 1. 個人排程目標在「層內排序」之後、「★」之前多一項「優先場影片數」；兩人在「一起看」之後、「★」之前多一項。沒有標記時結果與 004 相同。
> 2. 未排入原因多一種「指定場次都排不進去」。
> 3. 備案：有只看標記的片，備案只含只看場次；否則優先場在前。
> 4. 有優先場候選時，場次指派的決定性節點預算由 1,500,000 降為 300,000（優先場影片數的上界很鬆，證明最佳需窮舉）；沒有優先場候選時維持原預算。

## /technical-research

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/techstack.md` | 已檢查：純函式與既有 React／localStorage／playwright-bdd；不引入新套件 | CL-501～CL-504 |

## /api-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/contracts/**` | 已檢查：無後端 API | CL-202 |

## /data-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `data-model.dbml` -> `user_state.session_marks`、`partner.session_marks` | 場次偏好（選填 map） | CL-501、FR-506、FR-511 |
| ADD | `data-model.dbml` -> `user_state.pinned_choices`、`partner.pinned_choices` | 取捨決定（選填 map） | CL-504、FR-515、FR-516 |
| ADD | `data-model.dbml` 註解 -> 衍生實體 `tradeoff` | 取捨（不保存） | FR-512～FR-514 |
| NOOP | `user_state.schema_version` | 維持 3；新欄位皆選填、舊資料與舊連結照常讀入 | FR-506 |

## /dsl-refine

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `planner/場次偏好/dsl.md` | 場次偏好定義（標記、受限、目標、取捨與文字格式）；Given 標記／取捨決定／壓力資料；When 取捨卡片按鈕；Then 優先場影片、取捨卡片、差異、無卡片、計算時間 | FR-504、FR-505、FR-510、FR-512～FR-515 |
| MODIFY | `planner/未排入原因/dsl.md` 原因文字（步驟實作）| 新增 `指定場次都排不進去` | FR-504 |
| ADD | `web/場次偏好/dsl.md` | 畫面約定；Given 標記／決定；When 標記、取捨按鈕、另一台裝置；Then 標記、提示、44px、優先場小標、取捨卡片、決定、另一台一致 | FR-501～FR-503、FR-508、FR-513、FR-515 |
| ADD | `tests/support/UI-HOOKS.md`「006 場次偏好與取捨」 | 定位點 | FR-501～FR-515 |
| MODIFY（上提到介面根，語意不變） | planner 根 `dsl.md` ← `影展場次表為 {影片數} 部…壓力資料`、`排程在 {秒} 秒內完成`（最佳行程）、`觀眾執行排程並開啟搶票清單`、`搶票清單的排定場次如下：`、`搶票清單的備案場次如下：`（搶票順序與備案）、`未排入的必看片與原因如下：`、`兩人未排入的必看片與原因如下：`（未排入原因）、`兩人行程依日期排列如下：`（兩人合併） | 新模組「場次偏好」跨模組使用這些句型；拓樸稽核要求跨模組共用句型放介面根 | 稽核規則 |
| MODIFY（上提到介面根，語意不變） | web 根 `dsl.md` ← `觀眾使用手機尺寸的瀏覽器`（搶票）、`觀眾按下排行程`、`觀眾開啟行程頁`、`觀眾按下重新排程`、`行程頁列出未排入的必看片與原因如下：`（行程） | 同上 | 稽核規則 |

## /gherkin-and-dsl

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| ADD | `planner/場次偏好/優先與只看這場.feature` | 5 個 Rule、10 個 Example（含 50 部壓力） | FR-504、FR-505、NFR-501 |
| ADD | `planner/場次偏好/兩人場次偏好.feature` | 5 個 Rule、5 個 Example | FR-510、FR-511 |
| ADD | `planner/場次偏好/兩人取捨.feature` | 3 個 Rule、4 個 Example | FR-512、FR-513、FR-515 |
| ADD | `planner/場次偏好/取捨卡片的出現條件.feature` | 3 個 Rule、5 個 Example（含兩人 30 部壓力） | FR-512、FR-514、FR-517 |
| ADD | `planner/場次偏好/偏好與備案.feature` | 2 個 Rule、2 個 Example | FR-509 |
| ADD | `web/場次偏好/場次標記.feature` | 4 個 Rule、7 個 Example（含手機 44px） | FR-501～FR-503、FR-506 |
| ADD | `web/場次偏好/行程優先場.feature` | 4 個 Rule、4 個 Example | FR-504、FR-507、FR-508 |
| ADD | `web/場次偏好/取捨卡片.feature` | 4 個 Rule、5 個 Example（含分享連結） | FR-513、FR-515、FR-516 |
| ADD | `web/場次偏好/取捨卡片的出現條件.feature` | 3 個 Rule、4 個 Example | FR-512、FR-517 |
| NOOP | `planner/最佳行程/**`、`planner/兩人合併/**`、`web/搶票/**` 等既有 Example | 沒有標記時行為不變，既有 Example 全數維持 | FR-518 |
