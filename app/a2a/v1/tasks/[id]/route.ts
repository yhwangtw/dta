import { runToA2ATask } from "@/lib/a2a/a2a-adapter";
import { a2aAuthenticationError, a2aJson, a2aProblem, createA2ATaskStream, validateA2AVersion } from "@/lib/a2a/a2a-http";
import { AgentContractNotFoundError, getAgentContractService } from "@/lib/agents/agent-contract-service";
import { AgentRunNotFoundError, ensureAgentRunSupervisor } from "@/lib/agent-run-supervisor";
import { AuthenticationError, assertRunAccess, authenticateRequest } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorizedRun(request: Request, id: string) {
  const principal = await authenticateRequest(request);
  const run = getAgentContractService().getRun(id);
  assertRunAccess(principal, run.agentMetadata?.userId);
  return run;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const versionError = validateA2AVersion(request);
  if (versionError) return versionError;
  try {
    const { id: operationId } = await params;
    const subscribe = operationId.endsWith(":subscribe");
    const id = subscribe ? operationId.replace(/:subscribe$/, "") : operationId;
    const run = await authorizedRun(request, id);
    if (subscribe) {
      if (["completed", "failed", "cancelled", "interrupted"].includes(run.status)) {
        return a2aProblem(400, "Task Not Subscribable", "A terminal task cannot be subscribed", "unsupported-operation", { metadata: { taskId: id } });
      }
      return createA2ATaskStream(request, run);
    }
    return a2aJson(runToA2ATask(run));
  } catch (error) {
    if (error instanceof AuthenticationError) return a2aAuthenticationError(error);
    if (error instanceof AgentContractNotFoundError) return a2aProblem(404, "Task Not Found", "Task not found", "task-not-found");
    return a2aProblem(500, "Internal Error", error instanceof Error ? error.message : String(error), "internal-error");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const versionError = validateA2AVersion(request);
  if (versionError) return versionError;
  const { id: operationId } = await params;
  const cancel = operationId.endsWith(":cancel");
  const subscribe = operationId.endsWith(":subscribe");
  if (!cancel && !subscribe) return a2aProblem(404, "Operation Not Found", "Unsupported task operation", "unsupported-operation");
  const id = operationId.replace(/:(?:cancel|subscribe)$/, "");
  try {
    const run = await authorizedRun(request, id);
    if (subscribe) {
      if (["completed", "failed", "cancelled", "interrupted"].includes(run.status)) {
        return a2aProblem(400, "Task Not Subscribable", "A terminal task cannot be subscribed", "unsupported-operation");
      }
      return createA2ATaskStream(request, run);
    }
    const cancelled = await ensureAgentRunSupervisor().cancel(id);
    return a2aJson(runToA2ATask(cancelled));
  } catch (error) {
    if (error instanceof AuthenticationError) return a2aAuthenticationError(error);
    if (error instanceof AgentContractNotFoundError || error instanceof AgentRunNotFoundError) {
      return a2aProblem(404, "Task Not Found", "Task not found", "task-not-found");
    }
    return a2aProblem(500, "Internal Error", error instanceof Error ? error.message : String(error), "internal-error");
  }
}
