# UI Hooks（web steps 依賴的定位點）

GREEN 階段實作 `src/ui/**` 時必須提供下列定位點。唯一來源：`tests/support/web-a-helpers.ts`、`web-b-helpers.ts`、`tests/steps/web/*.steps.ts`。
慣例：testid 用 kebab-case；片名放 `data-title`（影片卡）或 `data-film`（搶票列）；日期 `YYYY-MM-DD` 放 `data-date`；層級放 enum（`must|want|maybe`）。

## 路由與導覽

| 頁面 | 定位點 | 屬性／行為 | 使用檔 |
| --- | --- | --- | --- |
| 全域 | `nav` aria-label=`主要分頁`，內含 link（由左到右）：`時段` `選片` `行程` `搶票` `分享`（accessible name 完全相符） | hash 路由：`#/pick` `#/slots` `#/itinerary` `#/tickets` `#/share`；首頁（無 hash）落在時段（004） | web-a-helpers（navLink/openTab）、行程/搶票/分享與保存 steps |
| 全域 | 錯誤訊息文字 | 畫面顯示的錯誤為完整文字節點（`getByText(exact)`），不得出現技術錯誤碼、堆疊、`undefined`、`NaN` | shared.steps |
| 全域 | 手機 390px 寬 | `main` 內任何元素 right ≤ viewport；ticket-row 內不得 overflow-x 裁切 | shared.steps |

## 選片頁 `#/pick`

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=film-card` | `data-title=<片名>` | 每部片一張卡；內含 `<details>`/`summary` 展開，或名稱含「展開」的 button | web-a-helpers(filmCard/expandCard)、選片/時段/shared steps |
| button `必看` `想看` `有空再看`（卡片內，name 完全相符） | `aria-pressed=true|false`；已啟用者再按＝取消 | 層級切換；任一時刻最多一個 pressed（不含「不看」） |
| button `不看`（卡片內，exact） | `aria-pressed`；再按＝取消；與三個層級互斥（004） | 不看的片在「全部」「未標記」篩選隱藏 |
| 篩選 chips（`aria-pressed`）`全部` `已標記` `未標記` `不看` | `不看` 只列出不看的影片（004） | | 選片、分享與保存、行程 steps |
| `data-testid=hot-badge` | 卡片內；熱門時可見 | 熱門標示 | shared/選片 steps |
| checkbox name 含「熱門」（卡片外觀上，不必展開；004；不看的片不渲染） | checked＝熱門；觸控目標 ≥ 44px | 熱門開關 | shared/選片 steps |
| `data-testid=session-row` | 卡片內每場一列，依日期、開演排序 | 文字含 `11/15（日）`、`HH:MM`、`<片長> 分鐘`、影廳、標記名稱（影人出席／華語無中英字幕／非英語無英文字幕／非售票活動）；不可看場次文字含「不可看」 | 選片、時段 steps |
| 卡片文字含分級（如 `12+`） | | | 選片 steps |
| `data-testid=tier-counts` | 文字含 `<n> 必看`、`<n> 想看`、`<n> 有空再看`、`<n> 不看`（004） | 頁首計數 | 選片 steps |
| text `標記說明`（可點）→ `data-testid=mark-legend` | 內文含 `<符號> <意義>` 逐列 | 展開後可見 | 選片 steps |
| `data-testid=load-error` + button `重試` | 載入失敗時顯示；此時不渲染 film-card／session-row | | 選片 steps |
| link 或 button，文字完全為 `排行程` | 按下後進入行程頁並計算 | | web-a-helpers(pressSchedule) |

## 時段頁 `#/slots`

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=day-cell` | `data-date`、`aria-pressed` | 日曆格，可多選 | 時段 steps |
| label `開始時間`、`結束時間` | input（可 fill `HH:MM`） | | 時段 steps |
| 錯誤文字 `結束時間需晚於開始時間` | 結束 ≤ 開始時顯示 | | 時段 steps |
| button 名稱含 `套用` | 輸入不合法時 disabled（click／Enter 都不得送出） | | 時段 steps |
| button `整天不可看` | | | 時段 steps |
| `data-testid=slot-item` | `data-date`；內含 `data-testid=slot-range`（文字 `HH:MM–HH:MM` 或 `整天不可看`）與 button 名稱含 `刪除` | 已設定時段列表 | 時段、shared steps |
| `data-testid=daily-limit-input` | 空值＝不設上限；離開欄位才確認 | | 時段、shared steps |
| `data-testid=daily-limit-error` | 非 0 以上整數時可見，文字符合 `0 以上…整數` | | 時段 steps |

## 行程頁 `#/itinerary`

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| heading，文字 `11/15（日）` | 依日期分組標題 | | shared、搶票 steps |
| `data-testid=itinerary-entry` | `data-date`、`data-tier` | 依日期再開演排序；文字含開演、散場（跨午夜顯示 `00:30` 式時間）、片名、影廳、層級、標籤（如 `非售票`、`★`） | shared、行程、搶票 steps |
| `data-testid=itinerary-empty` | 文字 `先到選片頁標記想看的片` | 無任何標記時 | web-a/b-helpers、行程 steps |
| `data-testid=itinerary-summary-must|want|maybe` | 文字含 `x/y` | 摘要 | 行程 steps |
| `data-testid=unscheduled-box` | 內有 heading（如 `有 1 部必看排不進去`）與 `li` 每片一項，文字 `<片名>：<原因>` | 全部排入時不渲染 | 行程 steps、web-a/b-helpers |
| 文字 `條件已變更，重新排程`（橫幅，完全相符）＋ button `重新排程` | 橫幅出現時保留舊行程 | | 行程 steps |

