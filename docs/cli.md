# DTA Terminal Interfaces

DTA has one server-side Agent core and several clients. Web, TUI, batch CLI,
REST, and A2A all create the same generic Agent runs; only `dta pi` deliberately
enters the native Pi Coding Agent interface.

```text
Web UI ─┐
TUI ────┼──> Generic Agent API + normalized SSE ──> Meeting / PM Agent
CLI ────┤                                      └──> PiAgentRuntime
A2A ────┘

dta pi ──────────────────────────────────────────> Native Pi Coding Agent
```

The TUI and batch CLI are HTTP clients, not additional runtimes. A DTA server
must be running so every entry point shares run ownership, conversation memory,
artifacts, audit records, and Meeting review state.

## Commands

Inside the production image, `dta` is installed as an executable. In a source
checkout, use `npm run dta --` before the same arguments.

| Image | Source checkout | Purpose |
|---|---|---|
| `dta serve` | `npm run dta -- serve` | Start Web, REST, SSE, and A2A |
| `dta tui meeting` | `npm run tui -- meeting` | Interactive Meeting Agent terminal |
| `dta tui pm` | `npm run tui -- pm` | Interactive PM Agent terminal |
| `dta run meeting …` | `npm run dta -- run meeting …` | One-shot or batch Meeting run |
| `dta sessions` | `npm run dta -- sessions` | List generic domain Agent runs |
| `dta review RUN_ID` | `npm run dta -- review RUN_ID` | Human Meeting review |
| `dta agents` | `npm run dta -- agents` | List enabled public Agents |
| `dta health` | `npm run dta -- health` | Check liveness and readiness |
| `dta pi` | `npm run dta -- pi` | Native Pi Coding Agent terminal |

`npm run agent -- meeting|pm …` remains compatible with the older one-shot
command.

## Start the server

```bash
npm run build
npm run dta -- serve
```

For local development:

```bash
npm run dta -- serve --dev
```

The default address is `http://127.0.0.1:30141`. Use `--port` and `--hostname`
to change the listener.

## Interactive TUI

```bash
npm run tui -- meeting
```

Free-form lines create turns in one `conversationId` and normalized SSE events
show progress as the server works. The result renderer shows Meeting summary,
decisions, action items, requirements, artifacts, and review state without
exposing Pi events.

Interactive commands:

```text
/agent meeting|pm
/new [conversation-id]
/attach PATH
/attachments
/sessions
/result RUN_ID
/review RUN_ID [a|c|r]
/clear
/help
/quit
```

`/attach` accepts the same text, DOCX, audio, and video formats as the Web UI.
It uploads the source through `/api/meeting-agent/extract`; configured media
providers create timestamped evidence before the next turn is submitted.

## Batch runs

```bash
npm run dta -- run meeting \
  --task "Generate review-ready Traditional Chinese meeting minutes" \
  --transcript ./meeting.txt \
  --conversation product-weekly
```

Media files are supported and `--file` can be repeated:

```bash
npm run dta -- run meeting \
  --task "Analyze this recording" \
  --file ./meeting.mp4 \
  --file ./agenda.docx
```

Use `--no-wait` for asynchronous submission and `--no-stream` when a polling-only
client is preferred. Progress goes to stderr and the final Agent response goes
to stdout, keeping the output safe for scripts.

## Sessions and review

```bash
npm run dta -- sessions --agent meeting --status completed
npm run dta -- review RUN_ID --approve
npm run dta -- review RUN_ID --request-changes --comment "Confirm the owner"
```

The sessions view is derived from generic Agent runs and conversation metadata;
it does not expose Pi JSONL session IDs. Meeting handoff actions remain withheld
until the current revision is approved.

## Keycloak

The terminal clients do not store credentials. Obtain a token through the
company-approved login flow and pass it through the environment:

```bash
export DTA_BASE_URL=https://dta.company.example
export DTA_ACCESS_TOKEN="<access token>"
dta tui meeting
```

The server still enforces the token audience, run ownership, reviewer role,
rate limits, and artifact access policy. The CLI cannot elevate the caller by
supplying `--user`.

## Native Pi boundary

`dta pi` launches the pinned native Pi Coding Agent terminal for developers.
Meeting and PM system prompts, publication tools, review rules, and generic
contracts are not active in that mode. Use `dta tui meeting|pm` for domain work.
