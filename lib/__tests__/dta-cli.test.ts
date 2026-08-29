import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type CliModule = typeof import("../../scripts/dta-core.mjs");

let cli: CliModule;

beforeAll(async () => {
  cli = await import(new URL("../../scripts/dta-core.mjs", import.meta.url).href) as CliModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DTA multi-entry CLI", () => {
  it("keeps the original meeting/pm shorthand while exposing explicit commands", () => {
    expect(cli.parseCommandLine(["meeting", "--task", "Generate minutes"])).toMatchObject({
      command: "run",
      positionals: ["meeting"],
      options: { task: "Generate minutes" },
    });
    expect(cli.parseCommandLine(["chat", "pm"])).toMatchObject({ command: "tui", positionals: ["pm"] });
    expect(cli.parseCommandLine(["coding", "--help"])).toMatchObject({ command: "pi", passthrough: ["--help"] });
    expect(cli.parseCommandLine(["help", "review"])).toMatchObject({ command: "help", topic: "review" });
    expect(cli.parseCommandLine(["pilot-check", "--live", "--workflow", "meeting-pilot-readiness"]))
      .toMatchObject({ command: "pilot-check", options: { live: true, workflow: "meeting-pilot-readiness" } });
  });

  it("parses fragmented normalized SSE events", () => {
    const decoder = new cli.SseDecoder();
    expect(decoder.push("id: 1\nevent: run_started\nda")).toEqual([]);
    expect(decoder.push("ta: {\"type\":\"run_started\",\"runId\":\"run-1\"}\n\n")).toEqual([{
      id: "1",
      event: "run_started",
      data: { type: "run_started", runId: "run-1" },
    }]);
    expect(decoder.push(": keep-alive\n\n")).toEqual([]);
  });

  it("calls the framework-neutral Agent contract with bearer authentication", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      requestId: "request-1",
      runId: "run-1",
      agentId: "meeting-agent",
      status: "running",
    }), { status: 202, headers: { "Content-Type": "application/json" } }));
    const client = new cli.DtaClient({
      baseUrl: "https://dta.example.test/",
      token: "keycloak-token",
      fetchImpl,
    });

    await client.run("meeting", { requestId: "request-1", task: "Generate minutes" });

    expect(fetchImpl).toHaveBeenCalledWith("https://dta.example.test/api/agents/meeting/run", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer keycloak-token", "Content-Type": "application/json" }),
    }));
  });

  it("keeps batch stdout machine-readable and returns immediately with --no-wait", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      requestId: "request-1",
      runId: "run-1",
      agentId: "meeting-agent",
      status: "running",
    }), { status: 202, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchImpl);
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    const io = {
      stdin: { isTTY: false },
      stdout: { isTTY: false, write: (value: string) => { stdout += value; return true; } },
      stderr: { isTTY: false, write: (value: string) => { stderr += value; return true; } },
      setExitCode: (value: number) => { exitCode = value; },
    } as unknown as ReturnType<CliModule["defaultIo"]>;

    await cli.runCli([
      "run", "meeting", "--task", "Generate minutes", "--request-id", "request-1", "--no-wait",
      "--base-url", "https://dta.example.test",
    ], io);

    expect(JSON.parse(stdout)).toMatchObject({ runId: "run-1", status: "running" });
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("renders Meeting results without Pi runtime details", () => {
    const output = cli.formatAgentResponse({
      requestId: "request-1",
      runId: "run-1",
      agentId: "meeting-agent",
      status: "completed",
      review: { status: "needs_review", revision: 1 },
      result: {
        title: "Weekly sync",
        summary: "The pilot was approved.",
        decisions: [{ text: "Launch the pilot", owner: "PM" }],
        actionItems: [{ title: "Prepare rollout", owner: "Ops" }],
        requirements: [{ title: "Audit trail", description: "Record approvals." }],
      },
    });

    expect(output).not.toContain("Waiting");
    expect(output).toContain("Review: needs_review");
    expect(output).toContain("Launch the pilot · PM");
    expect(output).not.toContain("SessionManager");
  });
});
