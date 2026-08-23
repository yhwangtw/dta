import { assertAuditAccess, AuthenticationError, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { readAuditEvents } from "@/lib/observability/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    assertAuditAccess(principal);
    const requested = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Number.isInteger(requested) ? requested : 200;
    return Response.json(readAuditEvents(limit), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: "Unable to read audit events" }, { status: 500 });
  }
}
