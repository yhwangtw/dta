import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDtaConfig } from "../config/env";
import { scanUpload, UploadRejectedError, UploadScanError } from "../integrations/security/upload-scanner";

afterEach(() => vi.restoreAllMocks());

function config(overrides: Record<string, string | undefined> = {}) {
  return loadDtaConfig({
    ...overrides,
    NODE_ENV: "test",
    DTA_UPLOAD_SCANNER: "http",
    DTA_UPLOAD_SCANNER_URL: "https://scanner.example/scan",
  } as NodeJS.ProcessEnv);
}

const input = { name: "meeting.txt", mimeType: "text/plain", data: new TextEncoder().encode("safe") };

describe("HTTP upload scanner", () => {
  it("accepts only an explicit clean result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "clean" }));
    await expect(scanUpload(input, config())).resolves.toEqual({ status: "clean", scanner: "http" });
  });

  it("rejects infected content without returning scanner details to storage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "infected", threat: "test-signature" }));
    await expect(scanUpload(input, config())).rejects.toBeInstanceOf(UploadRejectedError);
  });

  it("fails closed when the scanner is unavailable unless explicitly configured otherwise", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(scanUpload(input, config())).rejects.toBeInstanceOf(UploadScanError);
    await expect(scanUpload(input, config({ DTA_UPLOAD_SCANNER_FAIL_OPEN: "true" }))).resolves.toEqual({ status: "skipped", scanner: "http" });
  });
});
