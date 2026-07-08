# Pi Agent Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30141
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npx eslint .`  
Tests: `npm test` (vitest)  
E2E: `npm run test:e2e` (Playwright — builds and boots a production server on
:30177 with generated fixtures; **stop `npm run dev` first**, the build step
corrupts a running dev server's `.next/`. Local containers with a
preinstalled browser: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`.)
**@playwright/test is deliberately NOT in package.json** — its transitive
postinstall downloads browser binaries and would break offline/Nexus
`npm ci`. Install it ad hoc first: `npm i -D --no-save @playwright/test`
(CI does exactly this). `e2e/` + `playwright.config.ts` are excluded from
tsconfig/eslint for the same reason.  
**Never run `next build` while the dev server is running** — pollutes `.next/` and breaks `npm run dev`.

E2E traps: transcript text offscreen is `content-visibility`-skipped and
Playwright calls it *hidden* — anchor on sidebar text or use `toBeAttached`,
scroll before visibility asserts. UI strings use the ellipsis character
(`Message…`, `Filter files…`), not three dots.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ incremental cache over        │
  │                        │  ~/.pi/agent/sessions/        │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ prompt/steer/bash/…
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │◀── data: {...} ─────────│   session.onEvent() ◀────────│ session.subscribe()
  ├─ GET /api/git/changes ─▶ git status (allowed cwds)     │
  └─ GET /api/git/file-diff▶ HEAD vs worktree contents     │
```

**Session browsing** (read-only): parses `.jsonl` files via `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

### Layout (post-redesign)

Icon rail (44px, `AppShell`) → contextual panel (Sessions | Files | Changes) → chat (session-scoped top bar + transcript + input) → right panel (file viewer / diff). Rail bottom: Models / Skills / Language / Theme. Global hotkeys live in one `AppShell` effect — **every hint shown in the ⌘K palette must be bound there**.

---

## File Map

```
app/api/
  sessions/…                      list/read/patch/delete, context, export(+md),
                                  search, tags, pins, analytics
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command (see rpc-manager)
  agent/[id]/events/route.ts      GET SSE stream (30s comment heartbeats)
  agent/[id]/summarize/route.ts   POST — auto-naming (skips named sessions)
  git/changes/route.ts            GET ?cwd= — status --porcelain + numstat
  git/file-diff/route.ts          GET ?cwd=&path= — HEAD vs worktree text
  files/search/route.ts           GET ?cwd=&q= — recursive filename search
                                  (BFS, allowed-roots gated, 200/depth-8 caps)
  cwd/browse/route.ts             POST {path} — dirs-only listing for the
                                  project picker (same trust model as
                                  cwd/validate: picking a NEW workspace may
                                  point anywhere; it becomes an allowed root)
  files/, models*, auth/, skills/, cwd/   unchanged surfaces

lib/
  rpc-manager.ts      AgentSessionWrapper + registry + command dispatch
                      (prompt/steer/follow_up/fork/bash/clear_queue/…)
  session-reader.ts   incremental listing (stat cache) + context building
  i18n.tsx            en/zh-TW strings — module store, useI18n()/translate()
  skin.ts             appearance skins — html[data-skin] token overrides
  prefs.ts            small persisted UI prefs (always-follow stream)
  attention.ts        tab title store (React-rendered <title>) + notifications
  file-security.ts / file-mime.ts / file-stream.ts / file-paths.ts
  normalize.ts        toolCall field-name normalization
  types.ts            shared types (incl. BashExecutionMessage)

components/
  layout/   AppShell (layout wiring + hotkeys), IconRail, ShortcutsDialog,
            FilesPanel, ChangesPanel, DiffPanel, FileViewer, TabBar,
            ErrorBoundary, text-viewer/
  chat/     ChatWindow (find/⌘F, follow-mode scroll, ⌥↑/⌥↓ turn nav, status
            line, bookmarks), CollapsibleMessage (long-history clamp),
            turn-nav.ts, ChatInput (history ↑, bash prefix), MessageView,
            BashBlock, AssistantMessageView (error card, edit/write tool
            diff view), BranchNavigator, ChatMinimap, MarkdownBody (lazy
            KaTeX/Mermaid/PrismAsync)
  sidebar/  SessionSidebar (+embedded explorer, showExplorer prop, archived
            toggle), SessionItem, SessionContextMenu (tags/archive/delete),
            FileExplorer, CwdPicker, TagFilter
  modals/   ModelsConfig, SkillsConfig, AnalyticsModal, ToolPanel
  ui/       CommandPalette, Toast, Skeleton

hooks/    useAgentSession (chat orchestration; extracted pieces live in
          use-agent-connection.ts — SSE + stall watchdog,
          use-transcript-scroll.ts, use-model-catalog.ts, and
          use-agent-session-types.ts — reducer + computeSessionStats),
          useAppShellState, useRightPanelWidth, useCommandPalette,
          useSessions (pins + archive), useToast (global store), useTheme,
          useExplorer (persisted), …
```

