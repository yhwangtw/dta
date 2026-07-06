# Changelog

All notable changes to tGD-pi-web are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: `YYYY.MM.DD` (date-based, aligned with upstream tGD).

## [Unreleased]

### Added
- **Project picker rebuild**: searchable project list with folder name + path + session-count rows, keyboard navigation (↑↓/Enter), pin favorites and remove stale entries (persisted); **filesystem browse mode** (`/api/cwd/browse`) with breadcrumb navigation and "Use this folder"; **path autocomplete** while typing a custom path (debounced suggestions, Tab completes).
- **Deep file search**: `/api/files/search` (recursive BFS, junk dirs skipped, allowed-roots gated, capped at 200 results / depth 8); the explorer filter switches to flat server results at 2+ chars, folder hits reveal themselves in the tree.
- **Git-aware explorer**: modified/untracked files carry colored M/A/D/U badges (from `/api/git/changes`); folders containing changes show a dot.
- **Explorer context menu**: copy path / copy relative path / insert @ mention / view diff (for changed files, opens the HEAD ↔ worktree diff panel).
- **Explorer keyboard navigation**: ↑↓ move, ←→ collapse/expand, Enter opens.

## [2026.07.07] — eeacb35 (PR #6, #7, #8)

### Added
- **Glass skin** (fifth appearance): frosted translucent panels over a fixed aurora-gradient backdrop, light + dark; `⌘K → Appearance: Glass`.
- **Appearance picker**: palette button in the rail opens a glass popover with a light/dark toggle and swatch cards for all five skins (applies live on click, Esc/outside-click closes); "Open Appearance" also added to ⌘K.
- **Frosted floating chrome on every skin**: command palette, shortcuts dialog, toasts, ⌘F find bar, jump-to-bottom button, and the top bar now use backdrop-blur glass; `--glass-bg`/`--glass-border` tokens derive from each skin's palette via `color-mix`.
- **Long-message collapse**: historical messages taller than a screen clamp to a 380px preview with a fade and "Show full message · ~N lines" control; the latest exchange always renders in full; ⌘F jumps auto-expand a collapsed target.
- **Turn navigation**: ⌥↑ / ⌥↓ walk between user messages (aligned to the send-time top-anchor position); added to the shortcuts dialog together with the previously missing ⌘F row.
- **New-content counter**: while output streams and the reader isn't following, the jump-to-bottom button shows how many lines have accumulated below (`↓ +N lines`).
- **Always-follow mode**: ⌘K → "Toggle Always-Follow Output" pins the view to streaming output terminal-style; persisted (`pi-follow-stream`), default off.

### Fixed
- The transcript end marker now renders **before** the run spacer — engaging follow during a run used to pin the viewport to the spacer's blank space instead of the streaming text.
- React dev warning (and dev-overlay "1 Issue" badge) on theme switch: code blocks now pin both `background` and `backgroundColor` because the highlighter themes mix the two forms.

## [2026.07.06] — 4aa62a9 (PR #1, #2, #3)

### Added
- **Bash mode**: `!cmd` executes in the session cwd with output streamed over SSE (`bash_start/chunk/end` events); results recorded as `bashExecution` entries the agent can read; `!!cmd` excludes output from LLM context; Cancel for long runs; terminal-pane rendering with exit badges.
- **Changes panel**: git working-tree view for the session cwd (branch, per-file M/A/D/R/U status, +/− stats), refreshed after each agent turn; click-through to a HEAD ↔ worktree diff in the right panel. New `/api/git/changes` and `/api/git/file-diff` routes (allowed-roots gated, `execFile`, 1 MB cap).
- **Appearance skins**: four complete palettes — Editorial (warm paper, **default**), Terminal (emerald), Industrial (mono), Aurora (violet) — each with light+dark, switchable via ⌘K, persisted, no-flash init.
- **Attention loop**: live tab title (⏳ running / ✅ done / ⚠ failed via a React-rendered `<title>` store), browser notification when a hidden tab finishes, status line with spinner + elapsed timer, stall watchdog (60s/120s no-event warning).
- **Failure visibility**: assistant messages with `stopReason:"error"` render a red error card with the full `errorMessage`; failed runs fire an error toast, skip the completion sound, and notify as "Failed".
- **i18n**: English-default UI with a Traditional-Chinese toggle (~90 strings, `lib/i18n.tsx` module store); palette actions searchable in both languages.
- **⌘F in-conversation find**, jump-to-bottom button, input history (↑ recall), wide-chat toggle, follow-up queue banner with Cancel (`clear_queue` rpc), keyboard-shortcuts dialog with real bindings (⇧⌘M/⌘//⌘B/⌘\).
- Tests: 58 → 82 (incremental session cache, stream reducer, phase labels, run-error extraction).

### Changed
- **Layout restructure**: 44px icon rail (Sessions/Files/Changes/Search/Analytics + Models/Skills/Language/Theme) with a single contextual panel; session-scoped top bar (title + Export/Branches/System/stats); embedded file tree coexists with the full-height Files view (persisted preference).
- **Typography**: Traditional-Chinese-first font fallbacks, CJK-sized heading scale, bundled JetBrains Mono 700, antialiasing, 10.5px type floor; machine chrome set in mono (`chrome-mono`).
- **Session listing** rewritten as a stat-based incremental cache over pi's `parseSessionEntries` (no more full-disk rescans; avoids `SessionManager.open`'s file-rewrite side effect).
- `MessageView` memoized with stabilized props — streaming no longer re-renders every historical message; syntax highlighter moved to a lazy `PrismAsync` chunk.
- Scroll behavior: end-of-run only follows when the reader is near the bottom; sticky follow while streaming engages/disengages on user scrolls only; jump button uses `block:"end"`.

