# 系統分析規劃

## 專案結構

### 文件結構（本功能）

```text
specs/plans/001-ghff-solo-planner/
├── spec.md
├── research.md
├── plan.md
├── truth-delta.md
├── checklists/requirements.md
├── features/acceptance/*.feature
├── ui/
│   ├── ui-plan.md
│   └── *.html
└── tasks.md

specs/truth/
├── techstack.md
├── data/
│   └── data-model.dbml
└── features/
    ├── scraper/      # 抓資料腳本的介面 feature 與 DSL
    ├── planner/      # 排程引擎的介面 feature 與 DSL
    └── web/          # 網頁的介面 feature 與 DSL
```

### 原始碼結構（儲存庫根目錄）

```text
ghff-picker/
├── scripts/
│   └── scrape/
│       ├── scrape.ts          # 逐日抓官網場次頁
│       ├── parse.ts           # HTML → 場次資料
│       └── fixtures/          # 存下的官網 HTML 樣本
├── public/
│   └── data/
│       └── sessions.json      # 場次快照（進版控）
├── src/
│   ├── domain/                # 排程引擎：純函式、無 UI
│   │   ├── time.ts            # 分鐘數時間、散場計算
│   │   ├── availability.ts    # 不可看時段 → 場次可看
│   │   ├── compat.ts          # 轉場緩衝與相容判定
│   │   ├── schedule.ts        # 最佳行程搜尋與未排入原因
│   │   └── tickets.ts         # 搶票順序、備案、搶票狀態切換
│   ├── state/
│   │   ├── storage.ts         # localStorage 保存
│   │   └── share.ts           # 分享連結編解碼與 QR
│   ├── ui/                    # React 畫面與元件
│   └── main.tsx
├── tests/
│   ├── steps/                 # playwright-bdd step definitions（依介面分資料夾）
│   └── support/
├── playwright.config.ts
└── package.json
```

**結構決策**: 單一 repo、單一 Node 專案。排程引擎放在 `src/domain/`，維持純函式、不依賴 React，讓 `planner` 介面的 Gherkin 能直接呼叫（CL-011）；抓資料腳本放在 `scripts/`，不進前端 bundle。

## 分析流程規劃

### 系統介面的盤點

本次需求共盤點出 `4` 個系統介面。

1. `官網場次表抓取（scraper）`
   - 端點類型：`第三方網站 + 一次性 Node 腳本`
   - 主要介面：`官網場次頁 HTML（?search_date=）→ 場次快照 sessions.json 的欄位映射：影片、場次、影廳、影城（MUVIE = 松仁威秀）、標記`
   - 需求原文依據：`FR-001、FR-003、SC-007；CL-004（TITAN 屬松仁威秀）、CL-008（只取快照）；research 決策 2`

2. `排程引擎（planner）`
   - 端點類型：`前端內的純邏輯模組`
   - 主要介面：`輸入（場次快照、分層與熱門標記、不可看時段、每日上限、搶票標記）→ 輸出（場次可看狀態、最佳行程、未排入必看原因、搶票清單與備案、下一個備案）`
   - 需求原文依據：`FR-005～FR-017、FR-019～FR-021、NFR-001、NFR-003；spec「狀態與公式」；SC-002～SC-006`

3. `使用者狀態保存與跨裝置（state）`
   - 端點類型：`瀏覽器本機儲存 + 分享連結`
   - 主要介面：`localStorage 中的使用者狀態結構與版本；分享連結 hash 的編碼內容`
   - 需求原文依據：`FR-018、FR-022、SC-001；research 決策 5`

4. `選片排程網頁（web）`
   - 端點類型：`前端 webapp（手機與電腦瀏覽器）`
   - 主要介面：`選片分層、不可看時段設定、行程、搶票清單、搶票標記、分享／QR 畫面`
   - 需求原文依據：`使用者故事 1～5 的操作與畫面；NFR-002、NFR-004；features/acceptance/*.feature`

### 分析流程的安排

#### Wave 1

- 平行分析介面：
  - `官網場次表抓取（scraper）`
  - `排程引擎（planner）`
  - `使用者狀態保存與跨裝置（state）`
- 分析重點：
  - `場次快照的實體與欄位：影片、場次、影廳、影城、標記（含 spec 未提的「優先特映場」），以及時間以「日期 + 分鐘數」表示`
  - `使用者狀態的實體：分層、熱門、不可看時段、每日上限、手動順序、搶票標記；保存版本與分享連結內容範圍`
  - `排程引擎的衍生資料：行程、未排入原因、搶票清單項目與搶票狀態生命週期`
- 安排理由：`三者共用同一份資料模型（data-model.dbml），合併為一次 /data-plan 委派；網頁畫面依賴這些實體與狀態，必須先定。本專案無後端，不委派 /api-plan。`

#### Wave 2

- 平行分析介面：
  - `選片排程網頁（web）`
- 分析重點：
  - `畫面切分與 flow：選片分層 → 時段設定 → 行程 → 搶票清單 → 搶票當下標記 → 分享／QR`
  - `手機版面（不需左右捲動）、未排入原因與「無可用場次」等回饋、搶票當下一鍵切換的操作節奏`
- 安排理由：`畫面要呈現 Wave 1 定義的實體、衍生資料與搶票狀態，依賴 Wave 1 結果。`

### Planner 委派

| Wave | Planner | 承接介面 | 共用主產物 |
| --- | --- | --- | --- |
| 1 | `/data-plan`（單次合併委派） | scraper、planner、state | `specs/truth/data/data-model.dbml` |
| 2 | `/ui-plan` | web | `specs/plans/001-ghff-solo-planner/ui/**` |
| — | `/api-plan` | 無 | 本專案無後端 API（CL-009），記為 NOOP |

完成後進 `/dsl-refine`，以 scraper、planner、web 三個介面承接 `features/acceptance/**`；state 的保存與跨裝置行為由 web 介面的 E2E 承接。
