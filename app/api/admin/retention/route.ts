import {
  assertAdminAccess,
  AuthenticationError,
  authenticateRequest,
  authenticationErrorResponse,
} from "@/lib/auth/request-auth";
import { runRetentionSweep } from "@/lib/governance/retention";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    assertAdminAccess(principal);
    const result = await runRetentionSweep();
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: "Retention sweep failed" }, { status: 500 });
  }
}
