import {
  assertCodingAccess,
  authenticateRequest,
  AuthenticationError,
  authenticationErrorResponse,
} from "@/lib/auth/request-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    let codingWorkspace = true;
    try { assertCodingAccess(principal); }
    catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      codingWorkspace = false;
    }
    return Response.json({
      user: {
        id: principal.id,
        ...(principal.username ? { username: principal.username } : {}),
        ...(principal.email ? { email: principal.email } : {}),
      },
      authType: principal.authType,
      capabilities: {
        codingWorkspace,
        administrator: principal.authType === "local" || principal.roles.includes("dta-admin"),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
