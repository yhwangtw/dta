import { describe, expect, it } from "vitest";
import { a2aAuthenticationError, a2aProblem, validateA2AVersion } from "../a2a/a2a-http";
import { AuthenticationError, RateLimitError } from "../auth/request-auth";

describe("A2A v1 HTTP binding", () => {
  it("treats a missing version as legacy 0.3 and rejects it", async () => {
    const response = validateA2AVersion(new Request("https://dta.example.com/a2a/v1/tasks"));
    expect(response?.status).toBe(400);
    expect(response?.headers.get("content-type")).toContain("application/a2a+json");
    expect(await response?.json()).toMatchObject({
      error: {
        code: 400,
        status: "FAILED_PRECONDITION",
        details: [{ reason: "VERSION_NOT_SUPPORTED", domain: "a2a-protocol.org" }],
      },
    });
  });

  it("accepts version 1.0 from either the header or query parameter", () => {
    expect(validateA2AVersion(new Request("https://dta.example.com/a2a/v1/tasks", {
      headers: { "A2A-Version": "1.0" },
    }))).toBeNull();
    expect(validateA2AVersion(new Request("https://dta.example.com/a2a/v1/tasks?A2A-Version=1.0"))).toBeNull();
  });

  it("uses the google.rpc.Status JSON envelope for HTTP errors", async () => {
    const response = a2aProblem(404, "Task Not Found", "Task not found", "task-not-found", {
      metadata: { taskId: "task-1" },
    });
    expect(await response.json()).toEqual({
      error: {
        code: 404,
        status: "NOT_FOUND",
        message: "Task not found",
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "TASK_NOT_FOUND",
          domain: "a2a-protocol.org",
          metadata: { taskId: "task-1" },
        }],
      },
    });
  });

  it("preserves rate-limit transport headers in an A2A error", () => {
    const response = a2aAuthenticationError(new RateLimitError(17));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("a2a-version")).toBe("1.0");
  });

  it("hides inaccessible runs behind the standard TaskNotFound error", async () => {
    const response = a2aAuthenticationError(new AuthenticationError("Task not found", 404, "RUN_NOT_FOUND"));
    expect(await response.json()).toMatchObject({ error: { details: [{ reason: "TASK_NOT_FOUND" }] } });
  });
});