### Fixed
- ⌘K palette not closing after selecting a session/tag/file; mobile sidebar trapping first-time visitors; advertised-but-unbound shortcuts; `useToast` per-instance state rendering sidebar toasts invisible; cross-project selection leaving the sidebar on the old project; cwd-follow wiping the `?session=` URL param (broke reload-restore); silent send/steer/follow-up failures; "1 msgs" pluralization; search trigger collapsing to "Se…".
- CI: test job was missing entirely; lint ran the removed `next lint` under `continue-on-error` (never failed).
- `npm audit` clean via next 16.2.10 + postcss override.

## [2026.07.02] — b3d107c9

### Refactored
- **Sidebar hooks** (S1): Extracted `useSessions`, `useCwd`, `useExplorer` hooks from `SessionSidebar.tsx` (483 → 317 lines). The hooks own all session list, pin toggle, CWD picker, and file-explorer state independently. `CwdPicker.tsx` now accepts a single consolidated `state` + `actions` + `refs` object instead of 17 individual props (168 → 100 lines).
- **File API split** (F1): Decomposed the 514-line `app/api/files/[...path]/route.ts` into 3 shared lib modules:
  - `lib/file-security.ts` — path normalization, allowed-roots cache, traversal guards
  - `lib/file-mime.ts` — extension→mime/language mappings
  - `lib/file-stream.ts` — file streaming, range requests, HTML escape, docx preview wrapper
  - The route handler is now a clean dispatcher (~100 lines) that delegates to per-type helper functions.
- **useFileWatch hook** (F4): Extracted the SSE file-watch pattern from `TextFileViewer` / `ImageViewer` / `AudioViewer` into a single `hooks/useFileWatch.ts` hook. Each viewer now uses `useFileWatch(filePath)` and reacts to the returned `refreshTrigger` counter, eliminating the duplicated `new EventSource(...)` + `connected/change/error` handler boilerplate.
- **TextFileViewer 5 modes split** (F2): Split `TextFileViewer.tsx` (264 → 197 lines) by extracting three focused sub-components into `components/layout/text-viewer/`:
  - `SourceView.tsx` — syntax-highlighted source via Prism
  - `DiffViewMode.tsx` — file-change diff (wraps `DiffView`)
  - `PreviewView.tsx` — HTML iframe + Markdown render
  The parent component now dispatches by mode instead of nesting 4 ternaries.
- **formatSize consolidation** (F3): Removed duplicate `formatSize` definitions from `FileViewer.tsx` and `DiffView.tsx`; both now import the canonical version from `file-viewer-utils.ts`.
- **AppShell state extracted** (U1): Extracted 11 useState + 9 handler callbacks + 3 refs from `AppShell.tsx` (633 → 480 lines) into `hooks/useAppShellState.ts`. File tab state (right panel) extracted into `hooks/useFileTabs.ts`.
- **ChatInput controls hook** (U2): Created `hooks/useChatInputControls.ts` to consolidate the model/thinking/tool-preset prop derivations (`modelOptions`, `modelsByProvider`, `currentName`) used by `ChatInput`. The component now delegates the derivation to the hook.
- **Skeleton component** (U5): Created reusable `components/ui/Skeleton.tsx` + `Skeleton.module.css`. Replaces 3 duplicated inline `skeleton-line` placeholder blocks in `SessionSidebar`, `FileExplorer`, and `ChatWindow`. Existing call sites still use the local className — future consolidation welcome.
- **Unused imports cleaned** (5): Removed 7 truly unused imports (2× formatSize, useTheme, getRelativeFilePath, DiffView, getFileName, SkillSearchResult). Remaining 6 lint warnings are type-only false positives flagged by ESLint for `interface` types; TSC and runtime treat them as used.

### Added
- **Test coverage** (6): Added 15 new tests:
  - `lib/__tests__/agent-client.test.ts` — 6 tests covering `sendAgentCommand` success path, session-id encoding, error responses, malformed JSON.
  - `components/layout/__tests__/file-viewer-utils.test.ts` — 9 tests covering `formatSize`, `formatDuration`, `getFileExt`, `DOCX_PREVIEW_MAX_BYTES`.
  - Total: 49 tests passing (was 34).

### Verified
- TypeScript: `tsc --noEmit` — 0 errors
- ESLint: 0 errors (6 pre-existing type-only warnings, unrelated)
- Tests: `npm test` — 49/49 passing
- Dev server: `http://localhost:30141` — HTTP 200 (next dev still running)

---

## [2026.06.30] — bf0eea29

