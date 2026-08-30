import { webcrypto } from "node:crypto";
import { loadDtaConfig, type DtaConfig } from "@/lib/config/env";

export interface RequestPrincipal {
  id: string;
  username?: string;
  email?: string;
  roles: string[];
  authType: "local" | "keycloak";
  claims?: Record<string, unknown>;
}

export class AuthenticationError extends Error {
  constructor(message: string, readonly status = 401, readonly code = "UNAUTHORIZED") {
    super(message);
  }
}

export class RateLimitError extends AuthenticationError {
  constructor(readonly retryAfterSeconds: number) {
    super("DTA request rate limit exceeded", 429, "RATE_LIMITED");
  }
}

interface RateLimitBucket {
  startedAt: number;
  count: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

interface CachedJwks {
  url: string;
  expiresAt: number;
  keys: KeycloakJwk[];
}

type KeycloakJwk = JsonWebKey & { kid?: string; kty?: string };

let cachedJwks: CachedJwks | null = null;

function decodeSegment(segment: string): Uint8Array {
  return Buffer.from(segment, "base64url");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeJson(segment: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(decodeSegment(segment)).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AuthenticationError("Bearer token is malformed");
  }
}

function tokenFromRequest(request: Request, config: DtaConfig): string {
  let header = config.authTokenHeader;
  let raw = request.headers.get(header)?.trim();
  // Browser EventSource commonly relies on an authenticated proxy injecting a
  // dedicated header. Internal service clients such as Prometheus still use
  // the standard Authorization header, so accept it only as a verified JWT
  // fallback when the configured proxy header is absent.
  if (!raw && header !== "authorization") {
    header = "authorization";
    raw = request.headers.get(header)?.trim();
  }
  if (!raw) throw new AuthenticationError("Bearer token is required");
  if (header === "authorization") {
    const match = /^Bearer\s+(.+)$/i.exec(raw);
    if (!match) throw new AuthenticationError("Authorization must use the Bearer scheme");
    return match[1].trim();
  }
  return raw.replace(/^Bearer\s+/i, "").trim();
}

async function resolveJwksUrl(config: DtaConfig): Promise<string> {
  if (config.keycloakJwksUrl) return config.keycloakJwksUrl;
  if (!config.keycloakIssuer) throw new AuthenticationError("Keycloak issuer is not configured", 503, "AUTH_NOT_CONFIGURED");
  const response = await fetch(`${config.keycloakIssuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new AuthenticationError("Unable to load Keycloak discovery metadata", 503, "AUTH_PROVIDER_UNAVAILABLE");
  const metadata = await response.json() as { issuer?: unknown; jwks_uri?: unknown };
  if (metadata.issuer !== config.keycloakIssuer || typeof metadata.jwks_uri !== "string") {
    throw new AuthenticationError("Keycloak discovery metadata is invalid", 503, "AUTH_PROVIDER_INVALID");
  }
  return metadata.jwks_uri;
}

async function loadJwks(config: DtaConfig): Promise<CachedJwks> {
  const url = await resolveJwksUrl(config);
  if (cachedJwks?.url === url && cachedJwks.expiresAt > Date.now()) return cachedJwks;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new AuthenticationError("Unable to load Keycloak signing keys", 503, "AUTH_PROVIDER_UNAVAILABLE");
  const body = await response.json() as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new AuthenticationError("Keycloak signing keys are invalid", 503, "AUTH_PROVIDER_INVALID");
  cachedJwks = { url, keys: body.keys as KeycloakJwk[], expiresAt: Date.now() + 5 * 60_000 };
  return cachedJwks;
}

function audienceMatches(claim: unknown, audience: string): boolean {
  return claim === audience || (Array.isArray(claim) && claim.includes(audience));
}

function claimRoles(claims: Record<string, unknown>, audience: string): string[] {
  const roles = new Set<string>();
  const realmAccess = claims.realm_access;
  if (realmAccess && typeof realmAccess === "object" && Array.isArray((realmAccess as { roles?: unknown }).roles)) {
    for (const role of (realmAccess as { roles: unknown[] }).roles) if (typeof role === "string") roles.add(role);
  }
  const resourceAccess = claims.resource_access;
  if (resourceAccess && typeof resourceAccess === "object") {
    const client = (resourceAccess as Record<string, unknown>)[audience];
    if (client && typeof client === "object" && Array.isArray((client as { roles?: unknown }).roles)) {
      for (const role of (client as { roles: unknown[] }).roles) if (typeof role === "string") roles.add(role);
    }
  }
  return [...roles];
}

async function verifyKeycloakToken(token: string, config: DtaConfig): Promise<RequestPrincipal> {
  if (!config.keycloakIssuer || !config.keycloakAudience) {
    throw new AuthenticationError("Keycloak authentication is not fully configured", 503, "AUTH_NOT_CONFIGURED");
  }
  const segments = token.split(".");
  if (segments.length !== 3) throw new AuthenticationError("Bearer token is malformed");
  const [encodedHeader, encodedPayload] = segments;
  const header = decodeJson(encodedHeader);
  const claims = decodeJson(encodedPayload);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new AuthenticationError("Bearer token uses an unsupported signing algorithm");
  }
  const jwks = await loadJwks(config);
  const jwk = jwks.keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) {
    cachedJwks = null;
    const refreshed = await loadJwks(config);
    const refreshedKey = refreshed.keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
    if (!refreshedKey) throw new AuthenticationError("Bearer token signing key is unknown");
    return verifyWithJwk(refreshedKey, token, claims, config);
  }
  return verifyWithJwk(jwk, token, claims, config);
}

async function verifyWithJwk(
  jwk: KeycloakJwk,
  token: string,
  claims: Record<string, unknown>,
  config: DtaConfig,
): Promise<RequestPrincipal> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  const key = await webcrypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await webcrypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    arrayBuffer(decodeSegment(encodedSignature)),
    arrayBuffer(new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)),
  );
  if (!valid) throw new AuthenticationError("Bearer token signature is invalid");
  const now = Math.floor(Date.now() / 1_000);
  if (claims.iss !== config.keycloakIssuer) throw new AuthenticationError("Bearer token issuer is invalid");
  if (!audienceMatches(claims.aud, config.keycloakAudience!)) throw new AuthenticationError("Bearer token audience is invalid");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new AuthenticationError("Bearer token has expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) throw new AuthenticationError("Bearer token is not active yet");
  if (typeof claims.sub !== "string" || !claims.sub) throw new AuthenticationError("Bearer token subject is missing");
  const roles = claimRoles(claims, config.keycloakAudience!);
  const missingRoles = config.keycloakRequiredRoles.filter((role) => !roles.includes(role));
  if (missingRoles.length > 0) {
    throw new AuthenticationError("Bearer token lacks a required DTA role", 403, "FORBIDDEN");
  }
  return {
    id: claims.sub,
    ...(typeof claims.preferred_username === "string" ? { username: claims.preferred_username } : {}),
    ...(typeof claims.email === "string" ? { email: claims.email } : {}),
    roles,
    authType: "keycloak",
    claims,
  };
}

export async function authenticateRequest(request: Request, config = loadDtaConfig()): Promise<RequestPrincipal> {
  if (config.authMode === "none") return { id: "local-user", username: "Local user", roles: ["dta-admin"], authType: "local" };
  return verifyKeycloakToken(tokenFromRequest(request, config), config);
}

export function resolveActingUserId(principal: RequestPrincipal, requestedUserId?: string): string {
  if (!requestedUserId || requestedUserId === principal.id) return requestedUserId ?? principal.id;
  if (principal.authType === "local" || principal.roles.includes("dta-act-as-user")) return requestedUserId;
  throw new AuthenticationError("Token cannot submit work for another user", 403, "FORBIDDEN");
}

export function assertRunAccess(principal: RequestPrincipal, runUserId?: string): void {
  if (
    principal.authType === "local"
    || runUserId === principal.id
    || principal.roles.includes("dta-run-read-all")
    || principal.roles.includes("dta-admin")
  ) return;
  throw new AuthenticationError("Agent run not found", 404, "RUN_NOT_FOUND");
}

export function assertReviewAccess(principal: RequestPrincipal, config = loadDtaConfig()): void {
  if (principal.authType === "local" || config.reviewRequiredRoles.length === 0) return;
  if (config.reviewRequiredRoles.some((role) => principal.roles.includes(role))) return;
  throw new AuthenticationError("Token lacks a DTA review role", 403, "FORBIDDEN");
}

export function canAccessAgent(principal: RequestPrincipal, allowedRoles?: string[]): boolean {
  return principal.authType === "local"
    || principal.roles.includes("dta-admin")
    || !allowedRoles?.length
    || allowedRoles.some((role) => principal.roles.includes(role));
}

export function assertAgentAccess(principal: RequestPrincipal, allowedRoles?: string[]): void {
  if (canAccessAgent(principal, allowedRoles)) return;
  throw new AuthenticationError("Token lacks access to this Department Agent", 403, "AGENT_ACCESS_REQUIRED");
}

export function assertAuditAccess(principal: RequestPrincipal): void {
  if (principal.authType === "local" || principal.roles.includes("dta-audit-read") || principal.roles.includes("dta-admin")) return;
  throw new AuthenticationError("Token lacks a DTA audit role", 403, "FORBIDDEN");
}

export function assertAdminAccess(principal: RequestPrincipal): void {
  if (principal.authType === "local" || principal.roles.includes("dta-admin")) return;
  throw new AuthenticationError("Token lacks a DTA administrator role", 403, "FORBIDDEN");
}

export function assertCodingAccess(principal: RequestPrincipal, config = loadDtaConfig()): void {
  if (principal.authType === "local" || principal.roles.includes("dta-admin")) return;
  if (config.codingRequiredRoles.some((role) => principal.roles.includes(role))) return;
  throw new AuthenticationError("Token lacks access to Coding and repository tools", 403, "CODING_ACCESS_REQUIRED");
}

export function assertRateLimit(principal: RequestPrincipal, category: "agent" | "upload"): void {
  const config = loadDtaConfig();
  if (!config.rateLimitEnabled) return;
  const now = Date.now();
  const windowMs = config.rateLimitWindowSeconds * 1_000;
  const key = `${category}:${principal.id}`;
  const current = rateLimitBuckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateLimitBuckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= config.rateLimitRequests) {
    throw new RateLimitError(Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1_000)));
  }
  current.count++;
  if (rateLimitBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of rateLimitBuckets) {
      if (now - bucket.startedAt >= windowMs) rateLimitBuckets.delete(bucketKey);
    }
  }
}

export function authenticationErrorResponse(error: unknown): Response {
  const authError = error instanceof AuthenticationError ? error : new AuthenticationError("Authentication failed");
  return Response.json({ error: { code: authError.code, message: authError.message } }, {
    status: authError.status,
    headers: authError.status === 401
      ? { "WWW-Authenticate": "Bearer" }
      : authError instanceof RateLimitError
        ? { "Retry-After": String(authError.retryAfterSeconds) }
        : undefined,
  });
}
