import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentType } from "@/lib/agents/agent-types";
import { loadAgentManifest } from "@/lib/agents/agent-manifest";

export type TranscriptionProviderName = "none" | "mock" | "openai-compatible";
export type TranscriptionResponseFormat = "auto" | "json" | "verbose_json" | "diarized_json";
export type VisionProviderName = "none" | "mock" | "openai-compatible";
export type MediaProcessorName = "none" | "ffmpeg";
export type AuthMode = "none" | "keycloak";
export type WorkflowProviderName = "none" | "mock" | "n8n";
export type ArtifactStoreProviderName = "local" | "minio";
export type MemoryStoreProviderName = "local" | "postgres" | "redis";
export type UploadScannerProviderName = "none" | "http";
export type LlmApiName = "openai-responses" | "openai-completions" | "anthropic-messages";

export interface DtaConfigurationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface DtaConfig {
  dataDir: string;
  agentWorkspaceDir: string;
  publicBaseUrl: string;
  providerOrganization: string;
  providerUrl: string;
  authMode: AuthMode;
  authTokenHeader: string;
  keycloakIssuer?: string;
  keycloakAudience?: string;
  keycloakJwksUrl?: string;
  keycloakRequiredRoles: string[];
  reviewRequiredRoles: string[];
  meetingReviewRequired: boolean;
  llmProviderId: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmApi: LlmApiName;
  llmAuthHeader: boolean;
  llmSupportsImages: boolean;
  llmContextWindow: number;
  llmMaxTokens: number;
  workflowProvider: WorkflowProviderName;
  enableWorkflowTools: boolean;
  n8nBaseUrl?: string;
  n8nApiKey?: string;
  n8nAuthHeader: string;
  n8nAuthScheme: string;
  n8nTimeoutMs: number;
  n8nWorkflows: Record<string, string>;
  artifactStoreProvider: ArtifactStoreProviderName;
  minioEndpoint?: string;
  minioAccessKey?: string;
  minioSecretKey?: string;
  minioBucket?: string;
  minioRegion: string;
  minioPrefix: string;
  memoryStoreProvider: MemoryStoreProviderName;
  postgresUrl?: string;
  redisUrl?: string;
  memoryMaxEntries: number;
  memoryTtlSeconds: number;
  auditLogEnabled: boolean;
  auditLogPath: string;
  metricsAuthRequired: boolean;
  uploadScannerProvider: UploadScannerProviderName;
  uploadScannerUrl?: string;
  uploadScannerApiKey?: string;
  uploadScannerAuthHeader: string;
  uploadScannerAuthScheme: string;
  uploadScannerTimeoutMs: number;
  uploadScannerFailOpen: boolean;
  retentionEnabled: boolean;
  artifactRetentionDays: number;
  retentionProtectApproved: boolean;
  rateLimitEnabled: boolean;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  defaultAgentType: AgentType;
  defaultAgentId: string;
  enabledAgentIds: string[];
  enabledAgentIdsExplicit: boolean;
  agentManifestPath?: string;
  transcriptionProvider: TranscriptionProviderName;
  mockTranscript?: string;
  transcriptionBaseUrl?: string;
  transcriptionApiKey?: string;
  transcriptionModel?: string;
  transcriptionResponseFormat: TranscriptionResponseFormat;
  transcriptionTimeoutMs: number;
  visionProvider: VisionProviderName;
  mockVisionResult?: string;
  visionBaseUrl?: string;
  visionApiKey?: string;
  visionModel?: string;
  visionTimeoutMs: number;
  mediaProcessor: MediaProcessorName;
  ffmpegPath: string;
  ffprobePath: string;
  mediaMaxDurationSeconds: number;
  videoMaxKeyframes: number;
  videoFrameWidth: number;
  mediaProcessTimeoutMs: number;
}

function enumValue<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function commaSeparated(value: string | undefined, fallback: string[]): string[] {
  const normalized = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized?.length ? [...new Set(normalized)] : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true" || value.trim() === "1";
}

function stringMap(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => Boolean(entry[0].trim()) && typeof entry[1] === "string" && Boolean(entry[1].trim())));
  } catch {
    return {};
  }
}

