# Balanza 規格書

> 這份是「應該長怎樣」的依據。程式跟這份不一致時，先問我是程式錯還是規格要改。

## 1. 產品原則

- **不是記帳 App。** 只記週期性、固定的金額（貸款、扣繳、定期投入、薪資），目的是讓我知道「每個月花錢前一定要先付掉多少」。不記單筆日常消費。
- **還款分頁只看不寫。** 還款頁的資料全部來自負債、扣繳、投資計畫等其他頁，本身不提供輸入。
- **隱私優先。** 資料只在手機上；送給 AI 的內容只能是區間、比例、代號，送出前要給我確認。
- 之後要加：小孩教育基金、保險保費（屬於「扣繳」的延伸）。

## 2. 架構

純前端 PWA，GitHub Pages 部署，沒有後端。各 .js 依 `index.html` 的 `<script>` 順序載入，共用全域變數。

| 層 | 檔案 | 職責 |
|---|---|---|
| 計算（純函式，不碰畫面） | `loan.js`、`plan.js` | 貸款攤還、寬限期、投資計畫逐月推算 |
| 資料來源 | `stocks.js`、`lvr.js`、`data/` | 讀 GitHub Actions 產生的股價、基金、實價登錄 |
| 安全 | `lock.js`、`backup.js` | Face ID／PIN 加密、恢復金鑰備份到 Gist |
| 輸入輔助 | `voice.js`、`ai.js` | 口語解析、AI 整理（用我自己的金鑰） |
| 畫面元件 | `ui.js`、`charts.js`、`icons.js`、`cars.js`、`mascot2.js` | 選擇器、圖表、圖示、吉祥物 |
| 主程式 | `app.js` | 資料存取、表單、所有分頁的 render、設定 |

**目標方向：** `app.js`（約 4300 行）逐步把各分頁拆成獨立檔案，計算層維持純函式。

## 3. 資料模型（`state`，存在 `balanza.v1` 或加密 vault）

| 欄位 | 內容 | 輸入在哪 |
|---|---|---|
| `assets[]` | 資產；股票一檔一筆，買賣紀錄在 `lots[]` | 資產頁 |
| `debts[]` | 貸款；含 `changes[]` 歷程（寬限期、利率調整、提前還本） | 負債頁 |
| `bills[]` | 每月固定扣繳（訂閱、保險、房租、教育基金…） | 扣繳頁 |
| `plans[]` | 投資計畫（可連結理財型房貸） | 投資頁 |
| `incomes[]`、`raises[]`、`bonuses[]` | 薪資、調薪、獎金 | 收入頁（需 Face ID） |
| `ai`、`backup`、`currency` | 設定 | 設定頁 |

規則：舊資料一律經 `migrate()` 轉換；欄位只增不刪。

## 4. 分頁與資料依賴

| 分頁 | render 函式 | 讀哪些資料 | 可寫？ |
|---|---|---|---|
| 總覽 | `render()`、`renderHomeRepay()` | 全部 | 否 |
| 資產 | `renderAssets()` | `assets`、股價、基金、實價 | 是 |
| 負債 | `renderDebts()` | `debts` | 是 |
| 扣繳 | `renderFixed()` | `bills`、`debts`、`plans` | 是 |
| 還款 | `renderRepay()` | `debts`、`plans`、`bills` | **否** |
| 投資 | `renderInvest()` | `plans`、`debts`（AI 財務建議另讀全部摘要） | 是 |
| 收入 | `renderIncome()` | `incomes`、`raises`、`bonuses` | 是 |

**改某個欄位前，先查這張表看會影響哪些分頁。**

## 5. 自動化（GitHub Actions）

| Workflow | 時間（台灣） | 產出 |
|---|---|---|
| `stocks.yml` | 平日 14:23、05:41 | `data/stocks/` |
| `funds.yml` | 每天 21:17、09:47 | `data/funds/` |
| `lvr.yml` | 每週一 | `data/lvr/` |

這些 workflow 只寫 `data/`，不能動程式檔。

## 6. 待決定

- （有想法但還沒定案的放這裡）
