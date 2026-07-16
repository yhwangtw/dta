import { statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { getRpcSession } from "@/lib/rpc-manager";
import { createTrackedAgentServices } from "@/lib/pi-runtime";
import { buildModelCatalog, resolveModelCatalogSource, type ModelCatalogSource } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

function activeSessionSource(sessionId: string): ModelCatalogSource | null {
  const session = getRpcSession(sessionId);
  if (!session?.isAlive()) return null;
  return {
    registry: session.inner.modelRegistry,
    settings: session.inner.settingsManager,
    diagnostics: session.getExtensionDiagnostics(),
  };
}

async function cwdSource(cwd: string): Promise<ModelCatalogSource> {
  const { services } = await createTrackedAgentServices(cwd);
  return {
    registry: services.modelRegistry,
    settings: services.settingsManager,
    diagnostics: services.diagnostics,
  };
}

// GET /api/models?sessionId=&cwd=
// Active sessions use their exact registry. A new/read-only session loads Pi's
// cwd-bound services so project extensions participate in model discovery.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const requestedCwd = url.searchParams.get("cwd") ?? process.cwd();

  if (!isAbsolute(requestedCwd)) {
    return Response.json({ error: "cwd must be absolute" }, { status: 400 });
  }
  try {
    if (!statSync(requestedCwd).isDirectory()) {
      return Response.json({ error: "cwd must be a directory" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "cwd does not exist" }, { status: 400 });
  }

  try {
    const source = await resolveModelCatalogSource({
      sessionId,
      cwd: requestedCwd,
      getSessionSource: activeSessionSource,
      createCwdSource: cwdSource,
    });
    return Response.json(buildModelCatalog(source.registry, source.settings, source.diagnostics));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
