import { A2AListTasksValidationError, listA2ATasks } from "@/lib/a2a/a2a-list-tasks";
import { a2aAuthenticationError, a2aJson, a2aProblem, validateA2AVersion } from "@/lib/a2a/a2a-http";
import { AuthenticationError, assertRateLimit, authenticateRequest } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const versionError = validateA2AVersion(request);
  if (versionError) return versionError;
  try {
    const principal = await authenticateRequest(request);
    assertRateLimit(principal, "agent");
    return a2aJson(listA2ATasks(new URL(request.url).searchParams, principal));
  } catch (error) {
    if (error instanceof AuthenticationError) return a2aAuthenticationError(error);
    if (error instanceof A2AListTasksValidationError) {
      return a2aProblem(400, "Invalid List Tasks Request", error.message, "invalid-request");
    }
    return a2aProblem(500, "Internal Error", error instanceof Error ? error.message : String(error), "internal-error");
  }
}
