import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDtaConfig } from "../config/env";
import { MinioArtifactStore } from "../integrations/storage/minio-artifact-store";

afterEach(() => vi.restoreAllMocks());

describe("MinioArtifactStore", () => {
  it("stores and retrieves artifacts through signed S3-compatible requests", async () => {
    let metadata: Record<string, unknown> | null = null;
    let data = new Uint8Array();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PUT") {
        const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
        if (url.endsWith(".json")) metadata = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>;
        else data = bytes;
        return new Response(null, { status: 200 });
      }
      if (init?.method === "GET" && url.endsWith(".json")) return Response.json(metadata);
      if (init?.method === "GET") return new Response(data, { status: 200 });
      return new Response(null, { status: 204 });
    });
    const config = loadDtaConfig({
      ...process.env,
      DTA_ARTIFACT_STORE: "minio",
      MINIO_ENDPOINT: "https://minio.example.com",
      MINIO_ACCESS_KEY: "test-access",
      MINIO_SECRET_KEY: "test-secret",
      MINIO_BUCKET: "dta-artifacts",
      MINIO_PREFIX: "company/dta",
    });
    const store = new MinioArtifactStore(config);
    const reference = await store.put({ type: "meeting_minutes", title: "Minutes", mimeType: "text/markdown", data: "# Minutes" });
    const artifact = await store.get(reference.id);

    expect(Buffer.from(artifact.data).toString("utf8")).toBe("# Minutes");
    expect(fetchMock.mock.calls[0][0].toString()).toContain("/dta-artifacts/company/dta/artifacts/");
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access\//);
    expect(headers.get("Authorization")).not.toContain("test-secret");
  });
});
