import { describe, expect, it } from "vitest";
import { GET } from "../../app/health/route";

describe("GET /health", () => {
  it("reports service health without exposing credentials", async () => {
    const response = await GET();
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", service: "dta-agent-platform" });
    expect(JSON.stringify(body)).not.toContain("API_KEY");
  });
});
