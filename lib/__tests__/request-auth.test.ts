import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRateLimit, authenticateRequest, authenticationErrorResponse } from "../auth/request-auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function token(input: { issuer: string; audience: string; subject?: string; roles?: string[] }) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: input.issuer,
    aud: input.audience,
    sub: input.subject ?? "keycloak-user-1",
    exp: Math.floor(Date.now() / 1_000) + 300,
    preferred_username: "reviewer",
    realm_access: { roles: input.roles ?? ["dta-user"] },
  })).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return {
    value: `${signingInput}.${signature}`,
    jwk: { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" },
  };
}

describe("Keycloak request authentication", () => {
  it("verifies issuer, audience, expiry, signature, and required roles", async () => {
    const issuer = `https://keycloak.example/realms/${randomUUID()}`;
    const signed = token({ issuer, audience: "dta", roles: ["dta-user", "dta-reviewer"] });
    process.env.DTA_AUTH_MODE = "keycloak";
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_AUDIENCE = "dta";
    process.env.KEYCLOAK_JWKS_URL = `${issuer}/protocol/openid-connect/certs`;
    process.env.KEYCLOAK_REQUIRED_ROLES = "dta-user";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ keys: [signed.jwk] }), { status: 200 }));

    const principal = await authenticateRequest(new Request("http://localhost/api/agents", {
      headers: { Authorization: `Bearer ${signed.value}` },
    }));

    expect(principal).toMatchObject({ id: "keycloak-user-1", username: "reviewer", authType: "keycloak" });
    expect(principal.roles).toContain("dta-reviewer");
  });

  it("rejects a token issued for another audience", async () => {
    const issuer = `https://keycloak.example/realms/${randomUUID()}`;
    const signed = token({ issuer, audience: "another-service" });
    process.env.DTA_AUTH_MODE = "keycloak";
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_AUDIENCE = "dta";
    process.env.KEYCLOAK_JWKS_URL = `${issuer}/protocol/openid-connect/certs`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ keys: [signed.jwk] }), { status: 200 }));

    await expect(authenticateRequest(new Request("http://localhost/api", {
      headers: { Authorization: `Bearer ${signed.value}` },
    }))).rejects.toThrow("audience");
  });
});

describe("request rate limiting", () => {
  it("returns a retry boundary when a configured principal quota is exceeded", () => {
    process.env.DTA_RATE_LIMIT_ENABLED = "true";
    process.env.DTA_RATE_LIMIT_REQUESTS = "1";
    process.env.DTA_RATE_LIMIT_WINDOW_SECONDS = "60";
    const principal = { id: randomUUID(), roles: [], authType: "keycloak" as const };
    assertRateLimit(principal, "agent");
    try {
      assertRateLimit(principal, "agent");
      throw new Error("expected rate limit");
    } catch (error) {
      const response = authenticationErrorResponse(error);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
    }
  });
});
