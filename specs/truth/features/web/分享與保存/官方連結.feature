Feature: 官方連結

  Rule: 分享頁底部提供金馬影展官方連結，皆在新分頁開啟

    Example: 官方連結清單
      Given 場次快照包含以下場次：
        | 片名     | 日期       | 開演  | 片長 | 影廳              |
        | 夜行列車 | 2026-11-15 | 13:00 | 120  | 台北信義威秀 10廳 |
      When 觀眾打開分享頁
      Then 分享頁的官方連結如下：
        | 名稱                           | 網址                                                                              |
        | 金馬影展官網場次表             | https://www.goldenhorse.org.tw/film/programme/schedule/                           |
        | 購票資訊（售票時程與購票須知） | https://www.goldenhorse.org.tw/film/tickets_venues/ticketing/                     |
        | 購票（拓元）                   | https://tghff.tixcraft.com/                                                       |
        | 電子專刊（PDF）                | https://drive.google.com/file/d/1ryD9J45_LRHcQ2NcY539o27JfnXhbMnX/view            |