## 搶票頁 `#/tickets`

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=tickets-summary` | 文字完全等於 `搶到 x 部、未搶到 y 部` | | 搶票 steps |
| link 或 button `依搶到結果重新排程` | 按下後切到行程頁 | | 搶票 steps |
| `data-testid=ticket-pending`／`ticket-done` | 容器：未處理區／已完成區 | | shared、搶票 steps |
| `data-testid=ticket-row` | `data-film=<片名>`、`data-state=pending|got|dead` | 每片一列；非售票場次不進清單 | 全部搶票相關 steps |
| `data-testid=ticket-order` | 文字為純數字 | 順序號 | 搶票 steps |
| `data-testid=ticket-session` | 文字含 `11/15（日）`、`HH:MM`、影人出席場次含 `★` | 目前要搶的場次 | 搶票、分享 steps |
| `data-testid=ticket-backup` | 每個備案一項（`<details>` 內），文字格式同 ticket-session；無備案時列內出現文字 `無不衝堂備案` | | web-b-helpers(backupTexts) |
| button `搶到`／`沒搶到`／`撤銷`（列內，exact） | got 或 dead 時 `搶到`／`沒搶到` 不存在或 disabled；`撤銷` 於 got／已標記列可用 | | 搶票、shared steps |
| 已搶到列文字含 `已搶到`；dead 列文字含 `已無可用場次` | | | shared、搶票 steps |
| `data-testid=ticket-drag-handle` | 桌機拖曳把手 | | 搶票 steps |
| button `上移`／`下移`（列內） | 觸控裝置（maxTouchPoints>0）使用 | | 搶票 steps |

## 分享

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| link 或 button `分享`（exact） | 搶票頁右上角入口 | | 分享與保存 steps |
| `data-testid=share-url` | input（value）或文字；完整分享網址 | | 分享與保存 steps |
| `data-testid=share-qr` | `data-url=<與 share-url 相同>`；內含 role=img name 含 `QR` | | 分享與保存 steps |
| button `複製連結`（exact，enabled） | | | 分享與保存 steps |
| 文字 `用手機掃描，在手機上打開同一份清單` | | | 分享與保存 steps |
| role=`dialog`（開啟分享連結時） | 文字含 `要用這份設定取代此裝置的設定嗎？`；button 名稱含 `取代`、button `取消`；確認前不得改寫本機保存 | | 分享與保存 steps |
| 損毀連結錯誤文字 `這個分享連結無法讀取，請在原裝置重新產生`（完全相符） | 不出現 dialog | | 分享與保存 steps |
| 確認取代後 | 進入 `#/tickets` 且 ticket-row 已顯示 | | 分享與保存 steps |

## 資料契約（steps 直接讀寫）

- 使用者狀態：`localStorage[STORAGE_KEY]`（`src/state/storage.ts`），JSON 為 `UserState`；狀態改變後同步寫入，Then 不重新載入也能讀到。
- 場次快照：`GET **/data/sessions.json`（steps 以 route 攔截）。

## 002 兩人模式

唯一來源：`tests/support/web-duo-helpers.ts`、`tests/steps/web/兩人模式.steps.ts`、`行程.steps.ts`、`搶票.steps.ts`、`分享與保存.steps.ts`。
所有對話一律 `role=dialog`，同一時間最多一個可見。確認／取消按鈕名稱皆 exact。

