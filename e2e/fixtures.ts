import { mkdirSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

/**
 * Generates the E2E world under `root`:
 *
 *   <root>/demo-project        git repo with one committed + one modified +
 *                              two untracked files (drives git badges / diff)
 *   <root>/agent/sessions/...  pi session fixtures whose cwd points at the
 *                              demo project (drives every chat/nav spec)
 *
 * The server under test runs with PI_CODING_AGENT_DIR=<root>/agent, so these
 * are the only sessions it sees. Regenerated from scratch on every run —
 * specs may freely mutate session files.
 */
export function createFixtures(root: string): { cwd: string } {
  rmSync(root, { recursive: true, force: true });
  const cwd = path.join(root, "demo-project");
  mkdirSync(path.join(cwd, "src"), { recursive: true });

  // ── Demo git project ──────────────────────────────────────────────────
  writeFileSync(path.join(cwd, "README.md"), "# Demo project\n\nE2E fixture.\n");
  writeFileSync(path.join(cwd, "src/index.ts"), "export const answer = 42;\n");
  const git = (args: string) =>
    execSync(`git -c user.email=e2e@test -c user.name=e2e ${args}`, { cwd, stdio: "pipe" });
  git("init -q");
  git("add -A");
  git('commit -qm "initial"');
  // Working-tree state: one modified, two untracked
  writeFileSync(path.join(cwd, "src/index.ts"), "export const answer = 43; // modified\n");
  writeFileSync(path.join(cwd, "from-bash.txt"), "bash-made\n");
  writeFileSync(path.join(cwd, "newfile.txt"), "hello\n");
  // Large file (>1500 lines) — drives the viewer's plain-mode fallback
  const bigLines = ["// big generated file"];
  for (let i = 0; i < 2000; i++) {
    bigLines.push(`export const item${i} = { id: ${i}, value: ${(i * 7) % 997} };`);
  }
  writeFileSync(path.join(cwd, "big-file.ts"), bigLines.join("\n") + "\n");

  // ── Session fixtures ──────────────────────────────────────────────────
  const sessionsDir = path.join(root, "agent", "sessions", "-demo");
  mkdirSync(sessionsDir, { recursive: true });

  const filler = "內容填充讓訊息變長,測試捲動行為。".repeat(6);
  const longText = Array.from({ length: 8 }, (_, i) =>
    `### 重構步驟 ${i + 1}\n\n這是第 ${i + 1} 段詳細說明。${filler}`,
  ).join("\n\n");

  const mainLines = [
    { type: "session", version: 3, id: "aaaa1111-2222-3333-4444-555566667777", timestamp: "2026-07-01T10:00:00.000Z", cwd },
    { type: "model_change", id: "a1b2c3d4", parentId: null, provider: "anthropic", modelId: "claude-sonnet-5", timestamp: "2026-07-01T10:00:01.000Z" },
    { type: "message", id: "m1000001", parentId: "a1b2c3d4", timestamp: "2026-07-01T10:00:05.000Z", message: { role: "user", content: "幫我看一下這個專案的架構,並解釋主要模組之間的關係", timestamp: 1751364005000 } },
    { type: "message", id: "m1000002", parentId: "m1000001", timestamp: "2026-07-01T10:00:30.000Z", message: { role: "assistant", content: [{ type: "text", text: "好的,這個專案是一個典型的三層架構:\n\n## 架構總覽\n\n```\nAPI Layer → Service Layer → Data Layer\n```\n\n主要模組:`api/`、`services/`、`repositories/`。" }], usage: { input: 1200, output: 350, cacheRead: 0, cacheWrite: 0, cost: { total: 0.012 } }, timestamp: 1751364030000 } },
    { type: "session_info", id: "si000001", parentId: "m1000002", name: "專案架構分析" },
    { type: "message", id: "m1000003", parentId: "si000001", timestamp: "2026-07-01T10:05:00.000Z", message: { role: "user", content: "services 層有沒有需要重構的地方?", timestamp: 1751364300000 } },
    { type: "message", id: "m1000004", parentId: "m1000003", timestamp: "2026-07-01T10:05:40.000Z", message: { role: "assistant", content: [{ type: "text", text: "有三個值得重構的點:God class、循環依賴、重複邏輯。" }], usage: { input: 1800, output: 220, cacheRead: 800, cacheWrite: 0, cost: { total: 0.009 } }, timestamp: 1751364340000 } },
    { type: "message", id: "m1000005", parentId: "m1000004", timestamp: "2026-07-01T10:10:00.000Z", message: { role: "user", content: "給我詳細的重構步驟", timestamp: 1751364600000 } },
    { type: "message", id: "m1000006", parentId: "m1000005", timestamp: "2026-07-01T10:11:00.000Z", message: { role: "assistant", content: [{ type: "text", text: longText }], usage: { input: 2500, output: 900, cacheRead: 1200, cacheWrite: 0, cost: { total: 0.02 } }, timestamp: 1751364660000 } },
    { type: "message", id: "m1000007", parentId: "m1000006", timestamp: "2026-07-01T10:15:00.000Z", message: { role: "user", content: "好,先從 God class 開始", timestamp: 1751364900000 } },
    { type: "message", id: "m1000008", parentId: "m1000007", timestamp: "2026-07-01T10:16:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "沒問題,我們從 `UserService` 開始拆分。第一步先把驗證邏輯抽到 `AuthService`。" }], usage: { input: 3000, output: 120, cacheRead: 2000, cacheWrite: 0, cost: { total: 0.01 } }, timestamp: 1751364960000 } },
  ];
  writeFileSync(
    path.join(sessionsDir, "2026-07-01T10-00-00_aaaa1111-2222-3333-4444-555566667777.jsonl"),
    mainLines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );

  const errorLines = [
    { type: "session", version: 3, id: "eeee1111-2222-3333-4444-555566667777", timestamp: "2026-07-04T10:00:00.000Z", cwd },
    { type: "model_change", id: "aa000001", parentId: null, provider: "anthropic", modelId: "claude-opus-4-6", timestamp: "2026-07-04T10:00:00.000Z" },
    { type: "message", id: "aa000002", parentId: "aa000001", timestamp: "2026-07-04T10:00:05.000Z", message: { role: "user", content: "幫我解釋這個專案的 rate limiter", timestamp: 1751623200000 } },
    { type: "message", id: "aa000003", parentId: "aa000002", timestamp: "2026-07-04T10:00:10.000Z", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "429 rate_limit_error: This request would exceed your account's rate limit", usage: { input: 0, output: 0 }, timestamp: 1751623210000 } },
    { type: "session_info", id: "aa000004", parentId: "aa000003", name: "失敗的執行" },
  ];
  writeFileSync(
    path.join(sessionsDir, "2026-07-04T10-00-00_eeee1111-2222-3333-4444-555566667777.jsonl"),
    errorLines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );

  return { cwd };
}
