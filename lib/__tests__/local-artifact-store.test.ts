import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactNotFoundError, LocalArtifactStore } from "../integrations/storage/local-artifact-store";

describe("LocalArtifactStore", () => {
  it("round-trips bytes with server-owned paths and metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "dta-artifacts-"));
    const store = new LocalArtifactStore(root);
    const reference = await store.put({
      type: "meeting_minutes",
      title: "Weekly sync",
      mimeType: "text/markdown",
      data: "# Minutes",
      metadata: { runId: "run-1" },
    });
    const artifact = await store.get(reference.id);
    expect(Buffer.from(artifact.data).toString("utf8")).toBe("# Minutes");
    expect(artifact.metadata).toEqual({ runId: "run-1" });
    await expect(store.list()).resolves.toEqual([expect.objectContaining({ id: reference.id, metadata: { runId: "run-1" } })]);
    await store.delete(reference.id);
    await expect(store.get(reference.id)).rejects.toBeInstanceOf(ArtifactNotFoundError);
  });

  it("rejects user-controlled path identifiers", async () => {
    const store = new LocalArtifactStore(mkdtempSync(join(tmpdir(), "dta-artifacts-")));
    await expect(store.get("../../secret")).rejects.toBeInstanceOf(ArtifactNotFoundError);
  });
});
