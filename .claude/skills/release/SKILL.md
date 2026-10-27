---
name: release
description: Balanza 發新版本時使用：功能或修正已經改完、準備 commit 推上 main 之前，更新版號、Service Worker 快取名、兩份更新紀錄與交接紀錄。只改文件或 data/ 時不要用。
---

# Balanza 發版流程

程式改完、推上 main 之前，照順序做完每一步。任何一步漏掉，手機上的 App 都可能不會更新。

## 1. 決定版號

先讀 `app.js` 第 3 行的 `APP_VERSION`，依改動決定新版號：

| 改動 | 版號 | 例子 |
|---|---|---|
| 修錯、微調畫面 | 第三碼 +1 | 6.3.1 → 6.3.2 |
| 新功能 | 第二碼 +1，第三碼歸 0 | 6.3.2 → 6.4.0 |
| 大改版（資料格式、整體重做、分頁結構改變） | 第一碼 +1 | 6.4.0 → 7.0.0 |

同時有好幾種改動時，取最大的那一種。

把預計的新版號和理由列給使用者看，確認後再繼續。

## 2. 改版號（兩處，要一致）

- `app.js`：`const APP_VERSION = 'X.Y.Z';`
- `sw.js`：`const CACHE = 'balanza-vX-Y-Z';`（點換成橫線）

`sw.js` 沒改的話，手機會一直用舊的快取，看不到新版。

## 3. 更新紀錄（兩處，內容要一致）

- `changelog.js`：在 `CHANGELOG` 陣列**最前面**加一筆：
  ```js
  {
    v: 'X.Y.Z', date: 'YYYY-MM-DD', title: '一句話標題',
    items: [
      '使用者看得懂的說明，不寫函式名稱',
    ],
  },
  ```
- `CHANGELOG.md`：在「# 更新紀錄」說明段落之後、上一版之前加：
  ```md
  ## vX.Y.Z — 一句話標題（YYYY-MM-DD）

  - 同樣的說明
  ```

日期用台灣時間。說明寫給使用者看：寫「改了什麼、看到什麼」，不寫實作細節。

## 4. 新檔案檢查

這次如果新增了 `.js` 檔：

- `index.html`：加進 `<script>` 清單，放在用到它的檔案之前（`app.js` 永遠最後）
- `sw.js`：加進 `ASSETS` 陣列

沒加進 `ASSETS`，App 離線時會壞掉。

這次如果改了 iPhone 開機圖（`splash/`）或主畫面圖示：

- **換新檔名**（例如 `splash/v7-…`、`icon-v3-180.png`），`index.html`、`manifest.json`、`sw.js` 的引用一起改。iPhone 只在「加入主畫面」時讀這些檔，URL 不變就永遠用舊的
- 回報時提醒使用者：刪掉主畫面捷徑重新加入；刪之前先備份，AI 金鑰不在備份裡要重貼

## 5. 自我檢查

用指令確認，不要憑記憶：

```bash
grep -n "APP_VERSION =" app.js
grep -n "const CACHE" sw.js
head -6 changelog.js
grep -m1 "^## v" CHANGELOG.md
```

四個地方的版號要一致。有不一致就修好再往下。

再用 `node --check` 檢查改過的 .js 沒有語法錯誤，並用 `git diff --stat` 確認行數合理（沒有整個檔案被清空）。

畫面有改的話：本機 `python3 -m http.server 8765` 加 Playwright，在 390px 寬、淺色和深色各看一次改到的分頁（做法見 `CLAUDE.md`「測試方式」）。

## 6. 交接

更新 `HANDOFF.md` 最上面一筆：版本、做了什麼、下一步、這次踩到的坑。

## 7. 提交

commit 訊息格式：`vX.Y.Z: 一句話標題`。

推送一律用：

```bash
git fetch origin main && git rebase FETCH_HEAD && git push origin HEAD:main
```

GitHub Actions 每天會自動提交股價、基金資料，不先 rebase 會被拒。推上 main 後，GitHub Pages 約 1～2 分鐘部署完成。

最後回報使用者：新版號、改了哪些檔案、第 5 步的檢查結果。