### 頂部橫幅（五個分頁都有；個人模式完全不渲染）

| 定位點 | 說明 |
| --- | --- |
| `data-testid=duo-banner` | 兩人模式時每頁頂部渲染；個人模式不得存在 |
| `data-testid=duo-banner-text` | 文字完全等於 `兩人模式：{自己} ＋ {同伴}`（全形 `：`、`＋`，前後各一個空白） |
| button `移除同伴`（exact，位於橫幅內） | 按下開確認對話：文字 `要移除同伴「{同伴名稱}」嗎？`，button `確認`、`取消`；確認後清除 partner 與 self_name（truth：兩人名稱一併清除），保留 ticket_marks 與自己的設定 |
| 個人模式 | 頁面不得出現文字 `兩人模式`，也不得有 `移除同伴` 按鈕 |

### 個人分享連結對話（`#/import?d=…`，payload kind=personal 或缺 kind 的 v1）

| 定位點 | 說明 |
| --- | --- |
| heading（exact） | `這是「{名稱}」的選片。`；連結沒有名稱時 `這是同伴的選片。` |
| 說明文字 | 含 `要用這份設定取代此裝置的設定嗎？` |
| buttons（exact，且只有這三個） | `當作同伴加入`、`取代我的設定`、`取消` |
| `取代我的設定` | 不需第二次確認；完成後進 `#/tickets` 且 ticket-row 已顯示；不進兩人模式 |
| `當作同伴加入` | 此裝置沒有同伴 → 名稱輸入畫面；已有同伴 → 取代同伴確認 |
| 損毀連結 | 沿用 001：文字 `這個分享連結無法讀取，請在原裝置重新產生`，不出現 dialog |

### 名稱輸入畫面

| 定位點 | 說明 |
| --- | --- |
| `data-testid=name-dialog`（role=dialog） | 首次當作同伴加入、此裝置沒有同伴時出現 |
| input，label（exact）`自己名稱`、`同伴名稱` | 預設值：自己 `我`；同伴 = 連結 sender_name，沒有則 `同伴` |
| button `確認`（exact，dialog 內） | 寫入 self_name、partner；完成後橫幅出現。確認之前本機保存不得有 partner／self_name |

### 取代同伴確認

| 定位點 | 說明 |
| --- | --- |
| `data-testid=replace-partner-dialog`（role=dialog） | 已有同伴時選 `當作同伴加入` 後出現 |
| 文字 | `要用這份取代目前的同伴嗎？` |
| buttons `確認`、`取消`（exact） | 確認後同伴資料換成新連結內容（自己的設定不動）；確認之前本機保存的 partner 仍是舊的 |

### 行程頁 / 搶票頁

| 頁面 | 定位點 | 說明 |
| --- | --- | --- |
| 行程 | ~~`data-testid=single-side-stats`~~ **（003 已移除，見下方「003」章節；UI 不得再渲染）** | 僅兩人模式且行程頁顯示；文字完全等於 `只有 {自己} 標記：{n} 部、只有 {同伴} 標記：{m} 部（不排入）`；個人模式不得渲染，頁面也不得有 `只有 … 標記` 文字 |
| 行程 | ~~兩人沒有共同標記~~ **（003 已移除：兩人各自排程，沒有「共同分層」空狀態）** | ~~沿用 `行程頁顯示提示`：完整文字 `兩人沒有共同標記的片，先到選片頁一起挑`（getByText exact）~~ |
| 搶票 | `data-testid=ticket-quantity`（位於 ticket-row 內） | **（003 改版）** 兩人模式每列（pending 與 done 區）一起看 `買 2 張`、自己看 `買 1 張`（舊的「每列買 2 張」已移除）；個人模式任何列都不得出現 `買 N 張` |

### 分享頁（合併結果）

| 定位點 | 說明 |
| --- | --- |
| 文字 `合併結果連結` | 僅兩人模式的分享畫面出現（個人模式分享畫面不得含此文字）；仍須有 `share-url`、`share-qr`（`data-url` 相同）、button `複製連結` |
| `share-url` 的連結內容 | **（003：schema_version 改為 3，payload 的 state 以 `availability` 取代 `unavailable_slots`、分層帶 `tier_rank`；讀取仍接受 1、2、3，高於 3 視為損毀。以下為 002 描述，僅供對照）** `#/import?d=` + lz-string `compressToEncodedURIComponent(JSON.stringify(payload))`；merged：`payload = { kind: "merged", schema_version: 2, state }`，`state` 含 `self_name`、`partner`（display_name、daily_limit、film_preferences、unavailable_slots）、manual_order、ticket_marks；personal：`{ kind: "personal", schema_version: 2, sender_name, state }`；001 版連結 = 直接是 schema_version 1 的 UserState（沒有 kind，視為 personal） |

