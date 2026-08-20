import type { ArtifactReference } from "@/lib/integrations/storage/artifact-store";

export interface MeetingResult {
  title?: string;
  summary: string;
  transcriptArtifactId?: string;
  decisions: Array<{ text: string; owner?: string }>;
  actionItems: Array<{
    title: string;
    description?: string;
    owner?: string;
    dueDate?: string;
  }>;
  requirements: Array<{
    title: string;
    description: string;
  }>;
}

export interface StoredMeetingResult {
  runId: string;
  sessionId?: string;
  status: "running" | "completed" | "failed";
  result?: MeetingResult;
  artifacts: ArtifactReference[];
  error?: string;
  updatedAt: string;
}

export function isMeetingResult(value: unknown): value is MeetingResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<MeetingResult>;
  return typeof item.summary === "string"
    && Array.isArray(item.decisions)
    && item.decisions.every((entry) => entry && typeof entry.text === "string")
    && Array.isArray(item.actionItems)
    && item.actionItems.every((entry) => entry && typeof entry.title === "string")
    && Array.isArray(item.requirements)
    && item.requirements.every((entry) => entry && typeof entry.title === "string" && typeof entry.description === "string");
}
