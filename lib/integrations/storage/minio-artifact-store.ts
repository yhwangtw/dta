import { createHash, createHmac, randomUUID } from "node:crypto";
import type { DtaConfig } from "@/lib/config/env";
import {
  ArtifactNotFoundError,
  ArtifactStoreConfigurationError,
  ArtifactStoreOperationError,
  type Artifact,
  type ArtifactInput,
  type ArtifactReference,
  type ArtifactStore,
} from "./artifact-store";

interface StoredArtifactMetadata extends ArtifactReference {
  metadata?: Record<string, unknown>;
}

const SAFE_ID = /^[0-9a-f-]{36}$/i;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function canonicalPath(pathname: string): string {
  return pathname.split("/").map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
}

export class MinioArtifactStore implements ArtifactStore {
  private readonly endpoint: URL;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix: string;

  constructor(config: DtaConfig) {
    if (!config.minioEndpoint || !config.minioAccessKey || !config.minioSecretKey || !config.minioBucket) {
      throw new ArtifactStoreConfigurationError("MinIO artifact storage is not fully configured");
    }
    this.endpoint = new URL(config.minioEndpoint);
    if (this.endpoint.protocol !== "http:" && this.endpoint.protocol !== "https:") {
      throw new ArtifactStoreConfigurationError("MINIO_ENDPOINT must use HTTP or HTTPS");
    }
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.minioBucket)) {
      throw new ArtifactStoreConfigurationError("MINIO_BUCKET is invalid");
    }
    this.accessKey = config.minioAccessKey;
    this.secretKey = config.minioSecretKey;
    this.bucket = config.minioBucket;
    this.region = config.minioRegion;
    this.prefix = config.minioPrefix;
  }

  private objectKey(id: string, suffix: "bin" | "json"): string {
    if (!SAFE_ID.test(id)) throw new ArtifactNotFoundError("Artifact not found");
    return [this.prefix, "artifacts", `${id}.${suffix}`].filter(Boolean).join("/");
  }

  private async request(method: "GET" | "PUT" | "DELETE", key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const bytes = body ?? new Uint8Array();
    const payloadHash = sha256(bytes);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const basePath = this.endpoint.pathname.replace(/\/$/, "");
    const path = canonicalPath(`${basePath}/${this.bucket}/${key}`.replace(/\/+/g, "/"));
    const url = new URL(this.endpoint);
    url.pathname = path;
    url.search = "";
    const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const dateKey = hmac(`AWS4${this.secretKey}`, date);
    const regionKey = hmac(dateKey, this.region);
    const serviceKey = hmac(regionKey, "s3");
    const signingKey = hmac(serviceKey, "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const headers = new Headers({
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    });
    if (contentType) headers.set("Content-Type", contentType);
    return fetch(url, {
      method,
      headers,
      ...(method === "PUT" ? { body: Buffer.from(bytes) } : {}),
      cache: "no-store",
    });
  }

  async put(input: ArtifactInput): Promise<ArtifactReference> {
    const id = randomUUID();
    const bytes = typeof input.data === "string" ? Buffer.from(input.data, "utf8") : Buffer.from(input.data);
    const reference: ArtifactReference = {
      id,
      type: input.type,
      title: input.title.replace(/[\r\n\t]/g, " ").trim().slice(0, 255) || "Untitled artifact",
      mimeType: input.mimeType.trim().slice(0, 200) || "application/octet-stream",
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    const stored: StoredArtifactMetadata = { ...reference, ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}) };
    const dataResponse = await this.request("PUT", this.objectKey(id, "bin"), bytes, reference.mimeType);
    if (!dataResponse.ok) throw new ArtifactStoreOperationError(`MinIO data upload failed with HTTP ${dataResponse.status}`);
    const metadataBytes = Buffer.from(`${JSON.stringify(stored, null, 2)}\n`, "utf8");
    const metadataResponse = await this.request("PUT", this.objectKey(id, "json"), metadataBytes, "application/json");
    if (!metadataResponse.ok) {
      await this.request("DELETE", this.objectKey(id, "bin")).catch(() => {});
      throw new ArtifactStoreOperationError(`MinIO metadata upload failed with HTTP ${metadataResponse.status}`);
    }
    return reference;
  }

  async get(id: string): Promise<Artifact> {
    const [metadataResponse, dataResponse] = await Promise.all([
      this.request("GET", this.objectKey(id, "json")),
      this.request("GET", this.objectKey(id, "bin")),
    ]);
    if (metadataResponse.status === 404 || dataResponse.status === 404) throw new ArtifactNotFoundError("Artifact not found");
    if (!metadataResponse.ok || !dataResponse.ok) throw new ArtifactStoreOperationError("MinIO artifact download failed");
    try {
      const metadata = await metadataResponse.json() as StoredArtifactMetadata;
      if (metadata.id !== id || !SAFE_ID.test(metadata.id)) throw new Error("Invalid metadata");
      return { ...metadata, data: new Uint8Array(await dataResponse.arrayBuffer()) };
    } catch (error) {
      if (error instanceof ArtifactNotFoundError) throw error;
      throw new ArtifactStoreOperationError("MinIO artifact metadata is invalid");
    }
  }

  async delete(id: string): Promise<void> {
    const responses = await Promise.all([
      this.request("DELETE", this.objectKey(id, "bin")),
      this.request("DELETE", this.objectKey(id, "json")),
    ]);
    if (responses.some((response) => !response.ok && response.status !== 404)) {
      throw new ArtifactStoreOperationError("MinIO artifact deletion failed");
    }
  }

  async healthCheck(): Promise<void> {
    const key = [this.prefix, "health", "readiness-probe"].filter(Boolean).join("/");
    const response = await this.request("GET", key);
    if (!response.ok && response.status !== 404) {
      throw new ArtifactStoreOperationError(`MinIO readiness check failed with HTTP ${response.status}`);
    }
  }
}
