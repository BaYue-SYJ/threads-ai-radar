[**简体中文**](README.md) | [**English**](README.en.md) | **繁體中文** | [**日本語**](README.ja.md) | [**한국어**](README.ko.md)

<div align="center">

# Threads 爆款雷達

**即時盯著 Threads 上的 AI 關鍵詞，把正在漲的貼文撈出來。**

免登入 · 免 OAuth · 不呼叫官方 API · 零第三方相依 · 掛在自己電腦上就能跑

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](requirements.txt)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

</div>

---

## 介面預覽

**關鍵詞雷達** — 主視圖。預設只顯示「有圖 + 任一互動超過 30」的貼文。

![關鍵詞雷達](docs/radar.png)

**表格視圖** — 一眼掃完評分、速度、四項互動指標。

![表格視圖](docs/radar-table.png)

**貼文詳情** — 點任意一則開啟。含四項指標、爆款評分、上漲速度、配圖、判定依據。

![貼文詳情](docs/post-drawer.png)

**帳號抽屜** — 點作者名進入，看他最近有哪些相關貼文、是不是在穩定產出。

![帳號抽屜](docs/author-drawer.png)

**通道告警** — 抓不到資料時，介面直接告訴你是哪一環斷了（代理 / UA / 限流），不用猜。

![通道告警](docs/channel-alert.png)

**同行監控** — 依帳號聚合，看誰在穩定產出爆款。

![同行監控](docs/peers.png)

**關注名單** — 盯固定幾個帳號，看自上次查看以來有沒有新貼文。

![關注名單](docs/watchlist.png)

**手機 / 平板** — 桌面、平板、手機三檔斷點自動適應。

<img src="docs/mobile.png" width="300" alt="手機視圖">

---

## 它解決什麼問題

Threads 上 AI 相關的內容漲得很快，但**你幾乎不可能及時看到**：

- 官方 API 的 `keyword_search` **一個互動指標都不給**（拿不到按讚、回覆、轉發數）
- 手動刷「為你推薦」是演算法餵食，不是依關鍵詞盯的
- 等一則貼文紅了再刷到，早就過了選題窗口

這個工具做的事很簡單：**依你給的關鍵詞，每隔一段時間自動抓一遍，只留下有圖、有熱度的，依「正在漲」排序**。

它不是爬蟲框架，是一個能長期掛機的單一處理程序。

---

## 快速開始

### 1. 確認能連上 threads.com

瀏覽器開啟 <https://www.threads.com>，能正常存取就行。

**如果打不開**（很多地區直連不通），需要先設定代理。本專案用 Python 標準函式庫 `urllib` 抓取，它會自動讀取系統的 `http_proxy` / `https_proxy` 環境變數：

```bat
set http_proxy=http://127.0.0.1:7890
set https_proxy=http://127.0.0.1:7890
```

或者寫進專案根目錄的 `.env`（見 `.env.example` 裡的說明）。

> ⚠ 代理埠請填你本機代理客戶端的「混合埠 / HTTP 埠」，不是 SOCKS 埠。

### 2. 啟動

Windows 連點兩下 `start.bat`，或是在命令列：

```bash
python server.py
```

**不需要 `pip install`** —— 全程只用 Python 標準函式庫。

### 3. 開啟介面

瀏覽器前往 <http://127.0.0.1:8650>

首次啟動會自動跑一輪採集（約 3~5 分鐘），之後依設定的間隔循環。

---

## 預設篩選規則

抓到的貼文很多，但**真正值得看的很少**。所以介面預設開了三道閘：

| 規則 | 預設值 | 說明 |
|---|---|---|
| 僅看相關 | ✅ 開 | 正文命中你的關鍵詞（見下方「相關性過濾」） |
| 僅看有圖 | ✅ 開 | **純文字貼文不顯示** —— 沒有視覺參考價值 |
| 最低互動 | **30** | 按讚 / 回覆 / 轉發**三項中任意一項**超過門檻 |

