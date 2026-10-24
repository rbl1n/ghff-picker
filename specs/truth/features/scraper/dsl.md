# 官網場次抓取共用 DSL

跨模組共用句型。模組專屬句型寫在 `{模組}/dsl.md`。

目前只有「場次解析」一個模組，因此沒有可升格的跨模組 DSL row。

## 介面共通約定

- 介面性質：一次性 Node 腳本中的解析層（`scripts/scrape/parse.ts`）。step 把 HTML 字串餵給解析函式，不連網、不啟動瀏覽器。
- 被解析的頁面：官網場次表頁（伺服器端渲染 HTML，以影城為表頭分組，每列一個場次）。
- 輸出：場次快照資料（影片、場次、影廳、影城、標記），欄位與 `specs/truth/data/data-model.dbml` 的 films / sessions / venues 一致。