export function loadDtaConfig(env: NodeJS.ProcessEnv = process.env): DtaConfig {
  const configuredDir = env.DTA_DATA_DIR?.trim();
  const defaultDataDir = env.NODE_ENV === "test"
    ? join(tmpdir(), `dta-test-${process.pid}`)
    : join(homedir(), ".dta");
  return {
    dataDir: resolve(configuredDir || defaultDataDir),
    agentWorkspaceDir: resolve(env.DTA_AGENT_WORKSPACE?.trim() || process.cwd()),
    publicBaseUrl: optional(env.DTA_PUBLIC_BASE_URL)?.replace(/\/+$/, "") ?? "http://localhost:30141",
    providerOrganization: optional(env.DTA_PROVIDER_ORGANIZATION) ?? "Digital Transformation Department",
    providerUrl: optional(env.DTA_PROVIDER_URL)?.replace(/\/+$/, "") ?? optional(env.DTA_PUBLIC_BASE_URL)?.replace(/\/+$/, "") ?? "http://localhost:30141",
    authMode: enumValue(env.DTA_AUTH_MODE, ["none", "keycloak"] as const, "none"),
    authTokenHeader: optional(env.DTA_AUTH_TOKEN_HEADER)?.toLowerCase() ?? "authorization",
    ...(optional(env.KEYCLOAK_ISSUER) ? { keycloakIssuer: optional(env.KEYCLOAK_ISSUER)?.replace(/\/+$/, "") } : {}),
    ...(optional(env.KEYCLOAK_AUDIENCE) ? { keycloakAudience: optional(env.KEYCLOAK_AUDIENCE) } : {}),
    ...(optional(env.KEYCLOAK_JWKS_URL) ? { keycloakJwksUrl: optional(env.KEYCLOAK_JWKS_URL) } : {}),
    keycloakRequiredRoles: commaSeparated(env.KEYCLOAK_REQUIRED_ROLES, []),
    reviewRequiredRoles: commaSeparated(env.DTA_REVIEW_REQUIRED_ROLES, []),
    meetingReviewRequired: booleanValue(env.DTA_MEETING_REVIEW_REQUIRED, true),
    llmProviderId: optional(env.LLM_PROVIDER_ID) ?? "dta-company",
    ...(optional(env.LLM_BASE_URL) ? { llmBaseUrl: optional(env.LLM_BASE_URL)?.replace(/\/+$/, "") } : {}),
    ...(optional(env.LLM_API_KEY) ? { llmApiKey: optional(env.LLM_API_KEY) } : {}),
    ...(optional(env.LLM_MODEL) ? { llmModel: optional(env.LLM_MODEL) } : {}),
    llmApi: enumValue(env.LLM_API, ["openai-responses", "openai-completions", "anthropic-messages"] as const, "openai-responses"),
    llmAuthHeader: booleanValue(env.LLM_AUTH_HEADER, true),
    llmSupportsImages: booleanValue(env.LLM_SUPPORTS_IMAGES, false),
    llmContextWindow: boundedInteger(env.LLM_CONTEXT_WINDOW, 128_000, 8_000, 2_000_000),
    llmMaxTokens: boundedInteger(env.LLM_MAX_TOKENS, 16_384, 1_024, 256_000),
    workflowProvider: enumValue(env.DTA_WORKFLOW_PROVIDER, ["none", "mock", "n8n"] as const, env.NODE_ENV === "production" ? "none" : "mock"),
    enableWorkflowTools: booleanValue(env.DTA_ENABLE_WORKFLOW_TOOLS, false),
    ...(optional(env.N8N_BASE_URL) ? { n8nBaseUrl: optional(env.N8N_BASE_URL)?.replace(/\/+$/, "") } : {}),
    ...(optional(env.N8N_API_KEY) ? { n8nApiKey: optional(env.N8N_API_KEY) } : {}),
    n8nAuthHeader: optional(env.N8N_AUTH_HEADER) ?? "Authorization",
    n8nAuthScheme: optional(env.N8N_AUTH_SCHEME) ?? "Bearer",
    n8nTimeoutMs: boundedInteger(env.N8N_TIMEOUT_MS, 30_000, 1_000, 5 * 60_000),
    n8nWorkflows: stringMap(env.N8N_WORKFLOW_MAP_JSON),
    artifactStoreProvider: enumValue(env.DTA_ARTIFACT_STORE, ["local", "minio"] as const, "local"),
    ...(optional(env.MINIO_ENDPOINT) ? { minioEndpoint: optional(env.MINIO_ENDPOINT)?.replace(/\/+$/, "") } : {}),
    ...(optional(env.MINIO_ACCESS_KEY) ? { minioAccessKey: optional(env.MINIO_ACCESS_KEY) } : {}),
    ...(optional(env.MINIO_SECRET_KEY) ? { minioSecretKey: optional(env.MINIO_SECRET_KEY) } : {}),
    ...(optional(env.MINIO_BUCKET) ? { minioBucket: optional(env.MINIO_BUCKET) } : {}),
    minioRegion: optional(env.MINIO_REGION) ?? "us-east-1",
    minioPrefix: (optional(env.MINIO_PREFIX) ?? "dta").replace(/^\/+|\/+$/g, ""),
    memoryStoreProvider: enumValue(env.DTA_MEMORY_STORE, ["local", "postgres", "redis"] as const, "local"),
    ...(optional(env.POSTGRES_URL) ? { postgresUrl: optional(env.POSTGRES_URL) } : {}),
    ...(optional(env.REDIS_URL) ? { redisUrl: optional(env.REDIS_URL) } : {}),
    memoryMaxEntries: boundedInteger(env.DTA_MEMORY_MAX_ENTRIES, 1_000, 10, 100_000),
    memoryTtlSeconds: boundedInteger(env.DTA_MEMORY_TTL_SECONDS, 90 * 24 * 60 * 60, 60, 10 * 365 * 24 * 60 * 60),
    auditLogEnabled: booleanValue(env.DTA_AUDIT_LOG_ENABLED, true),
    auditLogPath: resolve(optional(env.DTA_AUDIT_LOG_PATH) ?? join(configuredDir || defaultDataDir, "audit", "events.jsonl")),
    metricsAuthRequired: booleanValue(env.DTA_METRICS_AUTH_REQUIRED, true),
    uploadScannerProvider: enumValue(env.DTA_UPLOAD_SCANNER, ["none", "http"] as const, "none"),
    ...(optional(env.DTA_UPLOAD_SCANNER_URL) ? { uploadScannerUrl: optional(env.DTA_UPLOAD_SCANNER_URL)?.replace(/\/+$/, "") } : {}),
    ...(optional(env.DTA_UPLOAD_SCANNER_API_KEY) ? { uploadScannerApiKey: optional(env.DTA_UPLOAD_SCANNER_API_KEY) } : {}),
    uploadScannerAuthHeader: optional(env.DTA_UPLOAD_SCANNER_AUTH_HEADER) ?? "Authorization",
    uploadScannerAuthScheme: optional(env.DTA_UPLOAD_SCANNER_AUTH_SCHEME) ?? "Bearer",
    uploadScannerTimeoutMs: boundedInteger(env.DTA_UPLOAD_SCANNER_TIMEOUT_MS, 60_000, 1_000, 10 * 60_000),
    uploadScannerFailOpen: booleanValue(env.DTA_UPLOAD_SCANNER_FAIL_OPEN, false),
    retentionEnabled: booleanValue(env.DTA_RETENTION_ENABLED, false),
    artifactRetentionDays: boundedInteger(env.DTA_ARTIFACT_RETENTION_DAYS, 365, 1, 3_650),
    retentionProtectApproved: booleanValue(env.DTA_RETENTION_PROTECT_APPROVED, true),
    rateLimitEnabled: booleanValue(env.DTA_RATE_LIMIT_ENABLED, env.NODE_ENV === "production"),
    rateLimitRequests: boundedInteger(env.DTA_RATE_LIMIT_REQUESTS, 60, 1, 100_000),
    rateLimitWindowSeconds: boundedInteger(env.DTA_RATE_LIMIT_WINDOW_SECONDS, 60, 1, 3_600),
    defaultAgentType: enumValue(env.AGENT_DEFAULT_TYPE, ["coding", "meeting", "pm", "department"] as const, "meeting"),
    defaultAgentId: optional(env.DTA_DEFAULT_AGENT_ID)
      ?? (env.AGENT_DEFAULT_TYPE === "pm" ? "pm-agent" : env.AGENT_DEFAULT_TYPE === "coding" ? "coding-agent" : "meeting-agent"),
    enabledAgentIds: commaSeparated(env.DTA_ENABLED_AGENTS, ["meeting-agent", "pm-agent"]),
    enabledAgentIdsExplicit: Boolean(optional(env.DTA_ENABLED_AGENTS)),
    ...(optional(env.DTA_AGENT_MANIFEST_PATH) ? { agentManifestPath: resolve(optional(env.DTA_AGENT_MANIFEST_PATH)!) } : {}),
    transcriptionProvider: enumValue(env.DTA_TRANSCRIPTION_PROVIDER, ["none", "mock", "openai-compatible"] as const, "none"),
    ...(env.DTA_MOCK_TRANSCRIPT?.trim() ? { mockTranscript: env.DTA_MOCK_TRANSCRIPT.trim() } : {}),
    ...(optional(env.DTA_TRANSCRIPTION_BASE_URL ?? env.LLM_BASE_URL) ? { transcriptionBaseUrl: optional(env.DTA_TRANSCRIPTION_BASE_URL ?? env.LLM_BASE_URL) } : {}),
    ...(optional(env.DTA_TRANSCRIPTION_API_KEY ?? env.LLM_API_KEY) ? { transcriptionApiKey: optional(env.DTA_TRANSCRIPTION_API_KEY ?? env.LLM_API_KEY) } : {}),
    ...(optional(env.DTA_TRANSCRIPTION_MODEL) ? { transcriptionModel: optional(env.DTA_TRANSCRIPTION_MODEL) } : {}),
    transcriptionResponseFormat: enumValue(env.DTA_TRANSCRIPTION_RESPONSE_FORMAT, ["auto", "json", "verbose_json", "diarized_json"] as const, "auto"),
    transcriptionTimeoutMs: boundedInteger(env.DTA_TRANSCRIPTION_TIMEOUT_MS, 10 * 60_000, 10_000, 30 * 60_000),
    visionProvider: enumValue(env.DTA_VISION_PROVIDER, ["none", "mock", "openai-compatible"] as const, "none"),
    ...(optional(env.DTA_MOCK_VISION_RESULT) ? { mockVisionResult: optional(env.DTA_MOCK_VISION_RESULT) } : {}),
    ...(optional(env.DTA_VISION_BASE_URL ?? env.LLM_BASE_URL) ? { visionBaseUrl: optional(env.DTA_VISION_BASE_URL ?? env.LLM_BASE_URL) } : {}),
    ...(optional(env.DTA_VISION_API_KEY ?? env.LLM_API_KEY) ? { visionApiKey: optional(env.DTA_VISION_API_KEY ?? env.LLM_API_KEY) } : {}),
    ...(optional(env.DTA_VISION_MODEL ?? env.LLM_MODEL) ? { visionModel: optional(env.DTA_VISION_MODEL ?? env.LLM_MODEL) } : {}),
    visionTimeoutMs: boundedInteger(env.DTA_VISION_TIMEOUT_MS, 5 * 60_000, 10_000, 15 * 60_000),
    mediaProcessor: enumValue(env.DTA_MEDIA_PROCESSOR, ["none", "ffmpeg"] as const, "ffmpeg"),
    ffmpegPath: optional(env.DTA_FFMPEG_PATH) ?? "ffmpeg",
    ffprobePath: optional(env.DTA_FFPROBE_PATH) ?? "ffprobe",
    mediaMaxDurationSeconds: boundedInteger(env.DTA_MEDIA_MAX_DURATION_SECONDS, 4 * 60 * 60, 60, 12 * 60 * 60),
    videoMaxKeyframes: boundedInteger(env.DTA_VIDEO_MAX_KEYFRAMES, 12, 1, 48),
    videoFrameWidth: boundedInteger(env.DTA_VIDEO_FRAME_WIDTH, 1280, 320, 1920),
    mediaProcessTimeoutMs: boundedInteger(env.DTA_MEDIA_PROCESS_TIMEOUT_MS, 5 * 60_000, 10_000, 30 * 60_000),
  };
}

