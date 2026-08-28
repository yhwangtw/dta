import { readAgentSessionMetadata, readAllAgentSessionMetadata } from "@/lib/agent-metadata-store";
import type { AgentMetadata } from "@/lib/agents/agent-types";
import { loadDtaConfig } from "@/lib/config/env";
import {
  AuthenticationError,
  authenticationErrorResponse,
  assertCodingAccess,
  assertAdminAccess,
  assertRunAccess,
  authenticateRequest,
  type RequestPrincipal,
} from "@/lib/auth/request-auth";

const DOMAIN_BLOCKED_COMMANDS = new Set(["bash", "abort_bash", "set_tools", "set_project_trust", "recover_runtime"]);

export interface SessionAccess {
  principal: RequestPrincipal;
  metadata: AgentMetadata | null;
}

export function assertSessionAccess(principal: RequestPrincipal, sessionId: string): AgentMetadata | null {
  const metadata = readAgentSessionMetadata(sessionId);
  if (principal.authType === "local") return metadata;

  // Ownership is checked before capability so another user's Coding session is
  // indistinguishable from a session that does not exist.
  assertRunAccess(principal, metadata?.userId);
  if (!metadata || metadata.agentType === "coding") assertCodingAccess(principal);
  return metadata;
}

export async function authorizeSessionRequest(request: Request, sessionId: string): Promise<SessionAccess> {
  const principal = await authenticateRequest(request);
  return { principal, metadata: assertSessionAccess(principal, sessionId) };
}

export async function authorizeCodingRequest(request: Request): Promise<RequestPrincipal> {
  const principal = await authenticateRequest(request);
  assertCodingAccess(principal);
  return principal;
}

export async function enforceCodingRequest(request: Request): Promise<Response | null> {
  try {
    await authorizeCodingRequest(request);
    return null;
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    throw error;
  }
}

export async function enforceAdminRequest(request: Request): Promise<Response | null> {
  try {
    const principal = await authenticateRequest(request);
    assertAdminAccess(principal);
    return null;
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    throw error;
  }
}

export function assertAgentCommandAccess(metadata: AgentMetadata | null, commandType: unknown): void {
  if (!metadata || metadata.agentType === "coding") return;
  if (typeof commandType === "string" && DOMAIN_BLOCKED_COMMANDS.has(commandType)) {
    throw new AuthenticationError("This runtime command is disabled for company domain agents", 403, "DOMAIN_COMMAND_DISABLED");
  }
}

export function canAccessSession(principal: RequestPrincipal, sessionId: string): boolean {
  try {
    assertSessionAccess(principal, sessionId);
    return true;
  } catch {
    return false;
  }
}

export function accessibleSessionIds(principal: RequestPrincipal): Set<string> | null {
  if (principal.authType === "local") return null;
  const config = loadDtaConfig();
  const canReadAll = principal.roles.includes("dta-run-read-all") || principal.roles.includes("dta-admin");
  const canCode = principal.roles.includes("dta-admin")
    || config.codingRequiredRoles.some((role) => principal.roles.includes(role));
  const metadata = readAllAgentSessionMetadata();
  return new Set(Object.entries(metadata)
    .filter(([, item]) => (canReadAll || item.userId === principal.id) && (item.agentType !== "coding" || canCode))
    .map(([sessionId]) => sessionId));
}
