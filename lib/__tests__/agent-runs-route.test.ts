import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  allowed: false,
  enqueue: vi.fn(),
  maxConcurrency: 3,
  setMaxConcurrency: vi.fn(),
}));

vi.mock("@/lib/agent-run-supervisor", () => ({
  ensureAgentRunSupervisor: vi.fn(() => ({
    get maxConcurrency() {
      return harness.maxConcurrency;
    },
    enqueue: harness.enqueue,
    setMaxConcurrency: harness.setMaxConcurrency,
  })),
}));

vi.mock("@/lib/agent-run-store", () => ({
  readAgentRunStore: vi.fn(() => ({ version: 1, runs: [] })),
}));

vi.mock("@/lib/agent-run-workspace", () => ({
  isTrustedAgentRunWorkspace: vi.fn(async () => harness.allowed),
  inspectAgentRunWorkspace: vi.fn(async (cwd: string) => ({
    repoRoot: cwd,
    branch: "main",
    isMain: true,
  })),
}));

import { PATCH, POST } from "../../app/api/agent-runs/route";

const dirs: string[] = [];

function cwd(): string {
  const value = mkdtempSync(join(tmpdir(), "pi-agent-route-cwd-"));
  dirs.push(value);
  return value;
}

function request(
  body: Record<string, unknown>,
  contentType = "application/json",
  method = "POST",
): Request {
  return new Request("http://localhost/api/agent-runs", {
    method,
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  harness.allowed = false;
  harness.maxConcurrency = 3;
  harness.enqueue.mockReset();
  harness.setMaxConcurrency.mockReset();
  harness.setMaxConcurrency.mockImplementation((value: number) => {
    harness.maxConcurrency = value;
    return value;
  });
  harness.enqueue.mockImplementation((input) => ({
    ...input,
    id: "run-1",
    trigger: "manual",
    status: "queued",
    createdAt: "2026-07-26T03:00:00.000Z",
  }));
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("POST /api/agent-runs", () => {
  it("AC-3.4: rejects state-changing requests without a JSON content type", async () => {
    const response = await POST(request({}, "text/plain"));
    expect(response.status).toBe(415);
    expect(harness.enqueue).not.toHaveBeenCalled();
  });

  it("AC-3.5: refuses to expand background execution into an untrusted workspace", async () => {
    const response = await POST(request({
      name: "Review",
      cwd: cwd(),
      prompt: "Inspect the project",
    }));

    expect(response.status).toBe(403);
    expect(harness.enqueue).not.toHaveBeenCalled();
  });

  it("AC-3.6: enqueues an explicitly trusted workspace with read-only defaults", async () => {
    harness.allowed = true;
    const trustedCwd = cwd();

    const response = await POST(request({
      name: "Review",
      cwd: trustedCwd,
      prompt: "Inspect the project",
    }));
    const body = await response.json() as { run: { toolNames: string[]; workspace: { branch: string } } };

    expect(response.status).toBe(202);
    expect(body.run.toolNames).toEqual(["read", "grep", "find", "ls", "ask_user"]);
    expect(body.run.workspace.branch).toBe("main");
    expect(harness.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/agent-runs", () => {
  it("AC-3.9: persists an explicit concurrency limit and returns the applied value", async () => {
    const response = await PATCH(request({ maxConcurrency: 6 }, "application/json", "PATCH"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ maxConcurrency: 6 });
    expect(harness.setMaxConcurrency).toHaveBeenCalledWith(6);
  });

  it("AC-3.10: rejects non-JSON, fractional, and out-of-range concurrency settings", async () => {
    const nonJson = await PATCH(request({ maxConcurrency: 4 }, "text/plain", "PATCH"));
    expect(nonJson.status).toBe(415);

    for (const maxConcurrency of [0, 9, 2.5, "4"]) {
      const response = await PATCH(request({ maxConcurrency }, "application/json", "PATCH"));
      expect(response.status).toBe(400);
    }
    expect(harness.setMaxConcurrency).not.toHaveBeenCalled();
  });
});
