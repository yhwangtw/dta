import { ArtifactNotFoundError } from "@/lib/integrations/storage/artifact-store";
import { getArtifactStore } from "@/lib/integrations/storage/artifact-store-factory";
import { AuthenticationError, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { assertArtifactAccess, assertArtifactDeleteAccess } from "@/lib/integrations/storage/artifact-access";
import { recordAuditEvent } from "@/lib/observability/audit-log";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const principal = await authenticateRequest(request);
    const artifact = await getArtifactStore().get(id);
    assertArtifactAccess(principal, artifact);
    const title = artifact.title.replace(/["\\\r\n]/g, "_");
    return new Response(Buffer.from(artifact.data), {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(artifact.size),
        "Content-Disposition": `inline; filename="${title}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof ArtifactNotFoundError ? 404 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const principal = await authenticateRequest(request);
    const store = getArtifactStore();
    const artifact = await store.get(id);
    assertArtifactDeleteAccess(principal, artifact);
    if (!store.delete) return Response.json({ error: "Artifact deletion is not supported by this store" }, { status: 405 });
    await store.delete(id);
    recordAuditEvent({
      action: "artifact.delete",
      actorId: principal.id,
      resourceType: "artifact",
      resourceId: id,
      outcome: "success",
      metadata: { artifactType: artifact.type, size: artifact.size },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    const status = error instanceof ArtifactNotFoundError ? 404 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
