# Truth Delta: 002-ghff-duo-merge

**Plan Package**: `specs/plans/002-ghff-duo-merge`
**Truth Root**: `specs/truth`

> 由 `/specify` 初始化。本 plan 修改既有 truth（001 已建立）；以下各段由對應 truth owner skill 填寫。流程依 CL-203 精簡：略過 `/system-analysis` 與 `/ui-plan`。

## /technical-research

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/techstack.md` | 已檢查：沿用 TypeScript、React、Vite、localStorage、lz-string + QR、playwright-bdd；兩人合併不引入新技術、新套件或新測試 runner | CL-202（無後端、沿用分享連結）、CL-203（流程精簡、無新技術）；分享連結新增的「種類」只是 payload 欄位，不需新套件 |

## /api-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/contracts/**` | 已檢查：本專案仍無後端 API，不建立 contract | CL-202、CL-009 |

## /data-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Project` Note | 資料邊界敘述由「個人」擴為個人與兩人模式；新增「分享連結內容（share_payload）」為第四類不落地資料；說明有同伴時排程輸入為合併結果（衍生、不保存） | CL-201、CL-202、FR-205～FR-208、FR-212 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table user_state.schema_version` | 版本意義：1 = 001 個人狀態；2 = 新增 self_name 與 partner。讀取接受 1 與 2（1 視為個人模式），寫入一律 2，高於 2 視為版本不符；既有 v1 狀態與連結仍能載入為個人模式 | SC-205、FR-214、邊界情況（版本不符） |
| ADD | `specs/truth/data/data-model.dbml` -> `Table user_state.self_name` | 自己的顯示名稱（null = 個人模式）；移除同伴時一併清除 | FR-209、FR-204 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table user_state` Note / `daily_limit` / `manual_order` | 明定 film_preferences、unavailable_slots、daily_limit、ticket_marks 永遠是自己的資料，加入同伴不得改動；搶票標記與手動順序不與同伴合併；兩人模式下手動順序作用於合併後清單 | FR-202、CL-203、假設 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table partner` | 同伴單列（display_name、daily_limit、updated_at）；最多一位，新增前須確認取代；移除 = 刪除本列與子表 | FR-203、FR-204、FR-209、FR-214 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table partner_film_preferences` | 同伴的 tier 與 is_hot；不建立到 films 的 Ref（快照沒有的影片合併時忽略） | FR-205、FR-208、邊界情況 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table partner_unavailable_slots` | 同伴的不可看時段，結構同 unavailable_slots | FR-206 |
| ADD | `specs/truth/data/data-model.dbml` -> `Enum share_kind` + `Table share_payload` | 分享連結內容分 personal 與 merged 兩種（不落地）：personal 可取代／當作同伴加入／取消，可帶 sender_name；merged 只能取代並開啟；缺 kind 的 v1 連結視為 personal | FR-201、FR-212、FR-213、SC-205 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table merged_film_preferences` | 衍生：共同影片的合併層級（取高）與合併熱門（任一）；不保存 | FR-205、FR-208、CL-201 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table merged_constraints` | 衍生：合併每日上限（有設定者最小，皆無則 null）；合併不可看時段 = 兩人聯集，不另建表 | FR-206、FR-207 |
| ADD | `specs/truth/data/data-model.dbml` -> `Enum merge_side` + `Table single_side_counts` | 衍生：只有自己／只有同伴標記而不排入的影片數 | FR-210 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table itinerary_entries` Note | 兩人模式下輸入為合併結果，tier 為合併層級 | FR-205～FR-208 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table ticket_list_items.ticket_quantity`、Note | 新增衍生欄位 ticket_quantity（兩人 = 2、個人 = null）；順序與備案改以合併條件計算 | FR-211、US3 |