「最低互動」的計法是**三項取最大值**，而不是相加 —— 相加會把「34 讚 + 33 回 + 33 轉」和「100 讚 + 0 + 0」判成同一級，但只有後者是真爆款。引用數不參與判定（它衡量的是「被引用討論」，不是本則貼文自身的熱度）。

**三個開關都在介面上，隨時可以關掉看全量。** 門檻也可以寫進 `.env` 固定下來：

```ini
RADAR_MIN_INTERACTIONS=30
```

---

## 它是怎麼抓到資料的

### 核心：Googlebot UA + 伺服器端渲染

Threads 對一般瀏覽器 UA **不做內容伺服器端渲染** —— 只回傳約 275 KB 的空殼頁面，內容全靠 JS 載入。

但換成 **Googlebot UA** 之後，Meta 會老實回傳完整 SSR 頁面（1~2 MB），貼文資料以內嵌 JSON 形式直接給出。

於是就有了這條鏈路：

```
用 Googlebot UA 請求搜尋頁
  → 拿到 SSR HTML
  → 從 <script type="application/json"> 裡抽出 JSON
  → 遞迴定位貼文物件
  → 正規化欄位
```

**免登入、無需 OAuth、不需要 App Review。**

### ⚠️ 改程式時最容易踩的坑：欄位位置

四個互動指標**不在同一層**：

| 欄位 | 位置 |
|---|---|
| `like_count` | 貼文物件**頂層** |
| `direct_reply_count` | 在 `text_post_app_info` 內（注意**不叫** `reply_count`） |
| `repost_count` | 在 `text_post_app_info` 內 |
| `quote_count` | 在 `text_post_app_info` 內 |

所以判定「是不是一則貼文物件」的條件必須**同時**包含 `code` + `like_count` + `text_post_app_info`。只判前兩項會停在外層，導致後三個欄位全部讀成 0。

另外 `has_image` **不能**寫成 `bool(raw.get("image_versions2"))` —— Threads 給每一則貼文（含純文字貼文）都回傳了這個 key，純文字貼文的值是空殼 `{"candidates": []}`，那個布林值會恆為 True（實測踩過：資料庫裡近兩萬筆全被標成有圖）。

---

## 關鍵詞怎麼寫

編輯專案根目錄的 `keywords.txt`，也可以在介面上增刪（介面會寫回同一個檔案）。

```
# 每行一個關鍵詞，[方括號] 是分組

[模型]
ChatGPT | GPT | chatgpt
Claude | ClaudeAI | Anthropic Claude

[生圖]
Midjourney | midjourney
AI art | AI 绘画 | AI画
```

三條規則：

- **`|` 表示同義詞** —— 搜尋時只用**第一個**寫法，但正文命中任意一個都算相關。這樣能在不犧牲精確度的前提下把召回補回來（很多貼文只說「GPT」而不寫全稱）。
- **空格表示 AND** —— `AI prompt` 要求「AI」和「prompt」都出現。連寫形式也會命中（`#aiprompt`）。
- **`[分組]`** 只是給介面分類用，隨時可以改。分組名**不會**被翻譯成其他語言 —— 因為它同時是資料值，翻了你就沒辦法拿介面上的詞去檔案裡搜了。

---

## 相關性過濾

Threads 的搜尋回傳的不是「正文含該詞」的結果，而是**語意相關**結果。實測搜「AI prompt」會回傳印尼語／馬來語蹭流量貼文，甚至出現政治人物談 AI 監管的貼文（一萬多讚衝到榜首）。這些貼文雖然與 AI 沾邊，但對選題毫無價值。

所以需要一層過濾，純關鍵詞規則，不呼叫任何模型：

| 判定 | 條件 |
|---|---|
| `blocked` | 命中 `blocklist.txt` 裡的封鎖詞 → 直接排除 |
| `relevant` | 正文命中關鍵詞（整條短語，或全部有效詞，或連寫形式） |
| `offtopic` | 其餘（被搜尋召回但與關鍵詞無關） |

兩個實作細節：

