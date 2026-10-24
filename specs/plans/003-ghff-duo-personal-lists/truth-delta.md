# Truth Delta: 003-ghff-duo-personal-lists

**Plan Package**: `specs/plans/003-ghff-duo-personal-lists`
**Truth Root**: `specs/truth`

> 由 `/specify` 初始化。本 plan 修改既有 truth（001、002 已建立）；以下各段由對應 truth owner skill 填寫。流程依 CL-203 精簡：略過 `/system-analysis` 與 `/ui-plan`。
>
> 高影響 MODIFY / DELETE 的決策依據：spec.md「對既有 truth 的影響」表與 Clarify Round 1（CL-301 各自片單優先、CL-302 單一份有空時段、CL-303 本版只做 P1 與層內排序）。已知的一個行為變化：001 的「★ 場次數」由排程目標第 4 項降為第 5 項（FR-304），同層級的不同影片衝堂時 ★ 不再能讓名次較後的影片勝出；因此 001/002 中依賴「★ 決定同層衝堂勝負」的 Example 以調整分層列順序（資料）改寫，見 `/dsl-refine` 的 MODIFY 列。這與 SC-305「沒有層內排序調整時結果與 001 相同」在這類 Example 上有出入，以 FR-304 為準（需求方確認）。

## /technical-research

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/techstack.md` | 已檢查：沿用 TypeScript、React、Vite、localStorage、lz-string + QR、playwright-bdd；小時格子、層內排序、兩人各自排程都用既有技術，不引入新套件或新測試 runner；schema_version 3 只是保存格式變更 | CL-203（流程精簡、無新技術）；CL-302（沿用 localStorage 與分享連結） |

## /api-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| NOOP | `specs/truth/contracts/**` | 已檢查：本專案仍無後端 API，不建立 contract | CL-202、CL-009 |

## /data-plan

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Project` Note | 資料邊界敘述由「個人與兩人合併」改為「個人與兩人各自片單」；衍生結果改為兩人各自排程、每場帶參與者；新增「有空時段」為每人每天一份分鐘精度資料，不可看時段改為其補集（顯示用） | CL-301、CL-302、FR-301、FR-306～FR-308 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table user_state.schema_version` | 版本意義新增 3 = 不可看時段改存有空時段、影片分層新增層內名次；讀取接受 1、2、3（1、2 依遷移規則轉成 3），寫入一律 3，高於 3 視為版本不符並顯示損毀錯誤、不改任何資料 | FR-313、邊界情況（舊資料、舊連結）、SC-305 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table user_state` Note / `daily_limit` / `manual_order` | 新增遷移規則（不可看時段從全天有空相減；層內名次依場次表影片順序初始化；遷移只發生在讀入記憶體）；每日上限只約束自己的行程；手動順序作用在自己的搶票清單 | FR-306、FR-312、邊界情況 |
| DELETE | `specs/truth/data/data-model.dbml` -> `Table unavailable_slots` | 移除獨立的不可看時段表；其語意由有空時段取代（舊資料以相減遷移） | CL-302、FR-301 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table day_availability` | 「這一天被自訂過」的標記；沒有列 = 全天有空（預設）；有列但無區間 = 整天沒空；區間正規化（排序、不重疊、相鄰合併）；有空區間恰為 00:00–24:00 時刪除該列 | CL-302、FR-301、FR-005 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table available_intervals` + Ref | 自己的有空區間（date、start_min、end_min；分鐘精度，以 date + start_min 為鍵），歸屬 day_availability；場次可看 ⇔ 開演到散場每分鐘都有空；小時格子與不可看時段都只是它的編輯與顯示方式 | FR-301～FR-303、狀態與公式 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table film_preferences` | 新增 tier_rank（層內名次，1 = 該層最前；同層不重複、連續；新標記或改層排該層最後；取消標記後遞補）；is_hot 註明只影響自己的搶票順序 | FR-304、FR-305 |
| DELETE | `specs/truth/data/data-model.dbml` -> `Table partner_unavailable_slots` | 同伴的不可看時段表移除，改存為同伴有空時段 | CL-302、FR-301 |
| ADD | `specs/truth/data/data-model.dbml` -> `Table partner_day_availability`、`Table partner_available_intervals` + Ref | 同伴的有空時段，結構與正規化規則同自己的兩張表 | CL-302、FR-306 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table partner_film_preferences` | 新增 tier_rank（同伴的層內名次） | FR-304、FR-306 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table partner` Note / `daily_limit` | 子表改為 partner_film_preferences、partner_day_availability、partner_available_intervals；同伴每日上限只約束同伴自己的行程 | FR-306 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Enum share_kind` / `Table share_payload` | 連結種類仍為 personal 與 merged（名稱沿用 002，merged 內容為兩人各自片單）；內容升為 schema_version 3，含有空時段與層內名次；版本 1、2 的連結開啟時依遷移規則轉換；版本高於 3 顯示損毀錯誤 | FR-313、FR-212、FR-213、邊界情況 |
| DELETE | `specs/truth/data/data-model.dbml` -> `Table merged_film_preferences` | 移除衍生的合併層級與合併熱門（002 的合併語意已取消） | CL-301、FR-306～FR-309 |
| DELETE | `specs/truth/data/data-model.dbml` -> `Table merged_constraints` | 移除衍生的合併每日上限與合併不可看時段（改為每人各自約束自己） | CL-301、FR-306 |
| DELETE | `specs/truth/data/data-model.dbml` -> `Enum merge_side` + `Table single_side_counts` | 移除單方標記統計（002 的「只有單方標記，不排入」提示已移除） | 假設（002 的提示在本版移除）、FR-309 |
| ADD | `specs/truth/data/data-model.dbml` -> `Enum person_side` | 自己／同伴；供未排入必看片標明是誰的必看 | FR-311 |
| ADD | `specs/truth/data/data-model.dbml` -> `Enum itinerary_participant` | 行程場次的參與者：self（只有自己）、partner（只有同伴）、together（一起） | FR-308、FR-310 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table itinerary_entries` | 新增 participant（個人模式 null）與 partner_tier；tier 改為可為 null（只有同伴看時為 null）；Note 改為兩人各自排程、再依兩人目標取一起看最多者 | FR-306～FR-308、FR-310 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table unscheduled_must_films` | 新增 owner（person_side），鍵改為 (owner, film_id)；兩人模式分別列出兩人排不進去的必看片 | FR-311 |
| MODIFY | `specs/truth/data/data-model.dbml` -> `Table ticket_list_items`（ticket_quantity、backup_session_ids、Note） | 清單只含本裝置使用者自己行程中的場次；ticket_quantity 一起看 2、自己看 1、個人模式 null；順序以自己的層級與熱門計算；一起看的片備案須兩人都可看、都不超過各自上限，自己看的片備案只看自己 | FR-312、US4 |
| NOOP | `specs/truth/data/data-model.dbml` -> catalog 區（cinema、session_mark、catalog、films、venues、sessions）、`ticket_marks` | 已檢查：場次快照與搶票標記不受本 plan 影響 | 範圍不含官網解析與搶票標記格式 |

## /dsl-refine

| 動作 | Truth 規格 | 改動摘要 | 原因 |
| --- | --- | --- | --- |
| MODIFY | `specs/truth/features/planner/dsl.md` -> 介面共通約定 | world 的使用者狀態與同伴資料改含層內排序與有空時段；新增「層內排序（表格列順序）」「有空時段（不可看 = 扣除，分鐘精度）」約定；兩人模式改為兩人各自排程、每場帶參與者，不再有合併層級／時段／上限；兩人模式下「行程」一詞指觀眾自己的行程 | CL-301、CL-302、FR-301、FR-304、FR-306～FR-308 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Given: 觀眾的分層如下：` | 新增預設參數「層內排序」：同層依表格列順序，先列者名次較前；寫入層內名次 | FR-304、FR-305 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Given: 同伴的分層如下：` | 同上，寫入同伴的層內名次；沒在場次表中的影片排程時忽略（原「合併時忽略」） | FR-304、FR-306、FR-309 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Given: 觀眾已設定不可看時段如下：` | 改為從有空時段扣掉區間（同日可多列、逐列累加），以分鐘精度保存；句型不變 | CL-302、FR-301 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Given: 同伴已設定不可看時段如下：` | 同上，作用於同伴的有空時段 | CL-302、FR-306 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `When: 觀眾執行排程` | 有同伴資料時，兩人各自以自己的分層、層內排序、有空時段、每日上限同時排出兩人行程；沒有同伴時與 001 相同（含層內排序） | FR-304、FR-306～FR-308 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Given: 觀眾已執行排程並開啟搶票清單` | 有同伴資料時，搶票清單只由觀眾自己的行程產生，並帶購票張數（一起 2、自己 1） | FR-312 |
| NOOP | `specs/truth/features/planner/dsl.md` -> `Given: 每日上限已設為 {上限} 部`、`Given: 同伴的每日上限已設為 {上限} 部` | 已檢查：句型與語意不變；每日上限只約束自己的行程已寫入共通約定 | FR-306 |
| MODIFY | `specs/truth/features/planner/dsl.md` -> `Then: 行程中沒有 "{片名}"`、`Then: 行程沒有任何場次` | 語意不變；權威位置由介面根下放回 `最佳行程/dsl.md`（002 因兩人合併模組使用而上提，本版兩人合併模組不再使用，改為只有單一模組使用） | 唯一歸屬判準；稽核 warning |
| MODIFY | `specs/truth/features/planner/可看判定/dsl.md` -> `When: 觀眾查看場次可看狀態` | 改讀有空時段，以分鐘判斷（開演到散場每分鐘都有空）；跨午夜超出部分以隔日有空時段判斷 | FR-301、狀態與公式 |
| MODIFY | `specs/truth/features/planner/可看判定/dsl.md` -> `When: 觀眾把不可看時段 "{時段}" 一次套用到以下日期：` | 對每個日期各自從有空時段扣掉該區間 | FR-007、FR-301 |
| MODIFY | `specs/truth/features/planner/可看判定/dsl.md` -> `Then: 場次可看狀態如下：` | 權威狀態改為只依場次快照與有空時段 | FR-301 |
| DELETE | `specs/truth/features/planner/可看判定/dsl.md` -> `Then: 不可看時段設定如下：` | 不可看時段不再是獨立保存的資料，由 `有空時段如下：` 取代 | CL-302 |
| ADD | `specs/truth/features/planner/可看判定/dsl.md` -> `When: 觀眾查看有空時段` | 純查詢使用者狀態的有空時段 | FR-301 |
| ADD | `specs/truth/features/planner/可看判定/dsl.md` -> `Then: 有空時段如下：` | 驗證每日有空區間（由早到晚、已合併相鄰區間、整天沒空、全天有空者不列） | FR-301、遷移規則 |
| MODIFY | `specs/truth/features/planner/可看判定/場次可看判定.feature` | Rule「未設定任何不可看時段…」改為「預設全天有空」；Rule「同一個不可看區間可一次套用到多個日期」的 Then 改為 `有空時段如下：` | FR-301、FR-007 |
| ADD | `specs/truth/features/planner/可看判定/場次可看判定.feature` | 新增 Rule：以分鐘判斷（17:00–17:30 前與 20:00–21:00 沒空；17:40 可看、19:30–21:10 不可看）；新增 Rule：不可看與有空是同一份資料（三段有空、整天沒空）；新增 Rule：重疊不可看區間相減後合成一份有空時段（舊版遷移的相減規則） | acceptance/用小時格子設定有空時段.feature Rule 2、5、6；FR-301 |
| NOOP | `specs/truth/features/planner/可看判定/場次可看判定.feature` -> Rule「場次從開演到散場與不可看區間有任何重疊就不可看」、「跨午夜」、「整天不可看」 | 已檢查：Example 與預期結果仍然成立，沿用 | SC-305 |
| MODIFY | `specs/truth/features/planner/最佳行程/dsl.md` -> 新增「排程目標」說明與 `Then: 行程的排程目標不劣於窮舉所有可行組合` | 排程目標由「必看、想看、有空再看、★」改為在有空再看之後加入層內排序（逐層比較排入影片名次）、★ 為第 5 項；窮舉驗證同步 | FR-304 |
| DELETE | `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> Rule「前三項都相同時，選中 ★ 場次數較多的組合」的 Example「兩部必看撞期只能排一部，系統選影人出席那部」 | ★ 不再凌駕層內排序，同層衝堂時由名次決定；此 Example 的行為已不成立 | FR-304（對既有 truth 的影響表） |
| ADD | `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> Rule「前三項相同時，同一層級的影片衝堂，排入層內排序較前的那部」 | 三個 Example：北方在前、對調後小城之春在前、排在後面的北方有 ★ 也不能搶走紅色沙漠 | FR-304；acceptance/在同一層裡排出先後.feature Rule 2；SC-304 |
| ADD | `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> Rule「排入影片數相同時，由名次最前的影片開始逐一比較名次」 | 甲乙衝堂、丙丁衝堂，排入甲與丙 | FR-304（逐一比較名次） |
| MODIFY | `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> Rule「前三項都相同時…★」 | Rule 改為「前四項都相同時，選中 ★ 場次數較多的組合」，Example 改為兩部必看各有一般場與影人出席場，兩部都選 ★ 場 | FR-304 |
| NOOP | `specs/truth/features/planner/最佳行程/排程目標優先序.feature` -> Rule 1、2、3、「同一部片有多個可行場次時，選影人出席的場次」 | 已檢查：仍成立（層級數仍優先於層內排序；同一部片的場次選擇仍看 ★） | SC-305；acceptance/在同一層裡排出先後.feature Rule 3 |
| ADD | `specs/truth/features/planner/最佳行程/最佳性與可重現.feature` -> Rule「排程目標含層內排序，行程仍不劣於窮舉找到的任何可行組合」 | 五部同為想看、衝堂交錯的小型資料集，驗證名次比較不劣於窮舉 | FR-304、SC-303 |
| NOOP | `specs/truth/features/planner/最佳行程/每日上限.feature`、`行程範圍.feature`、`行程不衝堂與排列.feature`、`specs/truth/features/planner/轉場相容/**` | 已檢查：不涉及同層衝堂取捨；行程範圍的不可看 Example 由 `觀眾已設定不可看時段如下：` 的 MODIFY 涵蓋 | SC-305 |
| ADD | `specs/truth/features/planner/未排入原因/dsl.md` -> `Then: 兩人未排入的必看片與原因如下：` | 兩人模式分別列出觀眾與同伴排不進去的必看片、原因與是誰的必看 | FR-311 |
| MODIFY | `specs/truth/features/planner/未排入原因/未排入必看片原因.feature` -> Rule「與其他必看片衝堂…」、Rule「因每日上限…」的 Example | 兩個原本靠 ★ 決定勝負的 Example，改為把勝出的片排在分層列前面（資料改寫、預期結果不變）；移除不再需要的 ★ 欄；每日上限 Example 的標題改為「層內排序較前的一部」 | FR-304 |
| ADD | `specs/truth/features/planner/未排入原因/未排入必看片原因.feature` -> Rule「兩人模式分別列出兩人各自排不進去的必看片，並標明是誰的必看」 | 觀眾的紅色沙漠與排在前面的北方衝堂，同伴的兩部必看都排得進去 | FR-311；acceptance/兩人各自的片單能一起就一起.feature Rule 5 |
| MODIFY | `specs/truth/features/planner/兩人合併/dsl.md` -> 開頭說明與定義段 | 「兩人合併定義」改寫為「兩人排程定義」：每人各自限制、參與者三種值、兩人排程目標 6 項、推導（個人最佳 + 一起看最多 + ★）；模組名稱沿用以保留落點路徑 | CL-301、FR-306～FR-308 |
| DELETE | `specs/truth/features/planner/兩人合併/dsl.md` -> `When: 觀眾查看兩人合併結果` | 不再有合併結果 | CL-301 |
| DELETE | `specs/truth/features/planner/兩人合併/dsl.md` -> `Then: 合併後參與排程的影片如下：`、`Then: 合併後的不可看時段如下：`、`Then: 合併後的每日上限為 "{上限}"` | 合併層級／聯集時段／最小上限的規則整組移除 | CL-301、對既有 truth 的影響表 |
| DELETE | `specs/truth/features/planner/兩人合併/dsl.md` -> `Then: 單方標記的影片數如下：`、`Then: 雙方原始設定與合併前相同` | 單方標記統計移除；後者改以 `雙方原始設定與排程前相同` 取代（改名，語意延伸為排程不改設定） | 假設（002 提示移除） |
| ADD | `specs/truth/features/planner/兩人合併/dsl.md` -> `Then: 兩人行程依日期排列如下：` | 驗證兩人行程每列的日期、開演、片名、參與者（一起／觀眾自己／同伴自己）與排序 | FR-308、FR-310 |
| ADD | `specs/truth/features/planner/兩人合併/dsl.md` -> `Then: 兩人行程的排程目標不劣於窮舉所有可行組合` | 窮舉所有可行的兩人組合，依兩人排程目標第 1～6 項驗證最佳 | SC-303 |
| ADD | `specs/truth/features/planner/兩人合併/dsl.md` -> `Then: 雙方原始設定與排程前相同` | 排程不改動雙方的分層與層內排序、熱門、有空時段、每日上限、手動順序、搶票標記 | FR-202 |
| DELETE | `specs/truth/features/planner/兩人合併/共同影片與層級合併.feature` | 整檔刪除（6 個 Rule：共同影片、層級取高、熱門任一、忽略快照沒有的影片、單方標記統計、合併不改設定）。仍成立的「忽略快照沒有的影片」改由 `兩人各自片單排程.feature` 承接；「合併不改設定」改由 `雙方原始設定與排程前相同` 承接 | CL-301；FR-306～FR-309 |
| DELETE | `specs/truth/features/planner/兩人合併/不可看時段與每日上限合併.feature` | 整檔刪除（3 個 Rule：不可看聯集、每日上限取最小、皆未設定不設上限）；改為每人各自約束自己，由 `兩人各自片單排程.feature` 承接 | CL-301；FR-306 |
| DELETE | `specs/truth/features/planner/兩人合併/兩人合併排程.feature` | 整檔刪除（5 個 Rule）：排程只排共同影片、合併層級決定優先、每日上限取較嚴、沒有共同分層時行程為空 皆已不成立；「任一人不可看的時段內的場次都不排入」改寫為「一起看的場次須兩人都有空」並移到新檔 | CL-301；FR-306、FR-309 |
| ADD | `specs/truth/features/planner/兩人合併/兩人各自片單排程.feature` | Fischer／小美五部片同時排程（一起／各自）、只有一人分層的影片只排入該人（含沒有共同分層、忽略快照沒有的影片）、一人沒有分層時另一人依個人模式排、一起看須兩人都有空（MODIFY 自 002 同名情境）、每日上限只約束自己（MODIFY 自 002）、排程不改雙方設定（MODIFY 自 002） | acceptance/兩人各自的片單能一起就一起.feature Rule 1、4、7；FR-306、FR-308、FR-309 |
| ADD | `specs/truth/features/planner/兩人合併/一起看的取捨.feature` | 兩人層級數與排序相同時選一起看；為一起看會讓一人少看同層或更高層的片、或改看排序較後的片時不一起看 | acceptance/兩人各自的片單能一起就一起.feature Rule 2、3；CL-301；FR-307 |
| ADD | `specs/truth/features/planner/兩人合併/兩人行程最佳性.feature` | 含衝堂、跨影城、影人出席、各自不可看時段與每日上限的小型資料集，驗證兩人行程不劣於窮舉 | SC-303、FR-307 |
| MODIFY | `specs/truth/features/planner/搶票順序與備案/dsl.md` -> `When: 觀眾執行排程並開啟搶票清單` | 有同伴時清單只由觀眾自己的行程產生；順序以自己的層級與熱門計算；備案依參與者計算（一起：兩人；自己：只看觀眾）；每列帶張數（一起 2、自己 1） | FR-312、US4 |
| ADD | `specs/truth/features/planner/搶票順序與備案/dsl.md` -> `Then: 搶票清單的購票張數如下：` | 驗證每部片的購票張數，並確認不含同伴自己看的片 | FR-312 |
| MODIFY | `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature` -> Rule「兩人模式的搶票順序以合併層級與合併熱門計算」 | 改為「以觀眾自己的層級與自己標的熱門計算」；原 Example（同伴標熱門使家族之味在前）預期改變，改成兩個 Example：同伴標熱門不影響、自己標熱門才影響 | FR-312；acceptance/搶票清單依自己的行程顯示張數.feature Rule 2 |
| MODIFY | `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature` -> Rule「備案不得落在同伴不可看的時段」、Rule「備案不得使任何一天超過合併後的每日上限」 | 改為一起看的片：備案避開同伴不可看時段、不使任一人超過自己的每日上限（Example 資料與預期不變） | FR-308、FR-312 |
| ADD | `specs/truth/features/planner/搶票順序與備案/兩人搶票清單.feature` -> Rule「兩人模式的搶票清單只列觀眾自己行程中的場次…」、Rule「自己看的片，備案只看觀眾自己」 | Fischer／小美資料：清單只含自己行程，北方 2 張、其餘 1 張，不含家族之味；自己看的片備案不受同伴時段影響 | FR-312；acceptance/搶票清單依自己的行程顯示張數.feature Rule 1、3 |
| NOOP | `specs/truth/features/planner/搶票順序與備案/搶票順序.feature`、`備案場次.feature` | 已檢查：個人模式規則不變 | SC-305 |
| MODIFY | `specs/truth/features/planner/搶票切換/dsl.md` -> `When: 觀眾把 "{片名}" 的 "{場次}" 場次標記為沒搶到` | 一起看的片，備案須兩人都可看且不使同伴超過自己的上限；自己看的片，備案只看觀眾 | FR-308、FR-312 |
| MODIFY | `specs/truth/features/planner/搶票切換/dsl.md` -> `When: 觀眾重新排程` | 有同伴時兩人各自重排：觀眾的 got 固定、missed 排除，其餘依兩人排程目標求最佳 | FR-306、FR-307 |
| MODIFY | `specs/truth/features/planner/搶票切換/兩人沒搶到切換備案.feature` | 移除 Background，Example 自帶設定；原 Rule 標題改為「一起看的片…」；新增 Rule「自己看的片沒搶到後換的備案，只需觀眾自己有空」 | FR-308、FR-312 |
| NOOP | `specs/truth/features/planner/搶票切換/標記搶到與沒搶到.feature`、`重新排程保留搶到結果.feature` | 已檢查：個人模式規則不變 | SC-305 |
| MODIFY | `specs/truth/features/web/dsl.md` -> 介面共通約定 | state fixture 以 schema v3 預載；新增層內順序（表格列順序）、有空時段與不可看時段的對應、兩人行程頁篩選與層級色塊視角的約定；兩人模式改為兩人各自排程 | FR-301、FR-304、FR-310、FR-313 |
| MODIFY | `specs/truth/features/web/dsl.md` -> `Given: 觀眾已標記影片層級如下：`、`Given: 同伴的分層如下：` | 新增預設參數「層內順序」：同層依表格列順序 | FR-304、FR-305 |
| MODIFY | `specs/truth/features/web/dsl.md` -> `Given: 觀眾已設定不可看時段如下：`、`Given: 同伴已設定不可看時段如下：` | 改為從有空時段扣掉區間（同日可多列）；句型不變 | CL-302、FR-301 |
| MODIFY | `specs/truth/features/web/dsl.md` -> `Then: 時段頁顯示不可看時段如下：` | 列出的是有空時段的補集（由早到晚），同日可多列；權威狀態改為有空時段取補集 | CL-302、FR-301 |
| MODIFY | `specs/truth/features/web/dsl.md` -> `Then: 行程頁依日期顯示以下場次：` | 新增可選欄 `參與者`（一起／{名字} 自己）；兩人模式為目前篩選下的內容 | FR-310 |
| MODIFY | `specs/truth/features/web/dsl.md` -> `Given: 觀眾已排好行程` | 語意不變；權威位置由 `分享與保存/dsl.md` 上提到介面根（`行程` 模組的篩選 Example 也使用） | 唯一歸屬判準 |
| ADD | `specs/truth/features/web/dsl.md` -> `Then: 時段頁 "{日期}" 的小時格子如下：` | 驗證 24 格小時格子的狀態（有空／沒空／部分沒空；未列出者為有空）；`時段` 與 `分享與保存` 模組共用 | FR-302、FR-303 |
| ADD | `specs/truth/features/web/dsl.md` -> `Then: 選片頁層內順序如下：` | 驗證各層內影片由前到後的順序；`選片` 與 `分享與保存` 模組共用 | FR-305 |
| NOOP | `specs/truth/features/web/dsl.md` -> `Given: 觀眾已加入同伴 …`、`同伴的每日上限已設為 …`、`觀眾已排好行程並開啟搶票清單` 等其餘列 | 已檢查：語意不變 | SC-305 |
| ADD | `specs/truth/features/web/時段/dsl.md` -> `When: 觀眾在時段頁查看 "{日期}" 的小時格子`、`When: 觀眾在時段頁點擊 "{日期}" 的 {小時} 點格子`、`When: 觀眾在時段頁選取以下日期並點擊 {小時} 點格子：` | 小時格子的查看、單日點擊、多日點擊（有空→整小時沒空；沒空→整小時有空；部分沒空→整小時沒空） | FR-302、FR-303 |
| ADD | `specs/truth/features/web/時段/dsl.md` -> `Then: 時段頁 "{日期}" 的 24 格皆為有空` | 預設全天有空的驗證 | FR-302 |
| MODIFY | `specs/truth/features/web/時段/dsl.md` -> `Then: 選片頁的場次可看狀態如下：` | 權威狀態改為與有空時段以分鐘推算相符 | FR-301 |
| ADD | `specs/truth/features/web/時段/小時格子設定.feature` | 預設全天有空、點擊切換、再點恢復、與不可看時段同一份資料（含 20 點、列表連動）、部分沒空點擊、多日同步 | acceptance/用小時格子設定有空時段.feature Rule 1～4；FR-302、FR-303 |
| MODIFY | `specs/truth/features/web/時段/不可看場次標示.feature` | 新增 Rule：以分鐘判斷（17:40 可看、被切掉幾分鐘或碰到 20 點的場次不可看）；原 Rule 不變 | acceptance/用小時格子設定有空時段.feature Rule 5；FR-301 |
| NOOP | `specs/truth/features/web/時段/不可看時段設定.feature` | 已檢查：所有 Rule 仍成立（輸入驗證、多日套用、整天、刪除、每日上限）；`時段頁顯示不可看時段如下：` 的 MODIFY 涵蓋 | SC-305 |
| MODIFY | `specs/truth/features/web/選片/dsl.md` -> `When: 觀眾把 "{片名}" 標為 "{層級}"` | 寫入層內名次：新標記或改層的影片排在目標層最後，原層遞補 | FR-305 |
| ADD | `specs/truth/features/web/選片/dsl.md` -> `When: 觀眾把 "{片名}" 在層內上移一位`、`When: 觀眾把 "{片名}" 在層內下移一位` | 選片頁層內順序檢視中與相鄰影片互換 | FR-305 |
| ADD | `specs/truth/features/web/選片/dsl.md` -> `Then: "{片名}" 的層內 "{方向}" 按鈕停用` | 同層第一位不能上移、最後一位不能下移 | FR-305 |
| ADD | `specs/truth/features/web/選片/層內排序.feature` | 上移、下移、調整不影響其他層、邊界按鈕停用 | acceptance/在同一層裡排出先後.feature Rule 1；FR-305 |
| MODIFY | `specs/truth/features/web/選片/影片分層.feature` | 新增 Rule：新標記或改層到某層的影片排在該層最後（兩個 Example）；原 Rule 不變 | acceptance/在同一層裡排出先後.feature Rule 4；FR-305 |
| NOOP | `specs/truth/features/web/選片/選片頁瀏覽.feature` | 已檢查：不涉及層內排序 | SC-305 |
| ADD | `specs/truth/features/web/行程/dsl.md` -> `When: 觀眾把行程篩選為 "{篩選}"` | 全部／只看自己／只看同伴；畫面狀態，不保存 | FR-310 |
| ADD | `specs/truth/features/web/行程/dsl.md` -> `Then: 行程頁的篩選選項為 "{選項}"`、`Then: 行程頁不顯示一起與自己標示及篩選` | 兩人模式有三個篩選選項、預設全部；個人模式沒有標示與篩選 | FR-310；acceptance/兩人各自的片單能一起就一起.feature Rule 4、9 |
| MODIFY | `specs/truth/features/web/行程/dsl.md` -> `Then: 行程頁列出未排入的必看片與原因如下：` | 新增可選欄 `誰`（兩人模式標明是誰的必看）；原因與排程引擎一致 | FR-311 |
| DELETE | `specs/truth/features/web/行程/dsl.md` -> `Then: 行程頁頂部顯示單方標記統計 "{統計}"`、`Then: 行程頁不顯示單方標記統計` | 002 的單方標記統計提示移除 | 假設（002 提示在本版移除） |
| DELETE | `specs/truth/features/web/行程/兩人行程.feature` | 整檔刪除（5 個 Rule：只含共同影片、層級取高、單方標記統計、個人模式不顯示統計、無共同分層的空狀態提示「兩人沒有共同標記的片，先到選片頁一起挑」）；改由 `兩人行程的一起與自己.feature` 承接（無共同分層時改為各自看、不顯示錯誤） | CL-301；FR-309、FR-310 |
| ADD | `specs/truth/features/web/行程/兩人行程的一起與自己.feature` | 每場標示一起或{名字} 自己；篩選選項、只看自己、只看同伴；無共同分層時各自看 | acceptance/兩人各自的片單能一起就一起.feature Rule 1、5、8；FR-310 |
| MODIFY | `specs/truth/features/web/行程/兩人行程的時段與上限.feature` | Rule「任一人不可看的時段內的場次都不排入」改為「一起看的場次須兩人都有空」，Rule「每日上限取兩人有設定者中的最小值」改為「每日上限只約束自己的行程」；Example 資料沿用或改寫，預期加上參與者 | CL-301；FR-306、FR-308 |
| MODIFY | `specs/truth/features/web/行程/行程呈現.feature` | 新增 Rule：同層級影片衝堂時排入層內順序較前的那部；新增 Rule：個人模式不顯示一起與自己標示及篩選；原 Rule 不變 | acceptance/在同一層裡排出先後.feature Rule 2；FR-304、FR-310 |
| MODIFY | `specs/truth/features/web/行程/未排入必看片.feature` | 三個依賴 ★ 決定同層勝負的 Example 改為把勝出的片排在分層列前面（預期不變）；新增 Rule：兩人模式的紅框標明是誰的必看 | FR-304、FR-311 |
| DELETE | `specs/truth/features/web/搶票/dsl.md` -> `Then: 搶票清單每列顯示 "{張數}"` | 每列一律買 2 張的規則不成立 | FR-312 |
| ADD | `specs/truth/features/web/搶票/dsl.md` -> `Then: 搶票清單的購票張數如下：` | 逐片驗證買 2 張（一起）或買 1 張（自己），且不含同伴自己看的片 | FR-312 |
| MODIFY | `specs/truth/features/web/搶票/兩人搶票清單.feature` | Rule「每一列都標示買 2 張」改為「只列自己行程中的場次，一起看買 2 張、自己看買 1 張」；Rule「搶票順序以合併後的層級與熱門計算」改為「以自己的層級與自己標的熱門計算」（原 Example 預期改變，拆成兩個 Example）；個人模式 Rule 不變 | FR-312；acceptance/搶票清單依自己的行程顯示張數.feature Rule 1、2、4 |
| NOOP | `specs/truth/features/web/搶票/搶票清單呈現.feature`、`搶票標記與切換備案.feature` | 已檢查：個人模式規則不變 | SC-305 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> 連結種類說明 | 新增 schema_version 3 的保存／連結格式、讀取 1／2／3 與遷移、版本高於 3 視為無法讀取 | FR-313 |
| MODIFY | `specs/truth/features/web/分享與保存/dsl.md` -> `Then: 手機的行程與電腦完全相同`、`Then: 手機的搶票清單與電腦完全相同（順序、排定場次、備案場次）` | 行程逐列比對一起與自己標示；清單逐列比對張數（一起 2、自己 1）且只含自己行程 | FR-310、FR-312、FR-313 |
| ADD | `specs/truth/features/web/分享與保存/dsl.md` -> `Given: 裝置上保存的是 002 版本格式的設定，不可看時段如下：`、`Given: 手機收到 001 版本格式的個人分享連結，不可看時段如下：`、`Given: 分享連結的版本高於本工具支援的版本` | 以舊版格式預載／編成連結，驗證遷移與版本檢查 | FR-313、邊界情況 |
| ADD | `specs/truth/features/web/分享與保存/dsl.md` -> `Then: 手機的時段頁顯示不可看時段如下：`、`Then: 手機的選片頁層內順序如下：` | 驗證手機取代後有空時段與層內順序與電腦一致 | FR-313 |
| MODIFY | `specs/truth/features/web/分享與保存/設定保存.feature` | 新增 Rule：層內順序重開仍保留；新增 Rule：小時格子設定（含部分沒空）重開仍保留；原 Rule 不變 | acceptance/在同一層裡排出先後.feature Rule 1；FR-313 |
| MODIFY | `specs/truth/features/web/分享與保存/舊版相容.feature` | Rule 標題「在 002 開啟」改為「在新版開啟」；新增 Rule：001 層內順序依場次表影片順序初始化；002 不可看時段轉為有空時段（列表與格子）；001 連結含不可看時段確認取代後轉換；版本高於 3 的連結視為無法讀取 | FR-313、邊界情況；acceptance/用小時格子設定有空時段.feature Rule 6、在同一層裡排出先後.feature Rule 5 |
| MODIFY | `specs/truth/features/web/分享與保存/跨裝置分享.feature` | 新增兩個 Rule：個人分享連結帶有層內順序、帶有有空時段，手機取代後與電腦相同；原 Rule 不變 | FR-313 |
| MODIFY | `specs/truth/features/web/分享與保存/合併結果分享.feature` | 兩個 Rule 標題補上「含一起與自己標示」「一起 2 張、自己 1 張的張數」；Example 步驟不變（由 DSL 的 MODIFY 提高驗證強度） | FR-310、FR-312、FR-313 |
| NOOP | `specs/truth/features/web/分享與保存/兩人設定保存.feature` | 已檢查：仍成立 | SC-305 |
| NOOP | `specs/truth/features/web/兩人模式/**` | 已檢查：加入、取代、移除同伴與橫幅的規則不變；「不可看時段」一詞依共通約定指有空時段的補集，`已保存的同伴不可看時段如下：` 等列語意不變 | FR-201～FR-204、FR-209 |
| NOOP | `specs/truth/features/scraper/**` | 已檢查：抓資料腳本與場次快照不受本 plan 影響；稽核 PASS | 範圍不含官網解析 |
