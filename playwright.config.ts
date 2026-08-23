import { defineConfig } from "@playwright/test";
import path from "path";
import os from "os";

// One deterministic fixture root shared by global-setup, the web server, and
// the specs (via env). Regenerated on every run.
const E2E_ROOT = process.env.E2E_ROOT ?? path.join(os.tmpdir(), "pi-web-e2e");
process.env.E2E_ROOT = E2E_ROOT;
process.env.E2E_PROJECT_CWD = path.join(E2E_ROOT, "demo-project");

// The suite builds and boots a production server on a dedicated port with
// PI_CODING_AGENT_DIR pointing at generated fixtures. NOTE: `next build`
// corrupts a concurrently running dev server's .next — stop `npm run dev`
// before running the E2E suite locally.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // specs share one server + one session store
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    // Keep the test client on the same IPv4 address Playwright probes for the
    // webServer. macOS may resolve localhost to ::1 while Next listens on
    // 0.0.0.0, producing intermittent connection-refused failures.
    baseURL: "http://127.0.0.1:30177",
    // Local containers with preinstalled browsers can point this at the
    // binary (e.g. /opt/pw-browsers/chromium); CI uses the managed download.
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: "npm run build && npx next start -p 30177",
    port: 30177,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      PI_CODING_AGENT_DIR: path.join(E2E_ROOT, "agent"),
      DTA_DATA_DIR: path.join(E2E_ROOT, "dta-data"),
      DTA_AGENT_WORKSPACE: path.join(E2E_ROOT, "dta-workspace"),
      DTA_AUTH_MODE: "none",
      DTA_ARTIFACT_STORE: "local",
      DTA_WORKFLOW_PROVIDER: "mock",
      DTA_ENABLE_WORKFLOW_TOOLS: "false",
      DTA_ENABLED_AGENTS: "meeting-agent,pm-agent,knowledge-agent",
      DTA_AGENT_MANIFEST_PATH: path.join(process.cwd(), "config", "agents.example.json"),
      AGENT_DEFAULT_TYPE: "meeting",
      DTA_MEETING_REVIEW_REQUIRED: "true",
      DTA_TRANSCRIPTION_PROVIDER: "none",
      DTA_VISION_PROVIDER: "none",
      DTA_MEDIA_PROCESSOR: "none",
      DTA_UPLOAD_SCANNER: "none",
      DTA_RATE_LIMIT_ENABLED: "false",
    },
  },
});