1. **`ai` 這類短詞用子字串比對會誤傷** `said` / `again` / `available`，所以純 ASCII 詞採用近似詞邊界比對（前後不能接英數字）。
2. **`tag` 欄位也參與比對** —— 一則貼文如果屬於「AI Threads」社群，它的 tag 會提供「AI」這個詞。所以正文只有「prompt」的貼文也能命中關鍵詞 `AI prompt`。

**「必須命中關鍵詞」是這個方案的固有代價**：像「ChatGPT Images 2.5 能給我們設計師留一條生路？」這種明顯 AI 相關、但沒寫進關鍵詞表的貼文會被判成 offtopic。**解決辦法是把詞加進 `keywords.txt`，而不是放寬規則** —— 放寬會立刻湧進大量雜訊。

### 零互動的貼文不入庫

Threads 為了湊齊一頁搜尋結果，會回傳大量**剛發布、還沒有任何反應**的貼文。實測某一輪抓到 1,421 則裡，判為相關的只有 359 則，其餘幾乎全是零讚、與關鍵詞無關的雜訊。

所以採集層加了一道閘：**四項互動全為 0 的貼文不寫進資料庫**。

這不是「永久丟棄」，而是**延遲入庫** —— 貼文下次被採到時如果已經有互動，就會正常收進來。代價只是失去「零互動那一段」的漲幅軌跡，而不是永遠看不到這則貼文。

> 這條規則比「互動低於某個值就不收」溫和得多：後者會把已經起步、正在上漲的貼文一併擋掉。

---

## 抓取變體與封鎖風險

Threads 同一個搜尋詞，加上不同 `serp_type` 參數會回傳**不同批次**的結果，相當於翻頁。

實測各變體之間的貼文**重疊只有 50~63%**：

| 查詢 | base | recent | profile | 三者聯集 |
|---|---|---|---|---|
| `q=Claude` | 76 則 | 74 則 | 74 則 | **137 則（+80%）** |
| `q=ChatGPT` | 61 則 | 60 則 | 62 則 | **109 則（+79%）** |

所以多開變體是提升召回最直接的手段：

```ini
RADAR_SERP_TYPES=base,profile,recent
```

可用值：`base`（不帶參數）、`recent`、`top`、`tag`、`profile`、`default`。

### ⚠️ 變體數直接決定封鎖風險

**這是本專案最需要克制的參數。** 實測資料：

| 設定 | 請求數 | 結果 |
|---|---|---|
| 3 變體 × 19 詞 | 57 請求/輪（約 114/小時） | **連續三輪後 threads.com 回傳 502**，約 20 分鐘自癒 |
| 2 變體 × 19 詞 | 38 請求/輪 | 穩定 |
| 3 變體 × 12 詞 | 36 請求/輪（約 72/小時） | 穩定（目前預設值） |

**建議**：`詞數 × 變體數 ≤ 40`，並把間隔拉到 30 分鐘以上。一旦被限，**降低壓力並停一段時間是唯一有效的恢復方式**，硬重試只會延長封鎖。

排查被限的方法：同時測 `threads.com` 和一個無關站點（例如 `baidu.com`）。只有 threads 不通 → 出口被 Meta 風控；兩個都不通 → 代理掛了。

---

## 即時監控怎麼運作

服務內跑一個背景執行緒，依間隔循環採集。除了主流程，還有四層保險：

- **通道自我檢測** —— 一鍵探測目前代理通道是否還能拿到 SSR 頁面，區分「抓取器壞了」還是「出口被封了」
- **熔斷** —— 連續 3 輪「整輪零產出」自動暫停。整輪零產出代表是通道級故障，繼續依間隔重試只會加深封鎖
- **整輪看門狗** —— 筆電休眠會讓採集執行緒整個凍住（實測卡過 15.5 小時沒回傳），所以有一層「整輪」級別的超時保險
- **中斷殘留收尾** —— 處理程序被殺掉後，資料庫裡狀態還停在 `running` 的那一輪會被自動標記為中斷

---

## 設定

所有設定都有內建預設值，寫在專案根目錄的 `.env` 即可（完整清單見 `.env.example`）。

