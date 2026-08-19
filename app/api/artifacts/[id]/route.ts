import { ArtifactNotFoundError, getArtifactStore } from "@/lib/integrations/storage/local-artifact-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const artifact = await getArtifactStore().get(id);
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
    const status = error instanceof ArtifactNotFoundError ? 404 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
