import { loadDtaConfig, type DtaConfig } from "@/lib/config/env";

export interface UploadScanResult {
  status: "clean" | "skipped";
  scanner: "none" | "http";
}

export class UploadRejectedError extends Error {
  constructor(message: string, readonly threat?: string) {
    super(message);
  }
}

export class UploadScanError extends Error {}

interface ScannerResponse {
  status?: unknown;
  threat?: unknown;
  message?: unknown;
}

export async function scanUpload(
  input: { name: string; mimeType: string; data: Uint8Array },
  config: DtaConfig = loadDtaConfig(),
): Promise<UploadScanResult> {
  if (config.uploadScannerProvider === "none") return { status: "skipped", scanner: "none" };
  if (!config.uploadScannerUrl) throw new UploadScanError("Upload scanner is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.uploadScannerTimeoutMs);
  try {
    const headers = new Headers({
      "Content-Type": input.mimeType || "application/octet-stream",
      "X-DTA-File-Name": encodeURIComponent(input.name).slice(0, 1_000),
    });
    if (config.uploadScannerApiKey) {
      headers.set(config.uploadScannerAuthHeader, [config.uploadScannerAuthScheme, config.uploadScannerApiKey].filter(Boolean).join(" "));
    }
    const response = await fetch(config.uploadScannerUrl, {
      method: "POST",
      headers,
      body: Buffer.from(input.data),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new UploadScanError(`Upload scanner returned HTTP ${response.status}`);
    const result = await response.json() as ScannerResponse;
    if (result.status === "infected") {
      const threat = typeof result.threat === "string" ? result.threat.slice(0, 500) : undefined;
      throw new UploadRejectedError("Upload was rejected by the malware scanner", threat);
    }
    if (result.status !== "clean") throw new UploadScanError("Upload scanner returned an invalid result");
    return { status: "clean", scanner: "http" };
  } catch (error) {
    if (error instanceof UploadRejectedError) throw error;
    if (config.uploadScannerFailOpen) return { status: "skipped", scanner: "http" };
    if (error instanceof UploadScanError) throw error;
    throw new UploadScanError(error instanceof Error ? `Upload scanner failed: ${error.message}` : "Upload scanner failed");
  } finally {
    clearTimeout(timeout);
  }
}
