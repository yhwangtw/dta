import { loadDtaConfig } from "@/lib/config/env";
import type { ArtifactStore } from "./artifact-store";
import { LocalArtifactStore } from "./local-artifact-store";
import { MinioArtifactStore } from "./minio-artifact-store";

let cached: { key: string; store: ArtifactStore } | null = null;

export function getArtifactStore(): ArtifactStore {
  const config = loadDtaConfig();
  const key = config.artifactStoreProvider === "local"
    ? `local:${config.dataDir}`
    : `minio:${config.minioEndpoint}:${config.minioBucket}:${config.minioPrefix}:${config.minioAccessKey}`;
  if (cached?.key === key) return cached.store;
  const store = config.artifactStoreProvider === "minio"
    ? new MinioArtifactStore(config)
    : new LocalArtifactStore();
  cached = { key, store };
  return store;
}