## /dsl-refine

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| MODIFY | `specs/truth/features/planner/dsl.md` -> 介面共通約定 | world 新增「同伴資料」；定義個人／兩人模式：無同伴資料 = 與 001 相同，有同伴資料則所有排程、備案、搶票順序一律以合併結果為輸入；搶票標記與手動順序不合併 | FR-205～FR-208、SC-205 |
| ADD | `specs/truth/features/planner/dsl.md` -> `Given: 同伴的分層如下：` | 寫入同伴分層與熱門（可含不在場次表的影片），不動自己的狀態 | FR-202、FR-205、FR-208 |
| ADD | `specs/truth/features/planner/dsl.md` -> `Given: 同伴已設定不可看時段如下：` | 寫入同伴不可看時段 | FR-206 |
| ADD | `specs/truth/features/planner/dsl.md` -> `Given: 同伴的每日上限已設為 {上限} 部` | 寫入同伴每日上限 | FR-207 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `When: 觀眾執行排程` | 有同伴資料時先推導合併結果再排程；無同伴時語意不變 | FR-205～FR-208、SC-205 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Given: 觀眾已執行排程並開啟搶票清單` | 同上，排程與清單輸入改為合併結果（有同伴時） | FR-205～FR-208、FR-211 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Then: 行程中沒有 "{片名}"`、`Then: 行程沒有任何場次` | 語意不變；權威位置由 `最佳行程/dsl.md` 上提到介面根（`兩人合併` 模組也使用，契約一致） | 唯一歸屬判準；FR-205 |
| MODIFY | `specs/truth/features/planner/最佳行程/dsl.md` | 移除上述兩列（已上提到介面根，語意不變） | 唯一歸屬判準 |
| ADD | `specs/truth/features/planner/兩人合併/dsl.md` | 新模組 DSL：合併定義（共同影片、層級取高、熱門任一、不可看聯集、上限最小）、`When: 觀眾查看兩人合併結果`、`Then: 合併後參與排程的影片如下：`、`合併後的不可看時段如下：`、`合併後的每日上限為 "{上限}"`、`單方標記的影片數如下：`、`雙方原始設定與合併前相同` | FR-205～FR-208、FR-210、FR-202 |
| ADD | `specs/truth/features/planner/兩人合併/共同影片與層級合併.feature` | 只有共同影片參與、層級取高、熱門任一、同伴影片不在場次表時忽略、單方標記影片數、合併不改雙方設定 | CL-201；acceptance/依兩人共同的片排出一起看的行程.feature Rule 1、4、5、6 |
| ADD | `specs/truth/features/planner/兩人合併/不可看時段與每日上限合併.feature` | 不可看時段聯集、每日上限取最小有設定者、皆未設定則不設上限 | FR-206、FR-207；acceptance/依兩人共同的片排出一起看的行程.feature Rule 2、3 |
| ADD | `specs/truth/features/planner/兩人合併/兩人合併排程.feature` | 排程只排共同影片、合併層級決定衝堂優先、避開任一人不可看時段、每日上限取較嚴、無共同影片時行程為空 | FR-205～FR-208；acceptance/依兩人共同的片排出一起看的行程.feature Rule 1～3、5 |
| MODIFY | `specs/truth/features/planner/搶票順序與備案/dsl.md` -> `When: 觀眾執行排程並開啟搶票清單` | 有同伴時排程與清單輸入為合併結果；無同伴時語意不變 | FR-211、US3 |
| ADD | `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature` | 搶票順序以合併層級與熱門計算；備案避開同伴不可看時段；備案不使任何一天超過合併上限 | FR-208、US3；acceptance/依兩人共同的片排出一起看的行程.feature Rule 4、一人買兩張的搶票清單.feature Rule 1、3 |
| MODIFY | `specs/truth/features/planner/搶票切換/dsl.md` -> `When: 觀眾把 "{片名}" 的 "{場次}" 場次標記為沒搶到` | 有同伴時換備案的可看與每日上限判斷使用合併結果；無同伴時語意不變 | US3 驗收情境 3 |
| MODIFY | `specs/truth/features/planner/搶票切換/dsl.md` -> `When: 觀眾重新排程` | 有同伴時輸入為合併結果加自己的搶票標記；無同伴時語意不變 | US3 驗收情境 3、SC-205 |
| ADD | `specs/truth/features/planner/搶票切換/兩人沒搶到切換備案.feature` | 兩人模式下沒搶到後換的備案須避開同伴不可看時段 | US3 驗收情境 3；acceptance/一人買兩張的搶票清單.feature Rule 3 |
| MODIFY | `specs/truth/features/web/dsl.md` -> 介面共通約定 | state fixture 另預載兩人名稱與同伴資料；定義個人／兩人模式；同伴 Given 先寫成待載入的同伴資料 | FR-209、FR-214、SC-205 |
| ADD | `specs/truth/features/web/dsl.md` -> `Given: 同伴的分層如下：` | 寫入待載入同伴資料的分層與熱門（`兩人模式`、`行程`、`搶票`、`分享與保存` 模組共用） | FR-205、FR-208 |
| ADD | `specs/truth/features/web/dsl.md` -> `Given: 同伴已設定不可看時段如下：` | 寫入待載入同伴資料的不可看時段 | FR-206 |
| ADD | `specs/truth/features/web/dsl.md` -> `Given: 同伴的每日上限已設為 {上限} 部` | 寫入待載入同伴資料的每日上限 | FR-207 |
| ADD | `specs/truth/features/web/dsl.md` -> `Given: 觀眾已加入同伴，自己名稱為 "{自己}"、同伴名稱為 "{同伴}"` | 把兩人名稱與待載入同伴資料預載進使用者狀態，並記下自己設定的基準快照 | FR-209、FR-214 |
| ADD | `specs/truth/features/web/兩人模式/dsl.md` | 新模組 DSL：同伴連結 Given（有名稱／無名稱／損毀／已開啟／已選擇當作同伴加入）、When（開啟、當作同伴加入、取代我的設定、輸入名稱、確認取代同伴、移除同伴、切頁）、Then（個人連結對話、名稱預設、取代同伴確認、頂部橫幅、無同伴資料、已保存的同伴資料與自己設定、搶票標記） | FR-201～FR-204、FR-209 |
| ADD | `specs/truth/features/web/兩人模式/加入同伴.feature` | 個人連結對話標明名稱、首次要求輸入名稱（預設「我」「同伴」）、輸入後頂部橫幅、自己設定不變、同伴資料另存、取代我的設定同 001 且不進兩人模式、連結損毀 | FR-201、FR-202、FR-209；acceptance/把同伴的選片加進來不蓋掉自己的.feature Rule 1、2、5 |
| ADD | `specs/truth/features/web/兩人模式/取代與移除同伴.feature` | 已有同伴先確認取代、取代後換成新資料且不動自己設定、移除回個人模式、移除刪同伴資料、不動自己設定、保留搶票標記 | FR-203、FR-204、邊界情況；acceptance/把同伴的選片加進來不蓋掉自己的.feature Rule 3、4 |
| ADD | `specs/truth/features/web/兩人模式/兩人模式橫幅.feature` | 兩人模式五個分頁頂部都顯示「兩人模式：{自己} ＋ {同伴}」，個人模式不顯示 | FR-209；acceptance/把同伴的選片加進來不蓋掉自己的.feature Rule 1 |
| ADD | `specs/truth/features/web/行程/dsl.md` -> `Then: 行程頁頂部顯示單方標記統計 "{統計}"`、`Then: 行程頁不顯示單方標記統計` | 兩人模式行程頁頂部的單方標記統計；個人模式不顯示 | FR-210 |
| ADD | `specs/truth/features/web/行程/兩人行程.feature` | 行程只含共同影片、層級為較高者、單方標記統計、個人模式不顯示統計、無共同影片的空狀態 | FR-205、FR-210；acceptance/依兩人共同的片排出一起看的行程.feature Rule 1、5 |
| ADD | `specs/truth/features/web/行程/兩人行程的時段與上限.feature` | 行程避開任一人不可看時段；每日上限取兩人最小值 | FR-206、FR-207；acceptance/依兩人共同的片排出一起看的行程.feature Rule 2、3 |
| ADD | `specs/truth/features/web/搶票/dsl.md` -> `Then: 搶票清單每列顯示 "{張數}"`、`Then: 搶票清單不顯示張數` | 兩人模式每列「買 2 張」；個人模式不顯示張數 | FR-211 |
| ADD | `specs/truth/features/web/搶票/兩人搶票清單.feature` | 兩人模式每列買 2 張、順序以合併層級與熱門計算、個人模式不顯示張數 | FR-211；acceptance/一人買兩張的搶票清單.feature Rule 1、2；依兩人共同的片排出一起看的行程.feature Rule 4 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> 連結種類說明 | 新增個人連結對話（三選項）與合併結果連結對話（兩選項）的文字約定 | FR-201、FR-213 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> `Then: 手機畫面顯示確認 "{確認}"` | 對話為個人連結對話：說明文字含該確認文字，另有取代與取消（新增「當作同伴加入」由選項集合句驗證） | FR-201 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> `When: 觀眾用手機開啟該分享連結並確認取代` | 確認鈕改為個人連結對話的「取代我的設定」，不選「當作同伴加入」 | FR-201 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> `Given: 手機已用分享連結匯入設定` | 同上，Arrange 按「取代我的設定」 | FR-201 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> `Given: 電腦上已產生分享連結` | 明定電腦為個人模式、連結種類為個人分享連結 | FR-212 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> `Then: 手機的搶票清單與電腦完全相同（順序、排定場次、備案場次）` | 兩人模式時另逐列比對張數 | FR-211、SC-204 |
| ADD | `specs/truth/features/web/分享與保存/dsl.md` -> 合併結果句型 | `Given: 電腦上已產生合併結果連結`、`手機已用合併結果連結取代並開啟`；`When: 觀眾用手機開啟該分享連結並選擇取代並開啟`；`Then: 手機畫面的分享連結選項為`、`分享畫面標示為合併結果連結，並提供 QR code 與「複製連結」`、`手機畫面顯示合併結果確認`、`手機進入兩人模式並顯示`、`手機的行程與電腦完全相同`、`重新開啟後仍為兩人模式並顯示` | FR-212、FR-213、SC-204 |
| MODIFY | `specs/truth/features/web/分享與保存/跨裝置分享.feature` | 新增 Rule：開啟個人分享連結時提供當作同伴加入、取代我的設定、取消三個選項；既有 Rule 與 Example 不變 | FR-201；acceptance/把同伴的選片加進來不蓋掉自己的.feature Rule 1、2 |
| ADD | `specs/truth/features/web/分享與保存/合併結果分享.feature` | 分享畫面標示合併結果連結、對話確認、只提供取代並開啟與取消、手機進入兩人模式並顯示名稱、行程與搶票清單一致（含手動順序、搶票標記、張數）、重開仍保留 | FR-212、FR-213、SC-204；acceptance/把合併結果傳給同伴並各自保存.feature Rule 1～3 |
| ADD | `specs/truth/features/web/分享與保存/兩人設定保存.feature` | 同伴資料與兩人名稱關閉重開後仍保留 | FR-214；acceptance/把合併結果傳給同伴並各自保存.feature Rule 4 |
| ADD | `specs/truth/features/web/分享與保存/dsl.md` -> `Given: 裝置上保存的是 001 版本格式的設定，分層如下：`、`Given: 手機收到 001 版本格式的個人分享連結` | 以 v1 格式預載保存內容／編成 001 版本的分享連結，驗證舊資料相容 | SC-205、data-model schema_version 說明 |
| ADD | `specs/truth/features/web/分享與保存/舊版相容.feature` | 001 版本保存的設定開啟後仍可使用；001 版本連結視為個人分享連結（三選項） | SC-205、FR-214；schema_version 1 必須仍可載入為個人模式 |
| NOOP | `specs/truth/features/scraper/**` | 已檢查：抓資料腳本與場次快照不受兩人合併影響 | 範圍不含官網解析 |
