import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { Artifact, ArtifactInput, ArtifactReference, ArtifactStore } from "./artifact-store";

interface StoredArtifactMetadata extends ArtifactReference {
  metadata?: Record<string, unknown>;
}

const SAFE_ID = /^[0-9a-f-]{36}$/i;

export class ArtifactNotFoundError extends Error {}

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly root = join(getDtaDataDir(), "artifacts")) {}

  private paths(id: string): { data: string; metadata: string } {
    if (!SAFE_ID.test(id)) throw new ArtifactNotFoundError("Artifact not found");
    return {
      data: join(this.root, `${id}.bin`),
      metadata: join(this.root, `${id}.json`),
    };
  }

  async put(input: ArtifactInput): Promise<ArtifactReference> {
    const id = randomUUID();
    const paths = this.paths(id);
    const bytes = typeof input.data === "string" ? Buffer.from(input.data, "utf8") : Buffer.from(input.data);
    const reference: ArtifactReference = {
      id,
      type: input.type,
      title: input.title.replace(/[\r\n\t]/g, " ").trim().slice(0, 255) || "Untitled artifact",
      mimeType: input.mimeType.trim().slice(0, 200) || "application/octet-stream",
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    const stored: StoredArtifactMetadata = {
      ...reference,
      ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
    };
    await mkdir(this.root, { recursive: true });
    const dataTemp = `${paths.data}.${process.pid}.tmp`;
    const metadataTemp = `${paths.metadata}.${process.pid}.tmp`;
    await writeFile(dataTemp, bytes, { mode: 0o600 });
    await writeFile(metadataTemp, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(dataTemp, paths.data);
    await rename(metadataTemp, paths.metadata);
    return reference;
  }

  async get(id: string): Promise<Artifact> {
    const paths = this.paths(id);
    try {
      const [rawMetadata, data] = await Promise.all([readFile(paths.metadata, "utf8"), readFile(paths.data)]);
      const metadata = JSON.parse(rawMetadata) as StoredArtifactMetadata;
      return { ...metadata, data };
    } catch {
      throw new ArtifactNotFoundError("Artifact not found");
    }
  }

  async delete(id: string): Promise<void> {
    const paths = this.paths(id);
    await Promise.all([rm(paths.data, { force: true }), rm(paths.metadata, { force: true })]);
  }
}

let defaultStore: LocalArtifactStore | null = null;

export function getArtifactStore(): LocalArtifactStore {
  defaultStore ??= new LocalArtifactStore();
  return defaultStore;
}
