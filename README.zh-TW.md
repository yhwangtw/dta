# Pi with tGD — 網頁介面

[English](./README.md)

[Pi 編程智能體](https://github.com/earendil-works/pi) 的網頁介面。在瀏覽器中瀏覽會話、與智能體即時對話、直接執行 shell 指令、檢視智能體改了哪些檔案、分叉對話、切換訊息分支。

## 快速開始

**一般使用者** — 直接執行打包好的版本(免 clone、免 build):

```bash
npx @agegr/pi-web
```

伺服器啟動於 [http://localhost:30141](http://localhost:30141) 並自動開啟瀏覽器。自訂連接埠:`npx @agegr/pi-web -p 8080`。

**開發者** — 從原始碼執行:

```bash
git clone https://github.com/openclawyhwang-hub/tGD-pi-web.git
cd tGD-pi-web
./setup.sh        # 或:npm install && npm run dev
```

前置需求:Node.js ≥ 22,以及可用的 [pi](https://github.com/earendil-works/pi) 環境(`~/.pi/agent/`)。

## 功能

### 對話
- **即時串流** — SSE 串流,token 逐字顯示
- **插話 / 追問** — 中斷執行中的智能體,或排隊等它完成(排隊中的追問可見、可取消)
- **Bash 模式** — 輸入 `!指令` 直接在 session 的工作目錄執行,輸出即時串流,結果會記錄進 session 讓智能體看得到;`!!指令` 則不進入 LLM context
- **模型切換** — 對話中途更換模型與思考等級
- **工具面板** — 控制智能體可用的工具(無 / 預設 / 全部)
- **壓縮 session** — 摘要長對話以節省 context
- **誠實的狀態** — 執行中有轉圈 + 已耗時計時;模型停止回應時顯示停滯警告;失敗的執行以紅色錯誤卡顯示完整錯誤原因(絕不無聲失敗),並提供一鍵 **Retry** 自動回滾重送同一則 prompt
- **Context 快滿提醒** — 用量達 80% 時出現提示條,一鍵壓縮
- **佇列控制** — 排隊中的追問逐條列出,可以個別取消或全部取消

### 背景執行也不漏接
- **分頁標題** — 執行中顯示 `⏳ session名稱`,完成閃 `✅`(失敗閃 `⚠`)
- **瀏覽器通知** — 分頁在背景時,智能體完成會發通知
- **完成音效** — 可選,失敗時不播

### 導航
- **⌘K 指令面板** — 搜尋 session、標籤、檔案、執行指令(中英文皆可搜)
- **⌘F 對話內搜尋** — 比對計數、Enter/⇧Enter 循環、目標閃光標示;跳到被收合的訊息會自動展開
- **⌥↑ / ⌥↓ 回合導航** — 在使用者訊息之間逐回合跳轉;minimap 點擊也能跳
- **長訊息自動收合** — 超過一個螢幕高的歷史訊息收成預覽 + 「展開完整訊息」按鈕;最新一輪永遠全文顯示
- **圖示導航欄** — 對話 / 檔案 / 變更 / 搜尋 / 分析視圖;底部有模型 / 技能 / 語言 / 主題
- **跳到底部** — 上捲時出現浮動按鈕;串流時會顯示底下累積了多少新內容(`↓ +N 行`);捲到尾端會啟用串流黏底跟隨
- **總是跟隨模式** — ⌘K → "Toggle Always-Follow Output",terminal 式黏底跟隨(記住偏好,預設關)
- **輸入歷史** — 輸入框空白時按 ↑ 叫回之前送過的訊息

### Session 管理
- **Session 瀏覽器** — 按工作目錄分組,自動偵測最近專案
- **專案選擇器** — 可搜尋、釘選常用、移除不要的;內建檔案系統瀏覽(麵包屑導航),或直接打路徑享受即時自動補全(Tab 補齊)
- **時間分組** — 今天 / 昨天 / 本週 / 更早
- **搜尋、標籤、釘選** — 即時篩選、彩色標籤、釘選置頂
- **自動命名** — 首輪對話後自動產生標題
- **分叉** — 從任一使用者訊息分出獨立新 session
- **Session 內分支** — 回滾到任意節點續寫;頂欄有分支導航器
- **匯出** — 獨立 HTML 或純 Markdown
- **分析** — Token 用量與成本報表

### 檔案與變更
- **檔案視圖** — 導航欄的全高檔案樹;session 列表下方也有可收合的檔案樹(偏好會記住)
- **深度檔案搜尋** — 過濾框輸入 2 個字以上就遞迴搜整個專案(伺服器端,自動跳過 node_modules 等),顯示扁平結果;點資料夾結果會在樹中展開定位
- **Git 感知檔案樹** — 修改/未追蹤的檔案顯示 M/A/D/U 彩色標記,含變更的資料夾有小圓點;右鍵直接看 diff
- **右鍵選單與鍵盤** — 複製路徑 / 相對路徑 / @ 提及 / 檢視 diff;↑ ↓ ← → 與 Enter 操作整棵樹
- **變更視圖** — session 工作目錄的 git 狀態(分支、逐檔狀態與行數統計),每輪智能體執行後自動刷新;點檔案看 HEAD ↔ 工作區 diff
- **檔案預覽** — 語法高亮原始碼、Markdown/HTML 預覽、圖片、diff
- **面板可調寬度** — 拖曳檔案面板左緣調整大小(記住偏好),雙擊重設
- **檔內搜尋與跳行** — 檢視器工具列的 `find / :line` 輸入框,符合行高亮置中
- **就地編輯** — 文字檔可直接編輯儲存(⌘S)/取消;寫入與讀取走同一套目錄權限閘
- **@-提及** — 從檔案樹把路徑插入輸入框

### 渲染
- **Markdown** — GFM、表格、任務清單;KaTeX 數學;Mermaid 圖表
- **程式碼** — 語法高亮 + 行號(高亮器延遲載入,不佔首屏)
- **供應商圖示** — Anthropic、OpenAI、Google 等

### 外觀
- **五套可切換外觀** — Editorial 米紙暖色(預設)/ Terminal 翡翠綠 / Industrial 工業黑白 / Aurora 極光紫 / Glass 極光漸層磨砂玻璃,每套都有明暗主題
- **外觀選擇器** — 導航欄的調色盤按鈕打開面板:明暗切換 + 五套皮膚色票卡,點了立即預覽;`⌘K` 也能開
- **磨砂浮動元件** — 指令面板、對話框、toast、搜尋列、跳轉按鈕都是毛玻璃(backdrop-blur),顏色自動匹配每套外觀
- **介面語言** — 英文(預設)⇄ 繁體中文,導航欄地球圖示切換
- **字型** — 內建 Inter + JetBrains Mono,繁體中文優先的 fallback 鏈,零網路依賴

## 鍵盤快捷鍵

| 按鍵 | 動作 |
|------|------|
| `⌘K` | 指令面板(搜尋與指令)|
| `⌘F` | 對話內搜尋 |
| `⌥↑` / `⌥↓` | 上一則 / 下一則使用者訊息 |
| `⇧⌘M` | 模型設定 |
| `⌘/` | 技能 |
| `⌘B` | 切換側欄面板 |
| `⌘\` | 切換檔案面板 |
| `↑` | 叫回上一則訊息(輸入框空白時)|
| `Esc` | 關閉對話框 |

## 設定

| 項目 | 說明 |
|------|------|
| Session 目錄 | 預設 `~/.pi/agent/sessions/`;可用 `PI_CODING_AGENT_DIR` 覆寫 |
| 模型設定 | 讀取 `models.json`;可在模型面板編輯(支援自訂 baseUrl — 內網環境可指向內部 gateway 或本地模型)|
| API 金鑰 | 各供應商金鑰存於 `auth.json` |
| 預設目錄 | 透過 CWD 選擇器設定 |

## 離線 / 內網部署

應用程式本身**執行期零外部請求**(字型內建、無 CDN),只有 LLM endpoint 需要可達 — 把 `models.json` 指向內部 gateway 或本地模型即可。

- **內部 npm registry(Nexus 等)**:建置一次(`npm ci && npm run build`)後 `npm publish --registry=<內部位址>`;使用者把 registry 指向內部後執行 `npx @agegr/pi-web`
- **整包搬移**:在*相同作業系統與架構*的聯網機器上 `npm ci && npm run build`,複製整個資料夾,執行 `npm run start`

## 開發

```bash
npm install
npm run dev    # 連接埠 30141
```

**驗證指令:**

```bash
node_modules/.bin/tsc --noEmit     # 型別檢查
npx eslint .                       # Lint
npm test                           # 單元測試(vitest)
```

> ⚠️ dev server 執行中**絕對不要**跑 `next build` — 會污染 `.next/` 並使 `npm run dev` 壞掉。

## 技術棧

| 層級 | 技術 |
|------|------|
| 框架 | Next.js 16(App Router)|
| UI | React 19 + CSS 變數(設計 token;四套外觀是 token 覆寫區塊)|
| Agent SDK | @earendil-works/pi-ai + pi-coding-agent |
| Markdown | react-markdown + remark-gfm + rehype-katex |
| 圖表 | Mermaid(延遲載入)|
| 程式碼 | react-syntax-highlighter(PrismAsync,延遲 chunk)|
| 字型 | Inter + JetBrains Mono(內建 .woff2)|

## 授權

MIT
