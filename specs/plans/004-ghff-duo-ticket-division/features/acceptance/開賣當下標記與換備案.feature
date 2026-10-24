Feature: 開賣當下標記與換備案

  Rule: 一起看的片沒搶到，換成兩人都可行的備案，仍由原負責人買 2 張

    Example: Fischer 在北方按「沒搶到」，換成兩人都有空的 11/19
      Given "Fischer" 與 "小美" 已排好前一個故事的行程，北方排在 11/15
      When "Fischer" 在北方按「沒搶到」
      Then 北方改為 11/19，仍在 Fischer 的「我的順序」，買 2 張

    Example: 北方沒有兩人都可行的備案
      Given "小美" 11/19 整天沒空，北方只剩 11/15 兩人都有空
      When "Fischer" 在北方按「沒搶到」
      Then 北方顯示「已無可用場次」

  Rule: 在同伴的順序也能標記搶到或沒搶到

    Example: 小美口頭告知搶到夜行列車，Fischer 在「小美的順序」標記
      Given "Fischer" 與 "小美" 已排好前一個故事的行程
      When "Fischer" 在「小美的順序」把夜行列車標為搶到
      Then 夜行列車鎖定為搶到，標記保存在 Fischer 的手機