```ini
RADAR_PORT=8650                        # 服務埠
RADAR_INTERVAL_MINUTES=30              # 採集間隔（分鐘）
RADAR_SERP_TYPES=base,profile,recent   # 抓取變體，越多越全但越容易被風控
RADAR_MIN_INTERACTIONS=30              # 介面「最低互動」滑桿的初始值
RADAR_CYCLE_MAX_SECONDS=1800           # 單輪時間上限（看門狗）
RADAR_FAILURE_LIMIT=3                  # 連續幾輪零產出後熔斷
RADAR_HOST=127.0.0.1                   # 綁定位址，預設只允許本機存取
```

介面裡改採集間隔會**自動寫回 `.env`**，重啟後設定不會丟。

### HTTP 介面

服務同時提供 JSON 介面，方便你自己接其他工具：

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/status` | 執行狀態、統計、最近日誌 |
| GET | `/api/posts?limit=&only_relevant=` | 貼文列表 |
| GET | `/api/authors?limit=&tier=` | 帳號聚合榜 |
| GET | `/api/post/<code>` | 單則貼文詳情 |
| GET | `/api/stream` | SSE 即時事件流 |
| GET | `/api/export?what=posts\|authors` | 匯出 CSV（UTF-8 BOM，Excel 直接開啟不亂碼） |
| POST | `/api/collect` | 立即採集一輪 |
| POST | `/api/pause` `/api/resume` | 暫停 / 繼續 |
| POST/DELETE | `/api/keywords` `/api/watchlist` | 關鍵詞與關注名單的增刪 |

---

## 常見問題

**Q：啟動後一直轉圈 / 抓到 0 則？**
點介面上的「自我檢測」按鈕。它會明確告訴你卡在哪一環：DNS、代理隧道、UA 被降級、還是被限流。

**Q：介面上的列表筆數比「庫內 N 筆」少很多？**
這是設計如此。庫內是原始抓取量，列表預設只顯示「相關 + 有圖 + 互動達標」的那部分。關掉篩選開關就能看到全量。

**Q：為什麼「上漲速度」這一欄全是 0？**
速度靠**比對前後兩次採集的互動增量**算出來。剛清庫或剛啟動時每則貼文只有一筆快照，需要累積 2 輪以上才能算出速度。

**Q：中文亂碼？**
CSV 匯出已經寫了 UTF-8 BOM，Excel 直接開啟不會亂碼。如果是別的地方亂碼，檢查終端編碼（Windows 底下 `chcp 65001`）。

**Q：能部署到伺服器上長期跑嗎？**
可以，但要注意兩點：① `RADAR_HOST` 預設是 `127.0.0.1`（只允許本機存取），要對外提供服務需明確改成 `0.0.0.0`，**並且自己加一層反向代理和驗證** —— 本專案沒有使用者系統；② 出口 IP 決定被風控的機率，機房 IP 通常比家用寬頻更容易被限。

---

## 已知限制

這些不是 bug，是方案本身的邊界，寫出來免得你踩：

1. **搜尋召回有上限，覆蓋率做不到 100%。** 每次查詢只回傳一頁（約 50~80 則），社群（如「AI Art」）裡剛發布、零互動的新貼文排不進候選集。實測過：拿貼文的原文片段整句搜尋回傳 **0 則** —— 說明 Threads 搜尋**不是全文索引**，而是演算法候選集。
2. **社群頁抓不到。** 瀏覽器裡看到的「話題社群頁」（帶熱門／近期分頁）是 JS 渲染的，無頭抓取 SSR 拿到的是退化結果（實測回傳的全是無關貼文）。要覆蓋它需要引入 JS 渲染 + 登入狀態，與本專案「零相依、免登入」的定位直接衝突。
3. **剛發布的貼文雜訊率極高。** 實測某一輪新入庫貼文裡相關率只有 **1.5%**（而舊貼文是 34%~59%）。「即時」和「相關」本身是矛盾的 —— 已用「零互動不入庫」壓掉大部分。
4. **互動數大量為 0 是正常的。** 長尾貼文居多，介面「最低互動」滑桿就是為此準備的。
5. **相依於 Threads 的頁面結構。** Meta 一旦改動 SSR 資料的組織方式，解析邏輯需要跟著改。`collector.py` 頂端的註解寫清了欄位位置，改起來不難。
6. **單機、單一處理程序、無驗證。** 定位是「掛在自己電腦上的個人工具」，不是多使用者服務。

---

## 檔案說明

```
threads-ai-radar/
├── server.py          HTTP 服務 + JSON 介面 + 靜態檔案
├── monitor.py         背景排程：定時採集、通道自我檢測、熔斷、看門狗
├── pipeline.py        一輪採集的編排：抓取 → 相關性判定 → 評分 → 入庫
├── collector.py       採集層：Googlebot UA 抓 SSR 頁，解析內嵌 JSON
├── relevance.py       相關性判定：純關鍵詞規則（blocked / relevant / offtopic）
├── scorer.py          爆款評分與上漲速度
├── store.py           SQLite 儲存：建表、遷移、查詢、帳號聚合
├── config.py          設定讀取（.env 載入與環境變數）
├── selftest.py        自我檢測：跑一遍過濾與榜單，印出被剔除的樣本
├── refilter.py        改了關鍵詞後，重新過濾庫裡已有的資料（不用重抓）
├── start.bat          Windows 一鍵啟動
├── requirements.txt   空的 —— 本專案零第三方相依
├── keywords.txt       監控關鍵詞（介面可改，會寫回本檔案）
├── blocklist.txt      封鎖詞（命中直接排除）
├── watchlist.txt      關注名單
├── .env.example       設定範例
├── data/
│   └── radar.db       SQLite 資料庫（自帶一份範例資料，開箱即可看到介面效果）
├── docs/              本 README 用的截圖
└── web/
    ├── index.html     單檔前端（無框架、無建置流程）
    └── i18n.js        五語文案字典與執行環境（簡中 / 英 / 繁中 / 日 / 韓）