export function getDtaDataDir(): string {
  return loadDtaConfig().dataDir;
}

export function dtaConfigurationIssues(config = loadDtaConfig()): DtaConfigurationIssue[] {
  const issues: DtaConfigurationIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: "error" as const, code, message });
  const warning = (code: string, message: string) => issues.push({ severity: "warning" as const, code, message });
  if (config.authMode === "keycloak" && (!config.keycloakIssuer || !config.keycloakAudience)) {
    error("KEYCLOAK_INCOMPLETE", "Keycloak authentication requires KEYCLOAK_ISSUER and KEYCLOAK_AUDIENCE");
  }
  const configuredLlm = Boolean(config.llmBaseUrl || config.llmModel || config.llmApiKey);
  if (configuredLlm && (!config.llmBaseUrl || !config.llmModel || (config.llmAuthHeader && !config.llmApiKey))) {
    error("LLM_INCOMPLETE", "Company LLM configuration requires LLM_BASE_URL, LLM_MODEL, and LLM_API_KEY when LLM_AUTH_HEADER=true");
  }
  if (config.workflowProvider === "n8n" && (!config.n8nBaseUrl || Object.keys(config.n8nWorkflows).length === 0)) {
    error("N8N_INCOMPLETE", "n8n workflows require N8N_BASE_URL and N8N_WORKFLOW_MAP_JSON");
  }
  if (config.enableWorkflowTools && config.workflowProvider === "none") {
    error("WORKFLOW_TOOLS_UNAVAILABLE", "Workflow tools are enabled but DTA_WORKFLOW_PROVIDER=none");
  }
  if (config.artifactStoreProvider === "minio" && (!config.minioEndpoint || !config.minioAccessKey || !config.minioSecretKey || !config.minioBucket)) {
    error("MINIO_INCOMPLETE", "MinIO artifact storage requires MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET");
  }
  if (config.memoryStoreProvider === "postgres" && !config.postgresUrl) {
    error("POSTGRES_MEMORY_INCOMPLETE", "DTA_MEMORY_STORE=postgres requires POSTGRES_URL");
  }
  if (config.memoryStoreProvider === "redis" && !config.redisUrl) {
    error("REDIS_MEMORY_INCOMPLETE", "DTA_MEMORY_STORE=redis requires REDIS_URL");
  }
  if (config.uploadScannerProvider === "http" && !config.uploadScannerUrl) {
    error("UPLOAD_SCANNER_INCOMPLETE", "DTA_UPLOAD_SCANNER=http requires DTA_UPLOAD_SCANNER_URL");
  }
  if (config.uploadScannerProvider === "none") {
    warning("UPLOAD_SCANNER_DISABLED", "Uploaded meeting files are not malware-scanned by DTA; use a trusted ingress scanner or configure DTA_UPLOAD_SCANNER=http");
  }
  if (config.retentionEnabled && config.artifactStoreProvider === "minio") {
    warning("MINIO_RETENTION_EXTERNAL", "DTA local retention cannot enumerate MinIO; configure the equivalent bucket lifecycle policy in MinIO");
  }
  if (config.transcriptionProvider === "none") {
    warning("TRANSCRIPTION_DISABLED", "Meeting audio/video transcription is unavailable until DTA_TRANSCRIPTION_PROVIDER is configured");
  }
  if (config.transcriptionProvider === "mock" && (!config.mockTranscript || process.env.NODE_ENV === "production")) {
    error("TRANSCRIPTION_MOCK_INVALID", "Mock transcription requires DTA_MOCK_TRANSCRIPT and is never enabled in production");
  }
  if (config.transcriptionProvider === "openai-compatible" && (!config.transcriptionBaseUrl || !config.transcriptionModel)) {
    error("TRANSCRIPTION_INCOMPLETE", "OpenAI-compatible transcription requires DTA_TRANSCRIPTION_BASE_URL and DTA_TRANSCRIPTION_MODEL");
  }
  if (config.visionProvider === "none") {
    warning("VISION_DISABLED", "Meeting video visual analysis is unavailable until DTA_VISION_PROVIDER is configured");
  }
  if (config.visionProvider === "mock" && (!config.mockVisionResult || process.env.NODE_ENV === "production")) {
    error("VISION_MOCK_INVALID", "Mock vision requires DTA_MOCK_VISION_RESULT and is never enabled in production");
  }
  if (config.visionProvider === "openai-compatible" && (!config.visionBaseUrl || !config.visionModel)) {
    error("VISION_INCOMPLETE", "OpenAI-compatible vision requires DTA_VISION_BASE_URL and DTA_VISION_MODEL");
  }
  if (config.mediaProcessor === "none") {
    warning("MEDIA_PROCESSING_DISABLED", "Video audio extraction and keyframe sampling are disabled because DTA_MEDIA_PROCESSOR=none");
  }
  if (config.agentManifestPath && !existsSync(config.agentManifestPath)) {
    error("AGENT_MANIFEST_MISSING", `DTA_AGENT_MANIFEST_PATH does not exist: ${config.agentManifestPath}`);
  } else if (config.agentManifestPath) {
    try {
      loadAgentManifest(config.agentManifestPath);
    } catch (manifestError) {
      error("AGENT_MANIFEST_INVALID", manifestError instanceof Error ? manifestError.message : String(manifestError));
    }
  }
  return issues;
}

export function dtaCapabilityWarnings(config = loadDtaConfig()): string[] {
  return dtaConfigurationIssues(config).map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
}

export function isDtaConfigurationReady(config = loadDtaConfig()): boolean {
  return dtaConfigurationIssues(config).every((issue) => issue.severity !== "error");
}
