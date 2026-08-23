# Digital Transformation Agent

<p align="center">
  <a href="https://github.com/yhwangtw/dta/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/yhwangtw/dta/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react">
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-TW.md"><strong>繁體中文</strong></a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="https://github.com/yhwangtw/dta/releases">版本發布</a> ·
  <a href="https://github.com/yhwangtw/dta/issues">回報錯誤</a> ·
  <a href="https://github.com/yhwangtw/dta/issues">建議功能</a>
</p>

**用於數位轉型工作的部門 Agent 平台與 Human Control Plane。**

Digital Transformation Agent（DTA）把會議智慧、PDLC、行動追蹤、部門知識、Agent 執行與人工確認串進同一個可追蹤的工作空間，也能讓公司級 Orchestrator 呼叫有明確邊界的部門能力。

> DTA 內部重用已驗證的 Pi Session／Runtime 基礎設施，但對外的 Agent Contract、A2A、產品識別與領域成果都不暴露 Pi 實作細節。

## DTA 的產品方向

DTA 把對話視為操作方式，而不是整個產品的資訊架構：

- **會議智慧**：產生有來源依據的會議紀錄、決策、待辦、負責人與期限；可貼入素材、使用瀏覽器語音輸入，或上傳文字、DOCX、音訊與影片。設定正式影音 provider 後，系統會產生帶時間戳的逐字稿、關鍵畫面證據與同步會議時間軸。
- **PDLC Agent**：讓核准決策進入需求、設計、交付與驗證流程。
- **行動追蹤**：跨會議追蹤後續事項、阻礙與人工決策。
- **部門知識**：搜尋已核准的決策與產物，同時保留脈絡。
- **Human Control Plane**：查核依據、處理例外並核准發布。
- **Orchestrator 入口**：向公司自動化提供穩定且有邊界的部門 Agent 契約。

## 適合誰？

- 希望把會議與決策轉成可追蹤後續工作的部門團隊。
- 負責管理多個專業 Agent 的數位轉型團隊。
- 需要來源、人工關卡、版本與執行紀錄的審查者。
- 使用公司 Orchestrator、內部模型 Gateway 或私有網路的企業環境。

## 快速開始

### 系統需求

- Node.js 22 以上
- npm
- 可正常運作的 Pi 環境與 `~/.pi/agent/`
- Git

本專案只透過 GitHub 原始碼發布，**不發布至 npm**。

> [!IMPORTANT]
> DTA 能在允許的工作區讀寫檔案、檢查 git repository，並執行 shell 指令。預設只在 localhost 使用；若要遠端存取，請設定 `PIWEB_ACCESS_PASSWORD`，並放在具身分驗證的私人網路或 Access proxy 後方。舊環境變數名稱目前為相容性保留。詳見[部署指南](./deploy/README.md)。

正式支援的一步式安裝請使用獨立 checkout：

```bash
git clone https://github.com/yhwangtw/dta.git
cd dta
bash setup.sh
```

安裝腳本是正式支援的一步式原始碼安裝流程。Git checkout 會先用 `origin/main` 取代本地原始碼，再檢查 Node.js 與 npm、安裝相依套件、執行 TypeScript 驗證、建立 production build，並可選擇啟動 server。已知的舊版殘留會先移至 `~/.dta-backups/`（可用 `DTA_SETUP_BACKUP_DIR` 覆寫）。

> [!WARNING]
> 一般使用者的 Git 安裝以 `origin/main` 為唯一真相。執行 `bash setup.sh` 會透過 `git reset --hard origin/main` 與 `git clean -fd` 放棄本地 commit、tracked 修改及未被 ignore 的 untracked 檔案；`.env`、`node_modules`、`.next` 等 ignored runtime 狀態會保留。

手動安裝：

```bash
npm install
npm run build
npm start
```

