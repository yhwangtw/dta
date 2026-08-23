import { loadDtaConfig } from "@/lib/config/env";
import { AuthenticationError, assertAuditAccess, authenticateRequest, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { renderPrometheusMetrics } from "@/lib/observability/prometheus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    if (loadDtaConfig().metricsAuthRequired) {
      const principal = await authenticateRequest(request);
      assertAuditAccess(principal);
    }
    return new Response(renderPrometheusMetrics(), {
      headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: "Unable to render metrics" }, { status: 500 });
  }
}
