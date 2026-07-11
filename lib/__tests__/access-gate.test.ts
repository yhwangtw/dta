import { describe, it, expect, afterEach } from "vitest";
import { deriveToken, timingSafeEqual, cookieAuthorizes, gateEnabled, isPublicGatePath } from "../access-gate";

const ORIGINAL = process.env.PIWEB_ACCESS_PASSWORD;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PIWEB_ACCESS_PASSWORD;
  else process.env.PIWEB_ACCESS_PASSWORD = ORIGINAL;
});

describe("deriveToken", () => {
  it("is deterministic and 64 hex chars (SHA-256)", async () => {
    const a = await deriveToken("hunter2");
    const b = await deriveToken("hunter2");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different passwords", async () => {
    expect(await deriveToken("a")).not.toBe(await deriveToken("b"));
  });
});

describe("timingSafeEqual", () => {
  it("true only for identical strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("gate on/off via env", () => {
  it("gateEnabled reflects the env var", () => {
    delete process.env.PIWEB_ACCESS_PASSWORD;
    expect(gateEnabled()).toBe(false);
    process.env.PIWEB_ACCESS_PASSWORD = "secret";
    expect(gateEnabled()).toBe(true);
  });

  it("allows everything when the gate is off", async () => {
    delete process.env.PIWEB_ACCESS_PASSWORD;
    expect(await cookieAuthorizes(undefined)).toBe(true);
    expect(await cookieAuthorizes("anything")).toBe(true);
  });

  it("requires the correct token when the gate is on", async () => {
    process.env.PIWEB_ACCESS_PASSWORD = "secret";
    expect(await cookieAuthorizes(undefined)).toBe(false);
    expect(await cookieAuthorizes("wrong")).toBe(false);
    expect(await cookieAuthorizes(await deriveToken("secret"))).toBe(true);
    expect(await cookieAuthorizes(await deriveToken("secret2"))).toBe(false);
  });
});

describe("isPublicGatePath (auth-gate scope)", () => {
  it("lets the login flow and static PWA/tab assets through", () => {
    for (const p of ["/login", "/api/auth/gate", "/icon.svg", "/favicon.ico", "/apple-icon.png", "/manifest.webmanifest", "/icons/icon-192.png"]) {
      expect(isPublicGatePath(p)).toBe(true);
    }
  });

  it("gates every API route, including file paths that end in an asset extension", () => {
    // Regression: an extension-based skip once let /api/files/<x>.png bypass
    // the gate and leak allowed-root images to unauthenticated callers.
    for (const p of [
      "/api/sessions",
      "/api/files/home/u/proj/README.md",
      "/api/files/home/u/proj/secret.png",
      "/api/files/home/u/proj/design.svg",
      "/api/files/home/u/proj/font.woff2",
      "/",
    ]) {
      expect(isPublicGatePath(p)).toBe(false);
    }
  });
});
