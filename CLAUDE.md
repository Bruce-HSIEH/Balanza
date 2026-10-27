# Balanza — 給 Claude 的工作規則

每次開工先讀這份，再讀 `SPEC.md`（規格）和 `HANDOFF.md`（上次做到哪）。

## 工作方式

1. **先列計畫，等我說「做」才動手。** 計畫要寫：會改哪些檔案、哪些函式、可能影響哪些分頁。
2. **照 `SPEC.md` 實作。** 需求跟規格衝突時，先停下來問我，不要自己決定。規格改了，`SPEC.md` 一起改。
3. **只改這次需要改的地方。** 不順手重構、不改無關的排版或命名。
4. **新功能優先開新檔案**（例如 `xxx.js`），用函式介面跟 `app.js` 溝通，不要再往 `app.js` 塞。新檔案記得加進 `index.html` 的 `<script>` 和 `sw.js` 的 `ASSETS`。
5. **收工前更新 `HANDOFF.md`**：做了什麼、下一步、踩到的坑。

## 絕對不能做

- 不能讓財務資料進 repo（資料只存在手機 localStorage／加密 vault）
- 不能把 API 金鑰、GitHub token 寫進程式碼或 commit
- 不能改 `migrate()` 而不保留舊資料相容（使用者手機裡有舊格式資料）
- 不能刪除或改名 `state` 裡已存在的欄位，只能新增
- 不能動 `lock.js`、`backup.js` 的加密參數（改了會解不開舊備份）
- 不能把 `ai`（API 金鑰）、`backup`（GitHub token、恢復金鑰）放進備份檔；`backupPayload()` 是刻意排除的

## 寫程式規則

1. **用 Python／腳本改檔：先讀進變數，再寫回。** 不能在同一行 `open(p,'w').write(open(p).read()...)`——`'w'` 一打開就把檔案清空，等於先擦 flash 再讀舊內容（曾經把 `app.js` 清成 0 byte）。改完用 `git diff --stat` 確認行數合理。
2. **render 會用到的 `let`／`const` 要宣告在檔案前面。** 宣告之前就被讀取會丟 TDZ 錯誤，整個 App 開機就當掉；就像全域變數還沒初始化，中斷服務程式就先拿去用。
3. **SVG 漸層、clipPath 的 `id` 一律加唯一前綴（用 `uniq()`）。** 同一頁有很多張 inline SVG，`id` 是全頁共用的命名空間，撞名會互相覆蓋。畫在直線（寬或高為 0）上的漸層要用 `gradientUnits="userSpaceOnUse"`，否則畫不出來。
4. **動畫一律用 `ui.js` 的 JS 逐格引擎，不用 CSS `animation`／`@keyframes`。** iOS 切頁或 App 切到背景再回來，CSS 動畫會停住；JS 逐格等於自己用計時器驅動狀態機，比較可靠。小秤的特效透過 `UI.extend({fx, motion})` 註冊。

## 測試方式

- 本機開 `python3 -m http.server 8765`，用 Playwright 開 390px 寬，淺色、深色各看一次
- 用 `enterSim('rich' | 'normal' | 'debt')` 灌模擬資料；先在 localStorage 設 `balanza.seenVersion` 為目前版號，才不會每次跳更新紀錄
- Face ID、iPhone 開機畫面、主畫面圖示在沙箱測不到，要請我用手機實測

## 發版檢查清單（每次改功能都要做）

- [ ] `app.js` 的 `APP_VERSION` 加版號：大版＝架構或分頁結構改變、中版＝新功能、小版＝修正與微調；同時有就取大的
- [ ] `sw.js` 的 `CACHE` 名稱跟著改（否則手機不會更新）
- [ ] `changelog.js` 與 `CHANGELOG.md` 都加一筆，內容一致（新的放最上面）
- [ ] 新增的 .js 有加進 `index.html` 和 `sw.js` 的 `ASSETS`
- [ ] 手機寬度（約 390px）和深色模式下看過一次
- [ ] 有改 iPhone 開機圖（`splash/`）或主畫面圖示時：**換新檔名**（例如 `splash/v7-…`、`icon-v3-180.png`），並提醒我刪掉主畫面捷徑重新加入（刪之前先備份，AI 金鑰要重貼）
- [ ] 推送用 `git fetch origin main && git rebase FETCH_HEAD && git push origin HEAD:main`（Actions 每天會自動提交資料，不先 rebase 會被拒）

## 我的背景

- 我是韌體工程師，熟 C 與模組化，但前端是邊做邊學；解釋時用韌體的比喻我會比較快懂
- 回覆用繁體中文
