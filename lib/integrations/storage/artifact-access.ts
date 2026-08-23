import { readAgentRunStore } from "@/lib/agent-run-store";
import { readMeetingRun } from "@/lib/agents/meeting/meeting-result-store";
import { readPMRun } from "@/lib/agents/pm/pm-result-store";
import {
  AuthenticationError,
  assertRunAccess,
  type RequestPrincipal,
} from "@/lib/auth/request-auth";
import type { Artifact } from "./artifact-store";

export interface ArtifactOwnership {
  userId?: string;
  projectId?: string;
  conversationId?: string;
  runId?: string;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: keyof ArtifactOwnership): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

export function artifactOwnershipMetadata(input: ArtifactOwnership | Record<string, unknown> | undefined): ArtifactOwnership {
  const metadata = input as Record<string, unknown> | undefined;
  return {
    ...(metadataString(metadata, "userId") ? { userId: metadataString(metadata, "userId") } : {}),
    ...(metadataString(metadata, "projectId") ? { projectId: metadataString(metadata, "projectId") } : {}),
    ...(metadataString(metadata, "conversationId") ? { conversationId: metadataString(metadata, "conversationId") } : {}),
    ...(metadataString(metadata, "runId") ? { runId: metadataString(metadata, "runId") } : {}),
  };
}

function artifactOwnerId(artifact: Artifact): string | undefined {
  const ownership = artifactOwnershipMetadata(artifact.metadata);
  if (ownership.userId) return ownership.userId;
  const runId = ownership.runId;
  if (!runId || !/^[A-Za-z0-9_-]{8,200}$/.test(runId)) return undefined;
  const agentRun = readAgentRunStore().runs.find((candidate) => candidate.id === runId || candidate.agentMetadata?.runId === runId);
  if (agentRun?.agentMetadata?.userId) return agentRun.agentMetadata.userId;
  return readMeetingRun(runId)?.userId ?? readPMRun(runId)?.userId;
}

export function assertArtifactAccess(principal: RequestPrincipal, artifact: Artifact): void {
  assertRunAccess(principal, artifactOwnerId(artifact));
}

export function assertArtifactDeleteAccess(principal: RequestPrincipal, artifact: Artifact): void {
  assertArtifactAccess(principal, artifact);
  if (
    principal.authType === "local"
    || principal.roles.includes("dta-admin")
    || principal.roles.includes("dta-artifact-delete")
  ) return;
  throw new AuthenticationError("Token lacks permission to delete DTA artifacts", 403, "FORBIDDEN");
}
