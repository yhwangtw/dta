// ============================================================================
// App-level access gate.
//
// pi-web has no user accounts — it's a single-user (or trusted-small-team)
// self-hosted coding agent that can run bash and touch the filesystem. This
// adds ONE optional shared password so the app can be safely exposed beyond
// localhost (Tailscale, a tunnel, the LAN). It is a front-door lock, not an
// identity system.
//
// Opt-in: with no PIWEB_ACCESS_PASSWORD set, the gate is disabled and the app
// behaves exactly as before (local-only use stays frictionless).
//
// Runs in BOTH the Node runtime (login route) and the Edge runtime
// (middleware), so all crypto here uses Web Crypto (globalThis.crypto.subtle),
// which exists in both.
// ============================================================================

export const AUTH_COOKIE = "piweb_gate";

/** Is the gate switched on? (i.e. a password is configured) */
export function gateEnabled(): boolean {
  return !!process.env.PIWEB_ACCESS_PASSWORD;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The cookie value that proves the holder knew the password: a SHA-256 of the
 * password plus a fixed domain-separation label. Deterministic, so middleware
 * can recompute the expected value and compare without any shared session
 * store. Stealing the cookie is equivalent to knowing the password — which is
 * the same trust level as any long-lived session cookie, and acceptable here.
 */
export async function deriveToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`piweb-access-gate:v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
}

/** Constant-time string compare (avoids leaking length/prefix via timing). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The token expected for the currently-configured password (null if off). */
export async function expectedToken(): Promise<string | null> {
  const pw = process.env.PIWEB_ACCESS_PASSWORD;
  return pw ? deriveToken(pw) : null;
}

/** Does this cookie value grant access under the current password? */
export async function cookieAuthorizes(cookieValue: string | undefined): Promise<boolean> {
  if (!gateEnabled()) return true; // gate off → everything is allowed
  if (!cookieValue) return false;
  const expected = await expectedToken();
  return expected !== null && timingSafeEqual(cookieValue, expected);
}