開啟 [http://localhost:30141](http://localhost:30141)。

### 更新現有 checkout

```bash
bash setup.sh
```

TypeScript 驗證失敗時，`setup.sh` 會顯示完整錯誤並立即停止，不會繼續產生容易誤判的部分 build。

若 Git checkout 必須刻意離線使用，可明確跳過遠端同步：

```bash
DTA_SETUP_OFFLINE=1 bash setup.sh
```

## 架構與公司部署

- [Agent 架構、外部契約、安全邊界與目前限制](./docs/architecture.md)
- [同一顆 image、runtime config、Keycloak、Vault 與 Kubernetes 指南](./docs/deployment.md)
- [完整環境變數範本](./.env.example)

同一顆 image 可在外部環境使用 local／mock adapter，也可進公司後換成 Keycloak、公司 LLM Gateway、MinIO 與 n8n；連線資料與秘密都不會寫進 image。

## 介面導覽

<p align="center">
  <img src="./docs/screenshots/11-mobile-chat.png" alt="手機版響應式對話介面" width="390">
</p>

手機版會在 safe area 內保留目前階段、對話、輸入框、模型控制與主要導覽，常用操作維持在拇指可及範圍。

| Session 與檔案工作區 | 指令面板 |
|---|---|
| ![程式碼 session](./docs/screenshots/03-code-session.png) | ![指令面板](./docs/screenshots/04-command-palette.png) |

| 深色模式 | 空白狀態 |
|---|---|
| ![深色模式](./docs/screenshots/10-dark-mode.png) | ![空白狀態](./docs/screenshots/01-empty-state.png) |

<details>
<summary><strong>查看全部五種外觀 skin</strong></summary>

| Editorial | Terminal | Aurora |
|---|---|---|
| ![Editorial skin](./docs/screenshots/05-skin-editorial.png) | ![Terminal skin](./docs/screenshots/06-skin-terminal.png) | ![Aurora skin](./docs/screenshots/07-skin-aurora.png) |

| Industrial | Glass |
|---|---|
| ![Industrial skin](./docs/screenshots/08-skin-industrial.png) | ![Glass skin](./docs/screenshots/09-skin-glass.png) |

</details>

## 主要功能

### Agent 對話

- 透過 SSE 即時串流，並在送出 prompt 前先建立事件連線。
- 支援 prompt、steer、follow-up queue、retry、bash 與 context compaction。
- 使用 `!command` 直接執行 shell；使用 `!!command` 讓結果不進入模型 context。
- 在 session 中途切換模型與 thinking level。
- 內建 `ask_user` 工具，並支援 Pi extension 的 `select`、`confirm`、`input`、`editor` 對話框、通知、狀態與文字 Widget；等待中的決定可跨斷線重連保留。
- Pi extension 的 session 指令（`newSession`、`fork`、`switchSession`）改由原生 `AgentSessionRuntime` 執行；Web UI 會跟隨替換後的 session，並將 SSE 重連至新 session。
- 替換失敗時會恢復原本的 runtime；目標 session 已被其他 runtime 使用時會在切換前拒絕，所有開啟中的分頁也會同步跟隨。Extensions 設定可查看即時 runtime 診斷。
- 可透過預覽優先的對話框匯入 Pi `.jsonl`；切換前會驗證 header、實際 cwd、允許的根目錄、symlink、檔案大小與目的地衝突。
- 每次執行都有錯誤卡、停滯警告、通知、完成音效與分頁狀態。
- 可編輯過去的 turn、從先前分支點 retry、建立獨立 fork，或在 session 內切換分支。

### Agent 排程

- 左側排程中心支援單次、每天、每週與標準五欄 cron，並明確指定 IANA 時區。
- 可設定專案、Prompt、模型、thinking level、工具權限、漏跑策略與啟用狀態；同一處即可暫停、恢復、立即執行、重試與查看歷史。
- 每次執行都會建立一般的本機 Pi session；若 `ask_user` 需要決定，狀態會變成**等待你的回答**，可直接開啟該 session 繼續。
- 排程由本機 Node server 執行，server 必須保持運作。重啟後會依設定補跑一次或略過，且同一排程不會重疊執行。

### Session 與導覽

- 以增量、唯讀方式索引本機 Pi `.jsonl` session 檔。
- 支援搜尋、標籤、釘選、封存、自動命名、HTML/Markdown 匯出與用量分析。
- 提供對話搜尋、user turn 導覽、書籤、minimap、長訊息收合與 always-follow 串流模式。
- Project switcher 支援最近專案、釘選、探索、檔案系統自動完成與 linked git worktrees。
- 可重複使用的部門與 Coding workflow prompt templates。

### 檔案與 git

- 專案樹、遞迴檔名搜尋、文字編輯、Markdown/HTML/圖片預覽，以及對話內可點擊的檔案路徑。
- Git 狀態 badge、working tree 摘要、逐檔統計，以及 `HEAD` 對 worktree diff。
- 將 `edit`、`write` tool call 顯示為實際 diff 或檔案內容，不顯示難讀的原始 JSON。
- 檔案與 git API 有 allowed-root、路徑防護、`execFile` 與回應大小限制。
- Snapshot restore 只套用精確差異，不會改寫使用者的 index 或 `HEAD`。

### 顯示與外觀

- GitHub Flavored Markdown、表格、task list、KaTeX、Mermaid 與延遲載入的語法高亮。
- Editorial、Terminal、Industrial、Aurora、Glass 五種 skin，各自支援亮色與暗色。
- 內建 Inter、JetBrains Mono 與 Noto Sans TC，不依賴 CDN。
- 應用程式介面語言目前為 English 與繁體中文；專案文件另外提供日本語與 Deutsch。

## 鍵盤快捷鍵

| 按鍵 | 動作 |
|---|---|
| `⌘/Ctrl + K` | 開啟指令面板 |
| `⌘/Ctrl + P` | 開啟 project switcher |
| `⌘/Ctrl + F` | 搜尋目前對話 |
| `⌥ + ↑` / `⌥ + ↓` | 上一個／下一個 user turn |
| `⇧⌘M` | 開啟 Models |
| `⌘/Ctrl + /` | 開啟 Skills |
| `⌘/Ctrl + B` | 切換 contextual panel |
| `⌘/Ctrl + \` | 切換右側檔案 panel |
| 空白輸入框按 `↑` | 叫回上一則訊息 |
| `Esc` | 關閉目前 dialog |

## 指令

| 指令 | 用途 |
|---|---|
| `bash setup.sh` | 以 `origin/main` 取代本地原始碼、驗證、安裝、build，並可選擇啟動 production |
| `npm run dev` | 視需要在 `30141` port 啟動開發環境 |
| `node_modules/.bin/tsc --noEmit` | Typecheck |
| `npx eslint .` | Lint |
| `npm test` | 執行 Vitest unit tests |
| `npm run test:e2e` | Build 並在 `30177` port 執行 Playwright E2E |
| `npm run build` | 建立 production build |
| `npm run start` | 啟動 production server |

> [!WARNING]
> 執行 `npm run build` 或 `npm run test:e2e` 前，必須先停止 `npm run dev`。同時執行 Next.js build 會污染開發伺服器使用中的 `.next/`。

Playwright test runner 已鎖定在 `package.json`。先安裝一次 Chromium 測試 binary，再執行測試：

```bash
npx playwright install chromium
npm run test:e2e
```

本機 container 若已預裝 Chromium：

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

## 設定

| 設定 | 行為 |
|---|---|
| `AGENT_DEFAULT_TYPE` | DTA 預設能力；目前為 `meeting`，既有 Coding Agent session 不受影響 |
| `DTA_ENABLED_AGENTS` | 啟用 `meeting-agent,pm-agent` 等 server-side Agent |
| `DTA_AGENT_MANIFEST_PATH` | 掛載額外部門 Agent 的 prompt、skills 與 workflow allowlist，不需重建 image |
| `DTA_DATA_DIR` | 保存 DTA metadata 與通用 artifacts；預設為 `~/.dta` |
| `DTA_AUTH_MODE` / `KEYCLOAK_*` | 使用 Keycloak token 保護外部 Agent Contract 與 A2A |
| `LLM_BASE_URL` / `LLM_MODEL` | 為 server-side Agent run 註冊公司 LLM Gateway |
| `DTA_ARTIFACT_STORE` / `MINIO_*` | 選擇 local 或 MinIO artifact storage |
| `DTA_MEMORY_STORE` / `POSTGRES_URL` / `REDIS_URL` | 選擇 local、Postgres 或 Redis 對話記憶，並設定 TTL 與數量上限 |
| `DTA_WORKFLOW_PROVIDER` / `N8N_*` | 選擇停用、mock 或設定完成的 n8n workflow tools |
| `DTA_TRANSCRIPTION_PROVIDER` | `none`、僅供開發的 `mock`，或 `openai-compatible` |
| `DTA_MOCK_TRANSCRIPT` | 僅供非 production mock provider 使用的明確測試逐字稿 |
| `DTA_TRANSCRIPTION_BASE_URL` / `DTA_TRANSCRIPTION_MODEL` | 公司或相容的語音轉文字端點與模型 |
| `DTA_TRANSCRIPTION_RESPONSE_FORMAT` | `auto`（建議）、`json`、`verbose_json` 或 `diarized_json` |
| `DTA_VISION_PROVIDER` | `none`、僅供開發的 `mock`，或 `openai-compatible` 關鍵畫面分析 |
| `DTA_VISION_BASE_URL` / `DTA_VISION_MODEL` | 公司或相容的多模態端點與模型 |
| `DTA_MEDIA_PROCESSOR` | `ffmpeg`（預設）或 `none`；負責抽取影片音訊與關鍵影格 |
| `DTA_MEDIA_MAX_DURATION_SECONDS` | 影音最長秒數，預設 14,400 秒 |
| `DTA_VIDEO_MAX_KEYFRAMES` | 每支影片最多擷取的關鍵影格，預設 12 |
| `DTA_UPLOAD_SCANNER` | 選擇不掃描，或 fail-closed 的公司 HTTP 惡意檔案掃描器 |
| `DTA_AUDIT_LOG_*` / `DTA_METRICS_*` | 設定 hash chain audit events 與受保護的 Prometheus metrics |
| `DTA_RATE_LIMIT_*` / `DTA_RETENTION_*` | 設定 process-local quota 與 opt-in local artifact 保存期限 |
| `PI_CODING_AGENT_DIR` | 覆寫預設的 `~/.pi/agent` 目錄 |
| `PIWEB_ACCESS_PASSWORD` | 啟用套用於所有 route 的內建共用密碼閘門 |
| `models.json` | 模型與 provider 清單，包含自訂 `baseUrl` |
| `auth.json` | 由 Pi 管理的各 provider API credential |
| Project picker | 選擇並驗證目前 working directory |

Session 仍使用 Pi 原生格式：

```text
~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl
```

### Meeting Agent 基礎

Meeting Agent session 會在既有 Pi session 上疊加 DTA 自有的 metadata 與 artifacts。Pi 仍是內部推理／工具 runtime；產品對外顯示的 Agent 身分與結構化 `MeetingResult` 不會暴露 Pi 細節。Meeting runtime 使用專用 system prompt 與受限的 `publish_meeting_result` 工具，並將 JSON、Markdown 成果保存到 `DTA_DATA_DIR`。

Meeting-first 介面不再要求使用者選擇 repository 或檔案系統路徑。新會議會在 `DTA_DATA_DIR` 下由 DTA 管理的會議工作區執行；底層 cwd 僅為 runtime 相容性保留，不會出現在一般產品流程。直接開啟舊有 Coding Agent session 時，仍可沿用原本的專案工作區。

瀏覽器語音辨識可直接把語音輸入逐字稿欄位，不保存錄音。影音上傳後會先保存原始 artifact；FFmpeg 會抽取影片音訊與關鍵影格，設定的轉錄與 Vision provider 會產生時間戳證據，DTA 再保存同步會議時間軸交給 Meeting Agent。內建 mock provider 僅供開發／測試，production 不會啟用。詳見 [Meeting media understanding](./docs/meeting-media-pipeline.md)。

目前限制：active Pi session ownership、normalized event replay、run／review records 與 Meeting／PM records 仍屬 process-local／file-backed，因此即使對話記憶改用 Postgres 或 Redis，此階段仍維持單一 replica。公司 Orchestrator routes、PM Agent、可設定的部門 Agents、A2A、Keycloak、n8n、MinIO、audit 與 metrics 已可使用；詳見[目前 production 限制](./docs/architecture.md#current-production-limitations)。

## 架構

完整的 generic runtime、Meeting／PM 邊界、外部 Agent Contract、A2A、Keycloak、審核閘門、adapter 與 production 限制，請看 [DTA Agent Platform Architecture](./docs/architecture.md)。

## 專案結構

```text
app/api/        Agent Contract、runs/events、sessions、schedules、files、git、config
components/     layout、chat、sidebar、modals 與共用 UI
hooks/          agent orchestration、streaming、scrolling、sessions、theme
lib/            RPC lifecycle、scheduling、session parsing、security、i18n、snapshots
e2e/            Playwright production-server scenarios
docs/           screenshots 與專案文件
public/fonts/   內建本機字型
```

詳細架構、不變量與開發陷阱請參考 [`AGENTS.md`](./AGENTS.md)。

## 離線與隔離網路環境

字型與 UI assets 都已內建；runtime 只會連線到設定中啟用的 LLM／media gateway、Keycloak、MinIO、Postgres／Redis、n8n 與選用的上傳掃描器。

- **內部 npm registry：** clone repository，或把 GitHub Release 原始碼壓縮檔解壓到乾淨目錄，設定內部 registry，再執行 `bash setup.sh`。只有需要 immutable CI-style 安裝時才使用 `npm ci && npm run build`。
- **可攜式目錄：** 在相同 OS 與架構的連網機器執行 `npm ci && npm run build`，複製完整目錄後執行 `npm run start`。
- **內部或本機模型：** 在 `models.json` 為 provider 設定自訂 `baseUrl`。

`npm ci` 保留給可重現的 CI 與離線 build；互動式開發使用 `npm install`。

## 常見問題

### 這個專案有發布成 npm package 嗎？

沒有。請從 GitHub repository 或 GitHub Release 原始碼壓縮檔安裝與更新。

### 它會取代 Pi 嗎？

不會。它是 Pi session 檔與 agent runtime 的本機瀏覽器介面；底層 coding agent 仍然是 Pi。

### 應用程式會上傳我的 session 嗎？

本專案沒有 hosted session backend。它讀取本機 Pi 檔案，並且只連線到你設定的模型或 provider endpoint。

### DTA 關閉時，排程仍會執行嗎？

不會。排程器位於本機 Node server 內；要準時執行需保持 `npm start` 運作。重新啟動後，每個排程會依設定選擇**補跑一次**或**略過**。

### 為什麼 Playwright 瀏覽器要分開安裝？

Test runner 已由 lockfile 鎖定以確保可重現安裝；瀏覽器 binary 則屬於執行環境。CI 會明確安裝 Chromium，離線／公司環境也可預裝後透過 `PW_CHROMIUM_PATH` 指定。

### 為什麼 compact 後的 session 檔仍然很長？

Compaction 會加入摘要並保留最近的訊息尾端，不會從 `.jsonl` 刪除原始歷史。介面會依照 Pi 的 active branch 與 compaction entry 顯示 context。

## 參與貢獻

歡迎 issue 與 pull request。

1. Fork repository 並建立範圍明確的 branch。
2. 開發時使用 `npm install`。
3. 執行 typecheck、lint 與 tests。
4. 行為改動需要新增或更新 tests。
5. 修改使用者可見的安裝方式或功能時，請同步四份 README。

應用程式翻譯位於 `lib/i18n.tsx`。新增 skin 時必須使用 semantic design tokens，不能在 component 硬編碼顏色。

## 發布

PR 通過 CI 並合併後，使用快速發版流程：

```bash
gh workflow run release.yml -f tag=vYYYY.MM.DD
```

請使用目前的 UTC 日期；同一天再次發布時，加入 `vYYYY.MM.DD-1` 這類流水號，未來日期會被拒絕。單一 workflow 會更新 `package.json` 與 `package-lock.json`、建立 release commit 與 annotated tag，接著建置並 smoke-test 自包含的 `amd64`／`arm64` image、阻擋 High／Critical CVE、連同 SBOM／provenance attestation 發布到 GHCR，最後才建立 GitHub Release。它的驗證推送不會再啟動一輪 CI；既有的 `v*` tag 推送方式仍可使用。這個流程**不會發布至 npm**。

## 授權

MIT — 詳見 [`LICENSE`](./LICENSE)。