### 合併結果連結對話

| 定位點 | 說明 |
| --- | --- |
| heading（exact） | `這是「{自己} ＋ {同伴}」的合併結果。` |
| 說明文字 | `開啟後會取代此裝置目前的設定。` |
| buttons（exact，且只有這兩個） | `取代並開啟`、`取消`；不得有 `當作同伴加入` |
| `取代並開啟` | 完成後進入兩人模式（橫幅出現）且搶票頁 ticket-row 已顯示；手動順序與搶票標記一併取代 |

### 資料契約補充

- **（003 起寫入 `schema_version: 3`，見「003」章節）** 使用者狀態寫入 `schema_version: 2`，新增 `self_name`（string|null）與 `partner`（`{ display_name, daily_limit, film_preferences[], unavailable_slots[] }`｜null）；讀取接受 1（個人模式）與 2。
- 同伴分層的 `film_id` 可以不在場次快照中（steps 用 `__not_in_catalog__:<片名>` 合成 id）；合併時須忽略。

## 003 兩人各自片單、層內排序、小時格子

唯一來源：`tests/support/web-003-helpers.ts`、`tests/steps/web/shared.steps.ts`、`時段.steps.ts`、`選片.steps.ts`、`行程.steps.ts`、`搶票.steps.ts`、`分享與保存.steps.ts`。
慣例同上。保存格式 `schema_version: 3`（見 `specs/truth/data/data-model.dbml`）：
- `film_preferences[]` 帶 `tier_rank`（同層 1 起連續）。
- `availability: [{ date, intervals: [{ start_min, end_min }] }]`；沒有該日期的列 = 全天有空；`intervals` 為空 = 整天沒空；正規化（排序、合併相鄰、恰為 0–1440 則不保留該列）。`partner` 內同樣帶 `availability`、`tier_rank`。
- 不再寫入 `unavailable_slots`；畫面的「不可看時段」是有空時段的補集（24:00 為當日結尾）。
- 測試預載（Given）一律以 v3 寫入；`裝置上保存的是 001／002 版本格式…` 以舊格式（無 `tier_rank`／`availability`，有 `unavailable_slots`）預載，開啟後 UI 須依遷移規則讀成 3，下次保存才以 3 寫回。

### 時段頁 `#/slots`：小時格子（新增）

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=hour-cell`（`<button>`） | `data-date`、`data-hour`（0–23）、`data-state=free|busy|partial` | 每個已選取日期各有 24 格（選取日期後才渲染該日的 24 格）；可見文字含 `有空`／`沒空`／`部分沒空`（不得只靠顏色，三種文字互不相同）；點擊恰好一次：有空→沒空、部分沒空→沒空、沒空→有空；選取多日時，在任一被選日期的格子點擊，所有被選日期的同一小時各自依自身狀態切換 | 時段、shared steps |
| 沿用 `day-cell`、`slot-item`、`slot-range` | | 小時格子與不可看時段編輯同一份資料：`slot-item` 列出有空時段的補集；整天有空的日期沒有 `slot-item`；整天沒空顯示 `整天不可看` | 時段、shared steps |

### 選片頁 `#/pick`：層內順序檢視（新增）

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=tier-order-group` | `data-tier=must|want|maybe` | 三層各一個容器（可無影片）；容器內 `tier-order-item` 依層內名次由前到後排列 | 選片、shared、分享與保存 steps |
| `data-testid=tier-order-item` | `data-title=<片名>` | 該層每部已標記影片一項 | 同上 |
| button `上移`／`下移`（item 內，accessible name 完全相符） | 層內第一位的 `上移`、最後一位的 `下移` 為 `disabled`；點擊與相鄰者互換名次並立即更新畫面與保存 | 兩人模式也只調整自己的順序 | 選片 steps |
| 既有 `film-card` 的層級按鈕 | 新標記或改層的影片排在目標層最後 | | 選片 steps |

### 行程頁 `#/itinerary`：一起／自己、篩選、未排入必看片（新增／改版）

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=participant-tag`（位於 `itinerary-entry` 內） | 文字完全等於 `一起` 或 `{名字} 自己` | 僅兩人模式每一列都有；個人模式完全不渲染 | shared、分享與保存 steps |
| `data-testid=itinerary-filter` | 內含 `role=radio` 三個，順序與名稱（exact）：`全部`、`只看自己`、`只看同伴`；選中者 `aria-checked=true`，預設 `全部` | 僅兩人模式渲染；個人模式不得有此元素、也不得有同名 radio；篩選是畫面狀態，不保存、不觸發重新排程 | 行程 steps |
| 篩選語意 | `只看自己` = 一起與{自己} 自己；`只看同伴` = 一起與{同伴} 自己 | 每列層級色塊與 `data-tier` 顯示「視角」那個人的層級：預設視角為自己；`只看同伴` 為同伴；`全部` 中同伴自己看的列顯示同伴層級 | shared steps |
| `data-testid=unscheduled-owner`（位於未排入 `li` 內） | 文字為名字（如 `Fischer`） | 僅兩人模式；標明這部必看是誰的。`li` 其餘文字（扣掉此元素後）仍為 `<片名>：<原因>` | 行程 steps |

### 搶票頁 `#/tickets`（改版）

