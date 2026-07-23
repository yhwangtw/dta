import { ensureScheduleRunner, ScheduleConflictError, ScheduleNotFoundError } from "@/lib/schedule-runner";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const { id } = await params;
  try {
    // Consume and validate the JSON envelope even though Run now currently has
    // no options. This keeps local state-changing endpoints CSRF-resistant.
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "JSON object is required" }, { status: 400 });
    }
    const run = ensureScheduleRunner().runNow(id);
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    const status = error instanceof ScheduleNotFoundError ? 404
      : error instanceof ScheduleConflictError ? 409
        : error instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
