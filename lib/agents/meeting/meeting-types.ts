import type { ArtifactReference } from "@/lib/integrations/storage/artifact-store";
import type { AgentAction } from "@/lib/agents/agent-types";

export interface MeetingEvidenceReference {
  artifactId?: string;
  source?: string;
  timestamp?: string;
  excerpt?: string;
  speaker?: string;
}

export interface MeetingTraceability {
  /** Stable within a Meeting run and across reviews of unchanged content. */
  id: string;
  evidence: MeetingEvidenceReference[];
  /** Source-grounding confidence from 0 to 1, never a probability of truth. */
  confidence: number;
  needsConfirmation: boolean;
}

export interface MeetingDecision extends MeetingTraceability {
  text: string;
  owner?: string;
}

export interface MeetingActionItem extends MeetingTraceability {
  title: string;
  description?: string;
  owner?: string;
  dueDate?: string;
}

export interface MeetingRequirement extends MeetingTraceability {
  title: string;
  description: string;
}

export interface MeetingResult {
  schemaVersion: "2.0";
  title?: string;
  summary: string;
  transcriptArtifactId?: string;
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  requirements: MeetingRequirement[];
}

export type MeetingReviewStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "changes_requested"
  | "rejected";

export type MeetingReviewDecision = Extract<
  MeetingReviewStatus,
  "approved" | "changes_requested" | "rejected"
>;

export interface MeetingReviewEvent {
  status: MeetingReviewDecision;
  actorId: string;
  comment?: string;
  reviewedAt: string;
  revision: number;
}

export interface StoredMeetingResult {
  runId: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  status: "running" | "completed" | "failed";
  result?: MeetingResult;
  artifacts: ArtifactReference[];
  actions: AgentAction[];
  reviewStatus: MeetingReviewStatus;
  revision: number;
  reviewHistory: MeetingReviewEvent[];
  error?: string;
  updatedAt: string;
}

function isEvidence(value: unknown): value is MeetingEvidenceReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as MeetingEvidenceReference;
  return [item.artifactId, item.source, item.timestamp, item.excerpt, item.speaker]
    .every((entry) => entry === undefined || typeof entry === "string");
}

function isTraceability(value: unknown): value is MeetingTraceability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as MeetingTraceability;
  return typeof item.id === "string" && item.id.length > 0
    && Array.isArray(item.evidence) && item.evidence.every(isEvidence)
    && typeof item.confidence === "number" && Number.isFinite(item.confidence)
    && item.confidence >= 0 && item.confidence <= 1
    && typeof item.needsConfirmation === "boolean";
}

export function isMeetingResult(value: unknown): value is MeetingResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<MeetingResult>;
  return item.schemaVersion === "2.0"
    && typeof item.summary === "string"
    && Array.isArray(item.decisions)
    && item.decisions.every((entry) => entry && typeof entry.text === "string" && isTraceability(entry))
    && Array.isArray(item.actionItems)
    && item.actionItems.every((entry) => entry && typeof entry.title === "string" && isTraceability(entry))
    && Array.isArray(item.requirements)
    && item.requirements.every((entry) => entry && typeof entry.title === "string" && typeof entry.description === "string" && isTraceability(entry));
}

