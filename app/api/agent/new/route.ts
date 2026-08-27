import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { isAgentMetadata } from "@/lib/agents/agent-types";
import { AgentRegistryError } from "@/lib/agents/agent-registry";
import { getAgentExecutionService } from "@/lib/agents/agent-execution-service";
import {
  AuthenticationError,
  assertRateLimit,
  authenticateRequest,
  authenticationErrorResponse,
  resolveActingUserId,
} from "@/lib/auth/request-auth";

// POST /api/agent/new  body: { cwd: string; type: string; message: string; ... }
// Spawns a brand-new pi session and immediately sends the first command.
// Returns { sessionId, data } where sessionId is pi's real session id.
export async function POST(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    assertRateLimit(principal, "agent");
    const body = await req.json() as { cwd?: string; [key: string]: unknown };
    const { cwd, ...command } = body;

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider, modelId, toolNames, thinkingLevel, ephemeral, agentMetadata, deferPrompt, ...promptCommand } = command as { provider?: string; modelId?: string; toolNames?: string[]; thinkingLevel?: string; ephemeral?: boolean; agentMetadata?: unknown; deferPrompt?: boolean; [key: string]: unknown };
    if (agentMetadata !== undefined && !isAgentMetadata(agentMetadata)) {
      return NextResponse.json({ error: "Invalid agentMetadata" }, { status: 400 });
    }
    const authenticatedMetadata = agentMetadata
      ? { ...agentMetadata, userId: resolveActingUserId(principal, agentMetadata.userId) }
      : undefined;
    const tempKey = `__new__${Date.now()}`;
    const executionService = getAgentExecutionService();
    const sessionInput = {
      cwd,
      sessionId: tempKey,
      toolNames,
      ephemeral: ephemeral === true,
      ...(authenticatedMetadata ? { metadata: authenticatedMetadata } : { userId: principal.id }),
    };

    // The browser needs the real session id before it can subscribe to SSE.
    // Let it explicitly defer the first prompt, connect to the event stream,
    // then POST the prompt through /api/agent/[id]. This prevents fast model
    // responses from completing before the browser is listening.
    if (deferPrompt === true) {
      if (!!provider !== !!modelId) {
        return NextResponse.json({ error: "provider and modelId must be set together" }, { status: 400 });
      }
      const session = await executionService.createSession(sessionInput);
      if (provider && modelId) {
        await session.send({ type: "set_model", provider, modelId });
      }
      if (thinkingLevel) {
        await session.send({ type: "set_thinking_level", level: thinkingLevel });
      }
      return NextResponse.json({ success: true, sessionId: session.sessionId, ephemeral: ephemeral === true, data: null });
    }

    const { session, result } = await executionService.startSession({
      ...sessionInput,
      command: promptCommand,
      provider,
      modelId,
      thinkingLevel,
    });

    return NextResponse.json({ success: true, sessionId: session.sessionId, ephemeral: ephemeral === true, data: result });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: error instanceof AgentRegistryError ? 400 : 500 });
  }
}
