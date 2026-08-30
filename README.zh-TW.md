# Digital Transformation Agent

<p align="center">
  <a href="https://github.com/yhwangtw/dta/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/yhwangtw/dta/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/yhwangtw/dta/releases"><img alt="Release" src="https://img.shields.io/github/v/release/yhwangtw/dta?display_name=tag&style=flat-square"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs">
  <img alt="Node.js 22" src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white">
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-TW.md"><strong>繁體中文</strong></a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.de.md">Deutsch</a>
</p>

**DTA 是以 Meeting Agent 為第一主線的部門 Agent 平台，把對話與檔案轉成經人工確認、可追蹤的工作成果。**

同一套 server-side Agent 核心可由 Web、TUI、CLI、REST 與 A2A 操作。Meeting Agent 負責會議理解；PM Agent 接續核准後的需求，產生產品文件與開發任務。公司 Orchestrator 可以呼叫相同的有界 Agent 契約，不需要知道 DTA 內部使用 Pi runtime。

<p align="center">
  <img src="./docs/screenshots/dta-home.png" alt="DTA Meeting Agent 首頁" width="1200">
</p>

## 從這裡開始

| 目標 | 建議入口 |
|---|---|
| 在本機看介面 | [從原始碼啟動](#從原始碼啟動)，開啟 `http://localhost:30141` |
| 在終端使用 Meeting／PM Agent | [使用 CLI 或 TUI](#cli-與-tui) |
| 執行已發布的 container | [使用 Docker](#使用-docker) |
| 部署進公司 Kubernetes | [使用 OCI Helm chart](#公司-kubernetes-部署) |
| 串接公司 Orchestrator | [使用 REST 或 A2A](#對外-agent-契約) |
| 設定 Keycloak、MinIO、n8n 或影音模型 | [選擇 runtime adapter](#runtime-設定) |

## DTA 目前能做什麼

| 能力 | 輸入 | 結果 | 備註 |
|---|---|---|---|
| **Meeting Agent** | Prompt、逐字稿、TXT、Markdown、DOCX、音訊或影片 | 摘要、決策、待辦、需求、逐字稿／媒體 artifacts 與 handoff actions | 非同步影音工作；預設需要人工審核 |
| **PM Agent** | 直接輸入需求，或核准後的 Meeting handoff | 需求分析、URD、PRD、User Stories、Acceptance Criteria、設計脈絡與 Task Plan | 結構化成果、revision 與人工審核 |
| **可設定的部門 Agents** | Manifest v2 JSON | Schema 驗證後的結構化結果、文件、actions 與 n8n workflows | Contract 輸入／輸出、runtime model allowlist、timeout、artifact、role 與 review policy |
| **Coding Agent** | Repository prompt 與開發工具 | Pi 原生 coding session | 本機／開發者模式；公司模式預設隱藏，除非使用者具有指定 coding role |

Meeting 結果是版本化的結構化紀錄，不只是一段 Markdown。每個決策、待辦與需求都有穩定 ID、證據引用、source-grounding confidence 與 `needsConfirmation`。DTA 會保存來源 artifacts、串流標準化事件、記錄 Meeting／PM／部門 Agent 的人工審核，並只在核准後釋出下游 actions 與 workflows。

### 會議影音需要哪些模型

不同輸入需要不同能力：

| 輸入 | 需要的能力 |
|---|---|
| 打字或貼上的逐字稿 | 推理 LLM |
| 瀏覽器麥克風語音輸入 | 瀏覽器 Speech Recognition；DTA 不保存錄音 |
| 上傳音訊 | Speech-to-text provider + 推理 LLM |
| 上傳影片 | FFmpeg + Speech-to-text provider + 推理 LLM |
| 需要判讀影片畫面 | 選用的多模態／Vision provider，用來分析取樣關鍵影格 |

Production image 已包含 FFmpeg；語音轉文字與 Vision endpoint 由設定注入，image 內不內建模型。詳見 [Meeting media pipeline](./docs/meeting-media-pipeline.md)。

## 一個核心，多種入口

```text
人員                                   公司系統
 Web UI      TUI      CLI               Orchestrator
    \         |        /                  /      \
     \        |       /                REST    A2A 1.0
      +-------+------+--------------------+------+
                     |
            Generic Agent Contract
                     |
       +-------------+-------------+
       |                           |
 Meeting Agent                  PM Agent
       |                           |
       +-------------+-------------+
                     |
              Pi Agent Runtime
                     |
      +--------------+---------------+
      |              |               |
 LLM／影音 Gateway  n8n workflows   artifacts／memory
```

Pi 是鎖定版本的內部推理／session runtime。對外的 Agent request、result、event、artifact、review、REST 與 A2A object 都不暴露 Pi SessionManager 或 JSONL 內部格式。

## 從原始碼啟動

### 系統需求

- Node.js 22 以上
- npm 與 Git
- 可用的本機 Pi 模型／認證設定，或相容模型 Gateway 的 `LLM_*` 設定

```bash
git clone https://github.com/yhwangtw/dta.git
cd dta
npm ci
cp .env.example .env.local
npm run dev
```

開啟 [http://localhost:30141](http://localhost:30141)。

從原始碼執行 production build：

```bash
npm run build
npm start
```

> [!WARNING]
> 執行 `npm run build` 或 `npm run test:e2e` 前，先停止 `npm run dev`。這些指令都會寫入 `.next/`，同時執行可能破壞正在運作的開發 server。

`bash setup.sh` 仍是專用 end-user checkout 的一步式安裝／更新入口。Git checkout 會以 `origin/main` 為唯一真相，放棄本地 commits、tracked changes 與未被 ignore 的 untracked files。不要在有待保留修改的開發 checkout 執行。

## CLI 與 TUI

Web UI 不是必要條件。原始碼 checkout 使用 `npm run dta --`；production image 會把相同命令安裝為 `dta`。

```bash
# 互動式 Meeting Agent
npm run tui -- meeting

# 單次 Meeting Agent 執行
npm run dta -- run meeting \
  --task "產生會議紀錄" \
  --transcript ./notes.txt

# 上傳音訊或影片
npm run dta -- run meeting \
  --task "分析這場會議" \
  --file ./meeting.mp4

# PM Agent
npm run dta -- run pm \
  --task "產生 PRD" \
  --input ./requirement.json

# 查看執行紀錄並審核 Meeting 結果
npm run dta -- sessions --agent meeting
npm run dta -- review RUN_ID --approve --comment "已審核"
```

設定 `DTA_BASE_URL` 可讓 CLI／TUI 連到遠端 DTA server；Keycloak 保護的 server 另外設定 `DTA_ACCESS_TOKEN`。CLI 不會保存 token。詳見 [DTA Terminal Interfaces](./docs/cli.md)。

## 使用 Docker

Multi-architecture image 發布於 [`yhwangtn/dta`](https://hub.docker.com/r/yhwangtn/dta)。請從 [GitHub Releases](https://github.com/yhwangtw/dta/releases) 選擇公司核准的版本；production 不要使用 `latest`。

以下最小本機 profile 使用 local storage，並關閉所有外部 workflow／影音 adapters：

```bash
export DTA_VERSION=vYYYY.MM.DD  # 請換成公司核准版本

docker run --rm -p 30141:30141 \
  -e DTA_AUTH_MODE=none \
  -e DTA_ARTIFACT_STORE=local \
  -e DTA_MEMORY_STORE=local \
  -e DTA_WORKFLOW_PROVIDER=none \
  -e DTA_TRANSCRIPTION_PROVIDER=none \
  -e DTA_VISION_PROVIDER=none \
  -e DTA_UPLOAD_SCANNER=none \
  -v dta-data:/data \
  yhwangtn/dta:$DTA_VERSION
```

確認服務：

```bash
curl http://127.0.0.1:30141/health
curl http://127.0.0.1:30141/ready
curl http://127.0.0.1:30141/.well-known/agent-card.json
```

這個 profile 能證明應用程式正常啟動；真正執行 Meeting／PM 推理，仍需設定 Pi 模型憑證，或相容的 `LLM_BASE_URL`、`LLM_MODEL` 與 `LLM_API_KEY`。

Image 已包含 Node.js 22、Next.js、production dependencies、Pi runtime dependencies、Git、FFmpeg 與 `dta` executable。Host 與 Kubernetes node 不需另外安裝。

## Runtime 設定

DTA 只 build 一次，container 啟動時再注入環境設定。真實憑證只能來自環境變數或 mounted Secret，不能寫進 image。

| 類別 | 本機預設 | 公司 adapter |
|---|---|---|
| 身分驗證 | `DTA_AUTH_MODE=none` | `keycloak`，搭配 `KEYCLOAK_ISSUER`、audience 與 roles |
| 推理模型 | 既有 Pi 模型設定 | 透過 `LLM_*` 使用 OpenAI-compatible 公司 Gateway |
| Artifacts | 本機檔案系統 | MinIO（`MINIO_*`） |
| 對話記憶 | Local | Postgres 或 Redis |
| Workflows | `none` 或非 production 的 `mock` | n8n（`N8N_*` + 明確 workflow map） |
| Speech-to-text | 關閉 | OpenAI-compatible transcription endpoint |
| 影片關鍵影格分析 | 關閉 | OpenAI-compatible multimodal endpoint |
| 上傳掃描 | 關閉 | Fail-closed 公司 HTTP scanner |

從 [`.env.example`](./.env.example) 開始設定。詳細文件：

- [架構與目前限制](./docs/architecture.md)
- [Build once、runtime configuration 與部署](./docs/deployment.md)
- [n8n 邊界與 payload contract](./docs/n8n.md)
- [Meeting media pipeline](./docs/meeting-media-pipeline.md)
- [公司 Pilot 驗收](./docs/company-pilot-readiness.md)
- [維運、監控、留存、備份與復原](./docs/operations-runbook.md)

## 公司 Kubernetes 部署

公司需要 Docker Hub 權限、Helm 3、`kubectl`、cluster access、核准的公司 endpoints，以及外部管理的 Kubernetes Secret。操作機器不需要 clone repo，也不需要安裝 Node.js、npm 或 Pi。

發布位置：

| Artifact | 位置 |
|---|---|
| Container image | `docker.io/yhwangtn/dta` |
| OCI Helm chart | `oci://registry-1.docker.io/yhwangtn/dta-agent-platform` |
| Release notes 與原始碼 | [GitHub Releases](https://github.com/yhwangtw/dta/releases) |

Release tag 與 Helm chart version 使用不同合法格式。例如 `v2026.08.30` 對應 chart version `2026.8.30`。

```bash
export DTA_CHART=oci://registry-1.docker.io/yhwangtn/dta-agent-platform
export DTA_CHART_VERSION=YYYY.M.D  # 請換成公司核准版本

helm pull "$DTA_CHART" --version "$DTA_CHART_VERSION" --untar
cp dta-agent-platform/values.company-example.yaml /secure/path/dta-values.yaml
```

安裝前：

1. 取代所有範例 URL、hostname、storage class 與 policy values。
2. 確認已發布 chart 內的 `image.digest` 與核准的 `yhwangtn/dta` multi-architecture digest 完全一致。Release workflow 會自動蓋入並回讀驗證；只有公司 mirror 改變 digest 時才覆寫。
3. 由 Vault、External Secrets 或平台團隊建立 `dta-agent-platform-secrets`。
4. 把瀏覽器 UI 放在公司 Keycloak-aware ingress／auth proxy 後方。
5. 保持 `replicaCount: 1`。

先 render 與 review，再 atomic 部署：

```bash
helm show chart "$DTA_CHART" --version "$DTA_CHART_VERSION"

helm template dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  -f /secure/path/dta-values.yaml

helm upgrade --install dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  --create-namespace \
  --atomic \
  --timeout 10m \
  -f /secure/path/dta-values.yaml
```

Chart 預設使用 non-root、read-only root filesystem、移除 Linux capabilities、禁止 privilege escalation、不掛載 ServiceAccount token，並分開 startup／readiness／liveness probes。另提供 opt-in NetworkPolicy、authenticated ServiceMonitor、dry-run-first retention CronJob 與公司自備 backup image 的 PVC backup hook。Secrets、values、upgrade 與 rollback 詳見 [Helm chart guide](./deploy/helm/dta-agent-platform/README.md)。

## 對外 Agent 契約

### Framework-neutral REST

```http
POST /api/agents/meeting/run
POST /api/agents/pm/run
GET  /api/agent-runs/{runId}
GET  /api/agent-runs/{runId}/events
```

Meeting request 範例：

```bash
curl -X POST http://127.0.0.1:30141/api/agents/meeting/run \
  -H 'Content-Type: application/json' \
  -d '{
    "requestId": "meeting-demo-001",
    "conversationId": "demo-conversation",
    "task": "產生結構化會議紀錄",
    "input": {
      "transcript": "Alice 核准 Pilot。Bob 會在週五前準備上線計畫。"
    }
  }'
```

Keycloak mode 需加上 `Authorization: Bearer <access-token>`。回應會提供 generic `runId` 與狀態；可透過 normalized SSE endpoint 追蹤，或輪詢 run resource。

### A2A 1.0

```http
GET  /.well-known/agent-card.json
POST /a2a/v1/message:send
POST /a2a/v1/message:stream
GET  /a2a/v1/tasks
GET  /a2a/v1/tasks/{taskId}
```

A2A caller 必須送出 `A2A-Version: 1.0`。Meeting media 先上傳至 `POST /api/meeting-agent/extract`；DTA 不會從 A2A file part 抓任意遠端 URL。核准後的 Meeting → PM handoff 會以 generic Agent action 回傳，由公司 Orchestrator 決定路由。

## 公司驗收

`/health` 只證明 process 存活；`/ready` 證明選定 adapters 已完成設定。兩者都不能證明完整公司路徑可用。

Keycloak、MinIO、公司 LLM 與 n8n 設定完成後，執行：

```bash
export DTA_BASE_URL=https://dta.company.example
export DTA_ACCESS_TOKEN='<短效 User A token>'
export DTA_SECONDARY_ACCESS_TOKEN='<短效 User B token>'

dta pilot-check
dta pilot-check --live --report dta-pilot-report.json
```

Live suite 會驗證 Keycloak discovery／JWKS、選定 adapters、MinIO 上傳下載、真實 Meeting Agent LLM run、MeetingResult 2.0 traceability、normalized SSE、User A／User B 對 sessions、metadata、run、SSE、workflow 與個人狀態的隔離、人工核准，以及具 idempotency 且沒有業務副作用的 n8n probe。報告會移除敏感資訊，也不會保存 bearer token。詳見 [Company Pilot Readiness](./docs/company-pilot-readiness.md)。

## 目前 production 限制

- Run supervision、active Pi sessions、normalized event replay 與 Meeting／PM／部門 Agent result records 尚未分散式化；即使使用 Postgres／Redis memory，production 仍必須是 **單一 replica**。
- DTA 會驗證 Keycloak token 與 ownership，但瀏覽器 login 交由公司 authenticated ingress／proxy。
- 影音工作會持久化、顯示進度並支援取消／有限次重試；但上傳解析與單次 provider 呼叫仍會把單一檔案載入記憶體，尚未做 chunked upload／transcription。
- n8n 是經審核的 workflow executor，不是主要 Agent runtime。完成權限、人工關卡與 idempotency 驗證前，保持 workflow tools 關閉。
- 公司模式預設隱藏 File、Git、shell、provider、skill 與 Coding Agent；只有具有指定 coding role 的 principal 可以使用。
- Image 發布成功不代表公司整合成功；Pilot acceptance gate 是 `dta pilot-check --live`。
- 應用程式留存可清理 local artifacts／runs／media jobs／workflow records／local memory；MinIO lifecycle、外部 Postgres／Redis 記憶與 Pi JSONL session 清理仍由平台政策協調。

完整內容請看 [production limitations](./docs/architecture.md#current-production-limitations)。

## 介面導覽

以下是目前 DTA 應用程式使用非機密示例資料的實際瀏覽器畫面，不是生成式 mockup。

| 會議素材與檔案上傳 | 對話、結構化成果與審核 |
|---|---|
| ![會議素材與檔案上傳](./docs/screenshots/dta-meeting-intake.png) | ![Meeting Agent 對話與成果審核](./docs/screenshots/dta-meeting-review.png) |

| PM Agent handoff | 手機版首頁 |
|---|---|
| ![PM Agent 需求交接](./docs/screenshots/dta-pm-agent.png) | <img src="./docs/screenshots/dta-mobile-home.png" alt="DTA 手機版首頁" width="390"> |

## 開發

```bash
node_modules/.bin/tsc --noEmit  # Typecheck
npx eslint .                    # Lint
npm test                        # Vitest
npm run build                   # Production build
npm run test:e2e                # Playwright production-server scenarios
```

主要目錄：

```text
app/api/          REST Agent Contract、runs/events、artifacts、sessions、workflows
app/a2a/          A2A 1.0 HTTP binding
components/       Web UI
scripts/          dta CLI、TUI、server 與 pilot readiness command
lib/agents/       generic runtime、Meeting Agent、PM Agent、部門 Agent、Agent registry
lib/integrations/ storage、memory、n8n、media 與 scanner adapters
deploy/           Docker／Kubernetes／Helm deployment assets
docs/             架構、維運、media、n8n、CLI 與 screenshots
```

Repository invariants 與開發陷阱請看 [`AGENTS.md`](./AGENTS.md)。

## 發布

PR 通過 CI 並合併後：

```bash
gh workflow run release.yml -f tag=vYYYY.MM.DD
```

Workflow 會建立 version commit 與 tag、smoke-test exact image、阻擋 High／Critical CVE、將 `linux/amd64` 與 `linux/arm64` image 發布至 Docker Hub／GHCR、驗證 manifests、產生 SBOM／provenance attestations，把同一個 image digest 蓋入 Helm package、驗證預設與 enterprise profile、發布並回讀 OCI chart，最後才建立 GitHub Release。DTA 不發布至 npm。

## 授權

MIT — 詳見 [`LICENSE`](./LICENSE)。