function stableItemId(kind: "decision" | "action" | "requirement", seed: string, occurrence: number, text: string): string {
  let hash = 0x811c9dc5;
  // Hash content instead of list position so inserting a different item does
  // not renumber every traceability id. Only exact duplicates use an
  // occurrence suffix.
  const input = `${seed}\u0000${kind}\u0000${text}`;
  for (let offset = 0; offset < input.length; offset += 1) {
    hash ^= input.charCodeAt(offset);
    hash = Math.imul(hash, 0x01000193);
  }
  const base = `${kind}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
  return occurrence > 0 ? `${base}_${occurrence + 1}` : base;
}

function nextOccurrence(occurrences: Map<string, number>, kind: string, text: string): number {
  const key = `${kind}\u0000${text}`;
  const occurrence = occurrences.get(key) ?? 0;
  occurrences.set(key, occurrence + 1);
  return occurrence;
}

function uniqueTraceability(item: MeetingTraceability, usedIds: Set<string>): MeetingTraceability {
  const base = item.id;
  let id = base;
  let sequence = 2;
  while (usedIds.has(id)) {
    const suffix = `_${sequence++}`;
    id = `${base.slice(0, 200 - suffix.length)}${suffix}`;
  }
  usedIds.add(id);
  return id === item.id ? item : { ...item, id };
}

function normalizedEvidence(value: unknown): MeetingEvidenceReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEvidence).slice(0, 50).map((entry) => ({
    ...(entry.artifactId?.trim() ? { artifactId: entry.artifactId.trim().slice(0, 200) } : {}),
    ...(entry.source?.trim() ? { source: entry.source.trim().slice(0, 500) } : {}),
    ...(entry.timestamp?.trim() ? { timestamp: entry.timestamp.trim().slice(0, 100) } : {}),
    ...(entry.excerpt?.trim() ? { excerpt: entry.excerpt.trim().slice(0, 2_000) } : {}),
    ...(entry.speaker?.trim() ? { speaker: entry.speaker.trim().slice(0, 500) } : {}),
  })).filter((entry) => Object.keys(entry).length > 0);
}

function normalizedTraceability(
  value: Record<string, unknown>,
  kind: "decision" | "action" | "requirement",
  seed: string,
  occurrence: number,
  text: string,
): MeetingTraceability {
  const evidence = normalizedEvidence(value.evidence);
  const explicitConfidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
    ? Math.max(0, Math.min(1, value.confidence))
    : undefined;
  const confidence = explicitConfidence ?? (evidence.length > 0 ? 0.75 : 0.25);
  return {
    id: typeof value.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$/.test(value.id)
      ? value.id
      : stableItemId(kind, seed, occurrence, text),
    evidence,
    confidence,
    needsConfirmation: typeof value.needsConfirmation === "boolean"
      ? value.needsConfirmation
      : evidence.length === 0 || confidence < 0.7,
  };
}

/** Upgrades legacy MeetingResult payloads to the traceable 2.0 contract. */
export function normalizeMeetingResult(value: unknown, seed = "meeting"): MeetingResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.summary !== "string" || !Array.isArray(item.decisions) || !Array.isArray(item.actionItems) || !Array.isArray(item.requirements)) return null;
  const occurrences = new Map<string, number>();
  const usedIds = new Set<string>();
  const decisions = item.decisions.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof (entry as Record<string, unknown>).text !== "string") return null;
    const record = entry as Record<string, unknown>;
    const text = String(record.text);
    const traceability = uniqueTraceability(normalizedTraceability(record, "decision", seed, nextOccurrence(occurrences, "decision", text), text), usedIds);
    return { text, ...(typeof record.owner === "string" ? { owner: record.owner } : {}), ...traceability };
  });
  const actionItems = item.actionItems.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof (entry as Record<string, unknown>).title !== "string") return null;
    const record = entry as Record<string, unknown>;
    const title = String(record.title);
    return {
      title,
      ...(typeof record.description === "string" ? { description: record.description } : {}),
      ...(typeof record.owner === "string" ? { owner: record.owner } : {}),
      ...(typeof record.dueDate === "string" ? { dueDate: record.dueDate } : {}),
      ...uniqueTraceability(normalizedTraceability(record, "action", seed, nextOccurrence(occurrences, "action", title), title), usedIds),
    };
  });
  const requirements = item.requirements.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.title !== "string" || typeof record.description !== "string") return null;
    return {
      title: record.title,
      description: record.description,
      ...uniqueTraceability(normalizedTraceability(record, "requirement", seed, nextOccurrence(occurrences, "requirement", `${record.title}\u0000${record.description}`), `${record.title}\u0000${record.description}`), usedIds),
    };
  });
  if (decisions.some((entry) => !entry) || actionItems.some((entry) => !entry) || requirements.some((entry) => !entry)) return null;
  return {
    schemaVersion: "2.0",
    ...(typeof item.title === "string" ? { title: item.title } : {}),
    summary: item.summary,
    ...(typeof item.transcriptArtifactId === "string" ? { transcriptArtifactId: item.transcriptArtifactId } : {}),
    decisions: decisions as MeetingDecision[],
    actionItems: actionItems as MeetingActionItem[],
    requirements: requirements as MeetingRequirement[],
  };
}
