Feature: 把同伴的選片加進來不蓋掉自己的

  Rule: 開啟同伴的個人分享連結時，可以當作同伴加入，且自己的設定不變

    Example: Fischer 打開小美傳來的連結，當作同伴加入並輸入兩人姓名
      Given "Fischer" 的裝置上已有自己的分層與每日上限 2 部
      And "小美" 傳來一份個人分享連結，內容含她的分層、不可看時段與每日上限 3 部
      When "Fischer" 開啟該連結
      Then 畫面顯示「這是「小美」的選片」，並提供「當作同伴加入」「取代我的設定」「取消」三個選項
      When "Fischer" 選「當作同伴加入」
      Then 畫面要求輸入自己與同伴的顯示名稱，預設為「我」與「同伴」
      When "Fischer" 輸入自己為 "Fischer"、同伴為 "小美" 並確認
      Then 各頁頂部顯示「兩人模式：Fischer ＋ 小美」
      And "Fischer" 自己的分層、不可看時段與每日上限都和加入前相同
      And "小美" 的分層、不可看時段與每日上限 3 部另存為同伴資料

  Rule: 選「取代我的設定」時，行為與個人模式的分享連結相同

    Example: Fischer 選取代我的設定，以連結內容取代自己的設定
      Given "Fischer" 的裝置上已有自己的分層
      And "小美" 傳來一份個人分享連結
      When "Fischer" 開啟該連結並選「取代我的設定」
      Then "Fischer" 的分層、不可看時段與每日上限都變成連結的內容
      And 此裝置仍是個人模式，沒有同伴

  Rule: 已有同伴時，加入新同伴前必須先確認取代

    Example: Fischer 已有同伴小美，再加入另一份連結前被要求確認
      Given "Fischer" 已和 "小美" 進入兩人模式
      And 另一位同伴傳來一份個人分享連結
      When "Fischer" 開啟該連結並選「當作同伴加入」
      Then 畫面詢問「要用這份取代目前的同伴嗎？」
      When "Fischer" 確認取代
      Then 同伴資料變成新連結的內容
      And "Fischer" 自己的設定不變

  Rule: 移除同伴後回到個人模式，自己的設定與搶票標記都保留

    Example: Fischer 移除同伴小美
      Given "Fischer" 已和 "小美" 進入兩人模式
      And "Fischer" 已把「紅色沙漠」標記為搶到
      When "Fischer" 按「移除同伴」並確認
      Then 各頁頂部不再顯示兩人模式，回到個人模式
      And "Fischer" 自己的分層、不可看時段與每日上限不變
      And 「紅色沙漠」的搶到標記仍保留

  Rule: 同伴連結損毀時不改變任何資料

    Example: 小美的連結被截斷
      Given "Fischer" 的裝置上已有自己的分層
      And "小美" 傳來的連結內容已損毀
      When "Fischer" 開啟該連結
      Then 畫面顯示「這個分享連結無法讀取，請在原裝置重新產生」
      And "Fischer" 的設定完全沒有被改動
