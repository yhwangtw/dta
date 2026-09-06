import { NextResponse } from "next/server";
import { requestIsSameOrigin } from "@/lib/access-gate";
import { collectDiagnosticsBundle } from "@/lib/diagnostics";
import { redactedErrorMessage } from "@/lib/redaction";
import {
  assertAuditAccess,
  authenticateRequest,
  AuthenticationError,
  authenticationErrorResponse,
} from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";

function assertExplicitSameOriginExport(req: Request): void {
  const consent = req.headers.get("x-pi-diagnostics-consent");
  if (!req.headers.get("origin")
    || !requestIsSameOrigin(req)
    || consent !== "export") {
    throw new Error("Diagnostics export requires an explicit same-origin browser action");
  }
}

export async function POST(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    assertAuditAccess(principal);
    assertExplicitSameOriginExport(req);
    return NextResponse.json(await collectDiagnosticsBundle(principal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: redactedErrorMessage(error) }, { status: 403 });
  }
}