| 定位點 | 說明 |
| --- | --- |
| `data-testid=ticket-quantity` | 兩人模式每列（pending 與 done 區）：一起看 `買 2 張`、自己看 `買 1 張`；清單只列自己行程中的場次（同伴自己看的片不出現）；個人模式不得出現任何 `買 N 張` |

### 分享頁（改版）

| 定位點 | 說明 |
| --- | --- |
| 個人／合併結果連結 payload | `schema_version: 3`；personal：`{ kind, schema_version: 3, sender_name, state }`；state 含 `availability`、分層 `tier_rank`；版本 1、2 的連結開啟時轉成 3；版本 4 以上顯示 `這個分享連結無法讀取，請在原裝置重新產生`，不出現 dialog、不改本機保存 |

### 已移除的 002 定位點（003）

- `single-side-stats`（行程頁單方標記統計）與其「只有 … 標記」文字。
- 行程頁 `兩人沒有共同標記的片，先到選片頁一起挑` 空狀態提示。
- 搶票頁「每列 `買 2 張`」（改為一起 2／自己 1，見上）。

## 004 不看、熱門外移、時段先於選片、使用說明

- 選片卡：button `不看`（exact，`aria-pressed`）；篩選 chip `全部` `已標記` `未標記` `不看`；`tier-counts` 多一格 `不看`。保存欄位 `skipped_film_ids`（選填，與 `film_preferences` 互斥，隨分享連結帶出）。
- 熱門 checkbox（name 含「熱門」）在收合的卡片面上，label 高度 ≥ 44px；展開區不再有第二個。不看的片不渲染熱門開關。
- 時段頁底部 link `下一步：選片`（`#/pick`）；選片頁保留 `排行程`。
- 使用說明：`data-testid=onboarding-dialog`（role=dialog），`onboarding-progress`（`n/4`）、`onboarding-title`；buttons `上一步` `下一步` `開始使用` `略過`；頁首 button `使用說明`（aria-label，顯示 `?`）。已看過記錄 localStorage `ghff-picker:onboarding-seen`。測試預設由 context init script 預載該記錄；Given `觀眾是第一次使用…` 設 cookie `ghff_first_time=1` 讓它不預載。

## 005 兩人搶票分工（搶票頁 `#/tickets`，僅兩人模式）

唯一來源：`tests/steps/web/搶票.steps.ts`、`tests/support/web-b-helpers.ts`。

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=division-tabs`（`role=tablist`）內兩個 `role=tab` | 名稱（exact）：`我的順序`、`{同伴名字}的順序`；`aria-selected`；高度 ≥ 44px | 預設「我的順序」；切換只改畫面，不保存 | 搶票 steps |
| `data-testid=division-summary` | 文字 `{自己} {n} 筆 {m} 張・{同伴} {n} 筆 {m} 張` | 兩個分頁都顯示 | 搶票 steps |
| `data-testid=ticket-participant`（位於 ticket-row 內） | 文字 `一起` 或 `自己` | 與 `ticket-quantity`（`買 2 張`／`買 1 張`）並列；個人模式不渲染 | 搶票 steps |
| `ticket-row` 的 `data-participant` | `together`／`self`／`partner` | 方便除錯，非必要 | — |
| 分頁清單為空 | 文字 `沒有要搶的場次` | | 搶票 steps |
| 兩人模式的列 | 不渲染 `ticket-drag-handle`、`上移`、`下移` | 手動順序僅個人模式 | 搶票 steps |