### Added
- **Session pin/unpin**: new REST endpoint `GET/POST/DELETE /api/sessions/pins` persists to `~/.pi/agent/pins.json`. Pinned sessions float to the top of the sidebar under a "Pinned" group header; unpinned sessions keep the existing tree layout with date group headers. Third sidebar action button (pin → rename → delete order, with delete still last since it's destructive). Pinned state is shown via a filled star in a neutral tone (not the warning yellow — shape, not color, signals the toggle).
- **Section dividers**: 1px `border-top` between Pinned and date groups; the first section has no divider so the layout doesn't start with a stray line.
- **`ChatInput.setText()`**: imperative API that forcefully replaces the input value. Quick-action phase chips use it so clicking a different phase swaps the slash command rather than appending.

### Changed
- **Slash command descriptions** are now uniform English em-dash format. The last command is renamed `/tgd-ship` → `/tgd-release` (the `/^/tgd-(\w+)(.*)$/` regex generalises to it automatically).
- **Brand mark unification**: "π with tGD" rendered consistently across all three sites (browser tab, ChatWindow welcome, AppShell welcome, sidebar PiAgentTitle). "π" is 28px / 700, "with tGD" is 22px / 700, baseline-aligned via flex+gap. The text "Pi" is gone from the visible UI; the Greek letter is the mark now.
- **PiAgentTitle simplified**: removed the click-to-scramble animation and click-to-show-version. The component is now a static 19-line span (was 91 lines).
- **Typography consistency**: removed `var(--font-mono)` from non-code UI chrome (ChatWindow welcome header, CwdPicker paths / items / custom-path input). Added `PingFang TC` and `Microsoft JhengHei` to the font-family fallback chain so Traditional Chinese renders correctly on macOS / Windows.

### Verified
- TypeScript: `tsc --noEmit` — 0 errors
- ESLint: 0 errors (12 pre-existing unused-import warnings, unrelated)
- Server: `http://localhost:30141` HTTP 200
- API smoke: pin/rename/delete all idempotent (GET empty, POST new, POST existing → no-op, DELETE existing, DELETE missing → no-op, POST missing id → 400), `pins.json` written to disk

---

## [2026.06.28-2] — 621efa86

### Changed
- **Lazy-load math plugins**: `remark-math` + `rehype-katex` are no longer in the initial bundle. `MarkdownBody` scans the markdown source with a `containsMath()` heuristic and dynamically imports both plugins only when `$...$` or `$$...$$` is detected. Falls back to plain rendering if plugin load fails.
- `katex/dist/katex.min.css` remains globally imported via `app/layout.tsx` (CSS payload is small, and KaTeX styles must be available before math renders).
- Added `npm run analyze` script.

### Verified (before)
- TypeScript: `tsc --noEmit` — 0 errors
- ESLint: 0 errors (12 pre-existing warnings)
- Vitest: 34/34 pass
- `next build --webpack`: ✓ 7.7s compile, 9 static pages, 23 API routes

### Bundle impact (client)
- Before lazy fix: katex / rehype-katex = **601 KB** in client
- After lazy fix: katex / rehype-katex = **0 KB** in client (now loaded only on demand)
- The 587 KB katex chunk still appears in `nodejs.html` (server-side rendering of math is unaffected)

### Code health
- `MathPlugins` type alias local to `MarkdownBody.tsx` (`{ remarkMath, rehypeKatex }`).
- `PluggableList` imported from `unified` for accurate react-markdown plugin prop typing.
- New `containsMath()` helper is regex-based and conservative (matches `$$...$$` block + `$...$` inline, avoiding `\$` escapes).

---

## [2026.06.28] — 21d61571

### Changed
- **Refactor (Batch 1 + 2)**: moved 50+ component inline `style={{}}` blocks into CSS Modules. ~4500 LOC net change across `chat/`, `layout/`, `modals/`, `sidebar/`.
- Replaced favicon with custom `app/icon.svg` (dark space + blue-purple gradient).
- AppShell: `onMouseEnter/Leave` → CSS `:hover` / `group-hover` (5 batches).

### Notes
- Semantic CSS tokens are the single source of color truth. Components contain 0 hardcoded hex/rgba.
- Tests now cover `normalize`, `file-paths`, and `session-reader` (Vitest).

---

## [2026.06.27] — bc6df39b

### Added
- Vitest test suite (3 files, 34 cases).
- `release.sh` script for date-based versioning.
- CSS hover utilities (replacing JS hover handlers).
- Bundle analyzer integration (was already configured, now exercised).

### Changed
- `ModelsConfig.tsx` split from 1639 → 803 LOC into 7 files.
- `SkillsConfig.tsx` split + modal lazy loading.
- Component directory restructured (`chat/` / `sidebar/` / `modals/` / `layout/`).
- `AGENTS.md` written for codebase onboarding.

### Fixed
- Magic color cleanup (all `hex` literals replaced with CSS tokens).
- Touch target sizes standardized (mobile).
- Send button feedback (loading + disabled states).

### Security
- ToolCall field normalization hardened (`lib/normalize.ts`).
- Error boundary added to root layout.
