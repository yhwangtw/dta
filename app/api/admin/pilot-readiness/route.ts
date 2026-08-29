import { dtaConfigurationIssues, isDtaConfigurationReady, loadDtaConfig } from "@/lib/config/env";
import {
  assertAdminAccess,
  authenticateRequest,
  AuthenticationError,
  authenticationErrorResponse,
} from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

function safeEndpoint(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "invalid";
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    assertAdminAccess(principal);
    const config = loadDtaConfig();
    const issues = dtaConfigurationIssues(config);
    return Response.json({
      service: "dta-agent-platform",
      checkedAt: new Date().toISOString(),
      configurationReady: isDtaConfigurationReady(config),
      issues,
      adapters: {
        auth: {
          provider: config.authMode,
          issuer: safeEndpoint(config.keycloakIssuer),
          audience: config.keycloakAudience,
          tokenHeader: config.authTokenHeader,
        },
        llm: {
          configured: Boolean(config.llmBaseUrl && config.llmModel && (!config.llmAuthHeader || config.llmApiKey)),
          providerId: config.llmProviderId,
          endpoint: safeEndpoint(config.llmBaseUrl),
          api: config.llmApi,
          model: config.llmModel,
          supportsImages: config.llmSupportsImages,
        },
        artifactStore: {
          provider: config.artifactStoreProvider,
          endpoint: config.artifactStoreProvider === "minio" ? safeEndpoint(config.minioEndpoint) : undefined,
          bucket: config.artifactStoreProvider === "minio" ? config.minioBucket : undefined,
          region: config.artifactStoreProvider === "minio" ? config.minioRegion : undefined,
          prefix: config.artifactStoreProvider === "minio" ? config.minioPrefix : undefined,
        },
        memory: { provider: config.memoryStoreProvider },
        workflow: {
          provider: config.workflowProvider,
          enabled: config.enableWorkflowTools,
          endpoint: safeEndpoint(config.n8nBaseUrl),
          configuredWorkflows: Object.keys(config.n8nWorkflows).sort(),
        },
        transcription: {
          provider: config.transcriptionProvider,
          endpoint: safeEndpoint(config.transcriptionBaseUrl),
          model: config.transcriptionModel,
        },
        vision: {
          provider: config.visionProvider,
          endpoint: safeEndpoint(config.visionBaseUrl),
          model: config.visionModel,
        },
        uploadScanner: {
          provider: config.uploadScannerProvider,
          endpoint: safeEndpoint(config.uploadScannerUrl),
          failOpen: config.uploadScannerFailOpen,
        },
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } }, { status: 500 });
  }
}
