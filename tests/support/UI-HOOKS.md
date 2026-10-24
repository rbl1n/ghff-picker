# UI Hooks（web steps 依賴的定位點）

GREEN 階段實作 `src/ui/**` 時必須提供下列定位點。唯一來源：`tests/support/web-a-helpers.ts`、`web-b-helpers.ts`、`tests/steps/web/*.steps.ts`。
慣例：testid 用 kebab-case；片名放 `data-title`（影片卡）或 `data-film`（搶票列）；日期 `YYYY-MM-DD` 放 `data-date`；層級放 enum（`must|want|maybe`）。

## 路由與導覽

| 頁面 | 定位點 | 屬性／行為 | 使用檔 |
| --- | --- | --- | --- |
| 全域 | `nav` aria-label=`主要分頁`，內含 link：`選片` `時段` `行程` `搶票` `分享`（accessible name 完全相符） | hash 路由：`#/pick` `#/slots` `#/itinerary` `#/tickets` `#/share`；首頁（無 hash）落在選片 | web-a-helpers（navLink/openTab）、行程/搶票/分享與保存 steps |
| 全域 | 錯誤訊息文字 | 畫面顯示的錯誤為完整文字節點（`getByText(exact)`），不得出現技術錯誤碼、堆疊、`undefined`、`NaN` | shared.steps |
| 全域 | 手機 390px 寬 | `main` 內任何元素 right ≤ viewport；ticket-row 內不得 overflow-x 裁切 | shared.steps |

## 選片頁 `#/pick`

| 定位點 | 屬性 | 說明 | 使用檔 |
| --- | --- | --- | --- |
| `data-testid=film-card` | `data-title=<片名>` | 每部片一張卡；內含 `<details>`/`summary` 展開，或名稱含「展開」的 button | web-a-helpers(filmCard/expandCard)、選片/時段/shared steps |
| button `必看` `想看` `有空再看`（卡片內，name 完全相符） | `aria-pressed=true|false`；已啟用者再按＝取消 | 層級切換；任一時刻最多一個 pressed | 選片、分享與保存、行程 steps |
| `data-testid=hot-badge` | 卡片內；熱門時可見 | 熱門標示 | shared/選片 steps |
| checkbox name 含「熱門」（卡片展開後） | checked＝熱門 | 熱門開關 | shared/選片 steps |
| `data-testid=session-row` | 卡片內每場一列，依日期、開演排序 | 文字含 `11/15（日）`、`HH:MM`、`<片長> 分鐘`、影廳、標記名稱（影人出席／華語無中英字幕／非英語無英文字幕／非售票活動）；不可看場次文字含「不可看」 | 選片、時段 steps |
| 卡片文字含分級（如 `12+`） | | | 選片 steps |
| `data-testid=tier-counts` | 文字含 `<n> 必看`、`<n> 想看`、`<n> 有空再看` | 頁首計數 | 選片 steps |
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
