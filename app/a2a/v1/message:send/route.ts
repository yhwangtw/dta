import { A2AValidationError, runToA2ATask, submitA2AMessage } from "@/lib/a2a/a2a-adapter";
import { a2aAuthenticationError, a2aJson, a2aProblem, validateA2AVersion } from "@/lib/a2a/a2a-http";
import { AuthenticationError, assertRateLimit, authenticateRequest } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const versionError = validateA2AVersion(request);
  if (versionError) return versionError;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/a2a+json") && !contentType.startsWith("application/json")) {
    return a2aProblem(415, "Unsupported Media Type", "Content-Type must be application/a2a+json", "content-type-not-supported");
  }
  try {
    const principal = await authenticateRequest(request);
    assertRateLimit(principal, "agent");
    const run = await submitA2AMessage(await request.json(), principal);
    return a2aJson({ task: runToA2ATask(run) });
  } catch (error) {
    if (error instanceof AuthenticationError) return a2aAuthenticationError(error);
    if (error instanceof A2AValidationError || error instanceof SyntaxError) {
      return a2aProblem(400, "Invalid A2A Request", error.message, error instanceof A2AValidationError && error.code === "CONTENT_TYPE_NOT_SUPPORTED" ? "content-type-not-supported" : "invalid-request");
    }
    return a2aProblem(500, "Internal Error", error instanceof Error ? error.message : String(error), "internal-error");
  }
}
