import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAgentSessionMetadata } from "../agent-metadata-store";
import type { RequestPrincipal } from "../auth/request-auth";
import {
  accessibleSessionIds,
  assertAgentCommandAccess,
  assertSessionAccess,
} from "../auth/session-access";
import { userStatePath } from "../auth/user-state";

const originalDataDir = process.env.DTA_DATA_DIR;
const originalAuthMode = process.env.DTA_AUTH_MODE;
const originalCodingRoles = process.env.DTA_CODING_REQUIRED_ROLES;
let dataDir = "";

const principal = (id: string, roles: string[] = []): RequestPrincipal => ({
  id,
  roles,
  authType: "keycloak",
});

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "dta-authz-"));
  process.env.DTA_DATA_DIR = dataDir;
  process.env.DTA_AUTH_MODE = "keycloak";
  process.env.DTA_CODING_REQUIRED_ROLES = "dta-coding-access";
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DTA_DATA_DIR;
  else process.env.DTA_DATA_DIR = originalDataDir;
  if (originalAuthMode === undefined) delete process.env.DTA_AUTH_MODE;
  else process.env.DTA_AUTH_MODE = originalAuthMode;
  if (originalCodingRoles === undefined) delete process.env.DTA_CODING_REQUIRED_ROLES;
  else process.env.DTA_CODING_REQUIRED_ROLES = originalCodingRoles;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("multi-user session authorization", () => {
  it("allows User A to use their Meeting session and hides it from User B", () => {
    writeAgentSessionMetadata("meeting-a", {
      agentType: "meeting",
      agentId: "meeting-agent",
      displayName: "Meeting Agent",
      userId: "user-a",
      projectId: "project-a",
      runId: "run-a",
    });

    expect(assertSessionAccess(principal("user-a"), "meeting-a")?.runId).toBe("run-a");
    expect(() => assertSessionAccess(principal("user-b"), "meeting-a")).toThrowError(expect.objectContaining({ status: 404 }));
    expect(accessibleSessionIds(principal("user-b"))?.has("meeting-a")).toBe(false);
  });

  it("requires the configured Coding role even for an owned Coding session", () => {
    writeAgentSessionMetadata("coding-a", {
      agentType: "coding",
      agentId: "coding-agent",
      displayName: "Coding Agent",
      userId: "user-a",
    });

    expect(() => assertSessionAccess(principal("user-a"), "coding-a")).toThrowError(expect.objectContaining({ code: "CODING_ACCESS_REQUIRED" }));
    expect(assertSessionAccess(principal("user-a", ["dta-coding-access"]), "coding-a")?.userId).toBe("user-a");
  });

  it("blocks filesystem-enabling commands in Meeting and PM sessions", () => {
    const metadata = { agentType: "meeting" as const, agentId: "meeting-agent", displayName: "Meeting Agent", userId: "user-a" };
    expect(() => assertAgentCommandAccess(metadata, "bash")).toThrowError(expect.objectContaining({ code: "DOMAIN_COMMAND_DISABLED" }));
    expect(() => assertAgentCommandAccess(metadata, "set_tools")).toThrowError(expect.objectContaining({ code: "DOMAIN_COMMAND_DISABLED" }));
    expect(() => assertAgentCommandAccess(metadata, "prompt")).not.toThrow();
  });

  it("stores prompt, tag, pin, and archive state in separate user directories", () => {
    const legacy = join(dataDir, "legacy.json");
    const a = userStatePath(principal("user-a"), legacy, "prompts.json");
    const b = userStatePath(principal("user-b"), legacy, "prompts.json");
    expect(a).not.toBe(b);
    expect(a).toContain(join(dataDir, "users"));
    expect(a).not.toContain("user-a");
  });
});

describe("authorization coverage for legacy Pi Web surfaces", () => {
  it("keeps every protected Session, Agent, File, Git, Schedule, Prompt, and Attention route behind a policy helper", () => {
    const roots = ["sessions", "agent", "files", "git", "schedules", "prompts", "attention"];
    const protectedRoutes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts") protectedRoutes.push(path);
      }
    };
    for (const root of roots) walk(resolve(process.cwd(), "app", "api", root));

    expect(protectedRoutes.length).toBeGreaterThan(30);
    for (const path of protectedRoutes) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toMatch(/authenticateRequest|authorizeSessionRequest|enforceCodingRequest/);
    }
  });
});