```

**介面支援五種語言**：简体中文、English、繁體中文、日本語、한국어。右上角切換，選擇記在 localStorage。介面文案全部翻譯，但**貼文正文、帳號名、分組名不翻譯** —— 那些是資料，不是介面。

---

## 相關專案

| 專案 | 說明 |
|---|---|
| [**shuixian-manju-skills**](https://github.com/BaYue-SYJ/shuixian-manju-skills) | 水仙的漫劇 6 件套：從小說到短劇成片的創作技能集（靈感來自 shuohao-skills） |
| [**shuixian-prompts**](https://github.com/BaYue-SYJ/shuixian-prompts) | 水仙的 AI 提示詞畫廊原始碼（公益提示詞網站） |
| [**zimeiti-workbuddy**](https://github.com/BaYue-SYJ/zimeiti-workbuddy) | Creator Buddy：公眾號 / 小紅書 / 短影音的全流程創作 Skill 工具箱 |
| [**web-html-image-skill**](https://github.com/BaYue-SYJ/web-html-image-skill) | web-image：用 HTML/CSS 渲染出圖，不依賴生圖模型，32 套預設風格 |

---

## 關於作者

如果這個東西幫你省了時間，可以請我喝杯咖啡 ☕；想直接聊也歡迎加微信。

| 贊助碼 | 微信 | 公眾號 |
|:---:|:---:|:---:|
| <img src="docs/reward-qr.jpg" width="180" alt="贊助碼"> | <img src="docs/wechat-qr.jpg" width="180" alt="微信"> | <img src="docs/wechat-mp-qr.jpg" width="180" alt="公眾號"> |

公眾號會寫一些 AI 工具與提示詞相關的東西。

---

## 社区

| [**Linux.Do**](https://linux.do) | Linux.Do — 与社区分享、讨论和跟踪发展 |

## 授權

[MIT](LICENSE) —— 隨便用，改，散佈。

> ⚠️ 請合理使用。內建的採集間隔（30 分鐘）和變體數（3 個）是實測下來不會被風控的設定，**調快之前請先讀「抓取變體與封鎖風險」那一節**。頻繁抓取不僅會讓自己被封，也會影響其他使用者。
