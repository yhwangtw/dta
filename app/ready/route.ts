import { dtaConfigurationIssues, loadDtaConfig } from "@/lib/config/env";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { getMemoryStore } from "@/lib/integrations/memory";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = loadDtaConfig();
  const issues = dtaConfigurationIssues(config);
  const withTimeout = async (name: string, check: (() => Promise<void>) | undefined) => {
    if (!check) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} readiness check timed out`)), 3_000); }),
      ]);
    } catch (error) {
      issues.push({ severity: "error", code: `${name.toUpperCase()}_UNAVAILABLE`, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  if (!issues.some((issue) => issue.severity === "error")) {
    const artifactStore = getArtifactStore();
    const memoryStore = getMemoryStore();
    await Promise.all([
      withTimeout("artifact_store", artifactStore.healthCheck ? () => artifactStore.healthCheck!() : undefined),
      withTimeout("memory_store", memoryStore.healthCheck ? () => memoryStore.healthCheck!() : undefined),
    ]);
  }
  const errors = issues.filter((issue) => issue.severity === "error");
  return Response.json({
    status: errors.length === 0 ? "ready" : "not_ready",
    service: "dta-agent-platform",
    issues,
  }, {
    status: errors.length === 0 ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