---

## Key Design Decisions & Traps

### Module-level stores (theme / toast / i18n / skin / attention)
Cross-cutting client state uses module-level stores + `useSyncExternalStore`
— no context providers. **Do not** create per-instance state for these:
`useToast` was once per-instance and SessionSidebar's toasts silently never
rendered (its container wasn't mounted). One store, one `<ToastContainer />`
at the app root.

### React 19 owns `<title>` — never write `document.title`
Layout metadata is hoisted by React; raw `document.title` writes get
clobbered on the next render (root-caused via a setter trace). The tab title
is a store in `lib/attention.ts` rendered as `<title>{useTabTitle()}</title>`
in AppShell. Layout `metadata` deliberately has **no** `title`.

### StrictMode double-invocation
Never call a state setter inside another setter's updater — updaters run
twice in dev and a toggle cancels itself (bit us in the rail view switch).
Side effects (localStorage writes) inside updaters are tolerated only when
idempotent.

### Session listing is a stat-based incremental cache
`lib/session-reader.ts` walks the sessions dir, `stat()`s each file, and
re-parses only changed ones with pi's pure `parseSessionEntries`.
**Do not use `SessionManager.open()` for read-only scanning** — it rewrites
empty/corrupted files as a side effect. Cache lives on `globalThis`
(hot-reload safe); entries for deleted files are evicted each pass.

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- Idle timeout 10 min; concurrent `startRpcSession()` share a start Promise
- **Fork must destroy the wrapper immediately**: `AgentSession.fork()` mutates
  inner state in place; `send("fork")` captures the new id then `destroy()`s.
- `bash` command wraps `executeBash` and streams synthetic
  `bash_start/bash_chunk/bash_end` events through the wrapper's listeners →
  existing SSE channel. pi records the result itself (role `bashExecution`).

### Scroll contract (ChatWindow + useAgentSession)
- On send: user message anchors to the viewport top; a viewport-height spacer
  below lets the answer stream in without jumps.
- End of run: only auto-scroll to bottom when the reader is within 200px of
  it (measured fresh — the spacer has already unmounted). Never yank.
- Streaming follow: engaged only by user scrolls into the bottom zone (or the
  jump button) — content growth never changes engagement. Instant scrolls,
  not smooth (smooth queues jitter at token rate).
- Jump-to-bottom uses `block:"end"` — `block:"start"` + spacer can scroll the
  conversation out of the viewport.
- **The end marker renders BEFORE the run spacer.** Follow mode and the jump
  button pin to the marker; if it sat after the spacer, following a stream
  would park the viewport in the spacer's blank space instead of on the text.
- Long-message collapse (`CollapsibleMessage`): history taller than 720px
  clamps to 380px behind a fade; the current turn (last user message onward)
  is exempt. Measured in a layout effect (no first-paint jump). ⌘F's
  `gotoMatch` pre-expands the target via `visibleKeys` before scrolling.
- ⌥↑/⌥↓ turn nav (`turn-nav.ts`): the pick epsilon (16px) must stay larger
  than `.msg-item`'s `scroll-margin-top` (10px) or "next" re-selects the
  currently-aligned message and the jump goes nowhere.
- "+N lines" counter on the jump button: baseline = scrollHeight, re-anchored
  on run start/end, spacer resize, expand/collapse, and whenever the reader is
  at the tail. Only counts while running and not following.
- Always-follow preference (`lib/prefs.ts`, `pi-follow-stream`): read by
  ChatWindow (engage follow at run start) AND useAgentSession (end-of-run
  scroll gate). Toggled from the ⌘K palette, default off.

### Run outcome signals
`agent_end` events carry `messages`; `getRunError()`
(hooks/use-agent-session-types.ts) reads the last assistant message's
`stopReason`. Failures: red error card (AssistantMessageView), error toast,
⚠ title, failure notification, **no** completion sound. Stall watchdog: 60s
without an SSE event (120s during tool runs) shows a warning — SSE heartbeats
are comments and don't reset the clock.

### Appearance skins
Base palette (terminal) lives in `:root`/`html.dark`; the other skins are
`html[data-skin="…"]` token-override blocks in `globals.css` (~23 tokens ×
skin × theme). Components read CSS variables only — **never hardcode colors**.
Default skin: `editorial` (see `DEFAULT_SKIN` and the no-flash init script in
`layout.tsx` — adding a skin means updating `SKINS`, the init script's inline
array, and the palette's `skin:*` actions).

Glass layer: `--glass-bg`/`--glass-border` are derived from each skin's own
surfaces via `color-mix` in `:root`, so all skins get matching frosted chrome
(palette, dialogs, toasts, find bar, jump button, top bar) for free. The
`glass` skin overrides them and sets translucent surface tokens over a fixed
body gradient; its `--bg-elev-*` stay near-opaque on purpose — dropdowns have
no backdrop blur and must stay readable over arbitrary content.

Inline-style trap: react-syntax-highlighter themes mix `background` and
`backgroundColor`; `MarkdownBody`'s customStyle pins **both** so the merged
style stays stable across theme switches (React dev warns otherwise).

### cwd-follow must not reset the view
The sidebar follows the open session's cwd (cross-project selection). That
notification flows through `handleCwdChange`, whose reset path calls
`router.replace("/")` — guarded by `selectedSessionRef`: when the new cwd
matches the open session, skip the reset or the `?session=` URL param (and
reload-restore) silently breaks.

### Session tags — one canonical shape
The server (`/api/sessions/tags`, `<agent-dir>/tags.json`) stores
`sessionId → [tags]`. The client (`useTags`) **inverts on load** to
`tag → [sessionIds]` and everything client-side uses that shape: TagFilter,
palette, filtering, and `sessionTagsOf()` for per-item chips. Never index the
client map by session id — that mismatch once made chips render only after a
reload and removal appear to no-op.

### File snapshots (`lib/git-snapshot.ts`)
Git-backed restore points captured before each run (rpc-manager's `prompt` case
+ the `/tgd-*` command route call `createSnapshot`). Uses a throwaway
`GIT_INDEX_FILE` to `add -A` + `write-tree` (never touches the user's index/HEAD),
`commit-tree` the result, and keeps it via `refs/pi/snap/<sessionId>/<id>`.
Metadata in `<agent-dir>/snapshots/<sessionId>.json`. **Restore is a precise
delta**: diff snapshot-commit vs current working tree, then per file — M/D
`git checkout <snap> -- file`, A (created since) `rm`. Path-guarded to stay
inside cwd. Dedup by tree sha; cap 20/session. Git repos only.

### tGD artifacts (`lib/tgd-artifacts.ts`, `components/layout/TgdArtifactsPanel.tsx`)
The tGD workflow writes its docs to a **sibling** `<project>-tGD/` dir (or
`$TGD_DIR`), *outside* the code repo — `CONTEXT.md`, `TRACKING-PLAN.md`, `wiki/`,
and per-feature dirs (a "feature" = a dir with `PRD.md` or `SPEC.md`) holding
PRD/SPEC/DESIGN/TASKS/METRICS + `prototype/*.html`. `resolveTgdDir(cwd)` finds it;
`getAllowedRoots()` adds it so the file viewer can open those docs. The `tgd`
rail view lists them and maps docs → phases (PRD/SPEC→define, TASKS→plan) for the
pipeline echo. `.scans/` and dot-dirs are infra, excluded. API: `GET /api/tgd/artifacts`.

### tGD pipeline (`components/chat/TgdPipeline.tsx`)
Always-visible phase bar at the top of the session view. `PHASE_ACTIONS`
(ChatWindow) is the source of the seven phases; status is derived from the
transcript — ChatWindow scans user messages for a leading `/tgd-<phase>`, the
last match is `current`, earlier matches are `done`, the rest `todo`. Clicking a
phase calls `chatInputRef.setText("/tgd-x ")` (no auto-send). Dismiss state is
`localStorage["pi-tgd-pipeline-hidden"]`. The current phase carries
`aria-current="step"` (stable test hook).

### Prompt templates
User-defined reusable prompts. Server (`/api/prompts`, `<agent-dir>/prompts.json`)
stores `[{id, name, body}]`. `usePrompts` is a module-level store (shared across
instances, same pattern as `useToast`) so the composer's `/` menu and the
manager modal (⌘K → Prompt templates) stay in sync. `buildSlashItems()` merges
them with the built-in `TGD_COMMANDS`; a tGD item inserts `/name `, a template
inserts its `body`. Names are slugified server-side so `/name` is unambiguous.

### Two kinds of branching — don't confuse them
- **Fork**: new independent `.jsonl` file; shown as a child via
  `parentSession` header (display metadata only — safe to rewrite files).
- **In-session branch**: `navigate_tree` within one file; switching loads
  `/api/sessions/[id]/context?leafId=`.

### Edit-and-rerun a past turn
`UserMessageView` inline editor → `handleEditRerun(prevEntryId, newText)` in
`useAgentSession`: `navigate_tree` back to the entry before the turn, then send
the edited text as a fresh branch. Same primitives as `handleRetry` (which does
the last turn, unedited).

### ToolCall field normalization
Pi stores `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses
`{toolCallId, toolName, input}` — `normalizeToolCalls()` handles both file
load and streaming paths.

### /api/git security
Both routes gate `cwd` against the session allowed-roots set, use `execFile`
(no shell), reject `-`-prefixed paths, and cap at 1 MB. Keep it that way.

### i18n
`lib/i18n.tsx`: add keys to `MESSAGES`, use `t()` in components /
`translate()` in non-reactive code. English is the default locale; zh-TW is
partial (config modals intentionally untranslated). Palette actions carry
Chinese `keywords` so both languages can search them.

### CSS Design Tokens (`app/globals.css`)
Semantic tokens with light/dark + per-skin variants. `chrome-mono` class =
JetBrains Mono for machine-y labels (group headers, stats, meta); message
content stays Inter.

### Bundled fonts (`public/fonts/`, `@font-face` in `globals.css`)
Latin: **Inter** (400/500/600/700) + **JetBrains Mono** (400/700). CJK:
**Noto Sans TC** (400/500/700, CJK-only subset ~7MB total) so Traditional
Chinese renders with TC glyphs on every OS — without it, Linux/Windows fall
back to a Simplified-default or bitmap system font (e.g. WenQuanYi) and draw
Han codepoints with the wrong regional shapes. The `@font-face` blocks carry
a CJK `unicode-range` so Latin/digits stay on Inter; the sans + mono stacks
list `'Noto Sans TC'` ahead of the system CJK names. Regenerate the subset
with `pyftsubset <full-NotoSansTC-weight>.ttf --unicodes=U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF --flavor=woff2`
(full-weight TTFs come from the `@expo-google-fonts/noto-sans-tc` npm package).

---

## Pi Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"...","modelId":"...","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],"stopReason":"stop|error|aborted","errorMessage":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"bashExecution","command":"...","output":"...","exitCode":0}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps
each displayed message back to its `.jsonl` entry id, used for fork and
navigate_tree calls.
