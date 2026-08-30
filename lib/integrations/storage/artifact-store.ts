export type ArtifactType =
  | "meeting_source"
  | "meeting_media"
  | "meeting_audio"
  | "meeting_keyframe"
  | "transcript"
  | "visual_analysis"
  | "meeting_timeline"
  | "meeting_result"
  | "meeting_minutes"
  | "urd"
  | "prd"
  | "user_story"
  | "acceptance_criteria"
  | "design"
  | "task_plan"
  | "department_result"
  | "department_document";

export interface ArtifactReference {
  id: string;
  type: ArtifactType;
  title: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ArtifactInput {
  type: ArtifactType;
  title: string;
  mimeType: string;
  data: string | Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface Artifact extends ArtifactReference {
  data: Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface ArtifactDescriptor extends ArtifactReference {
  metadata?: Record<string, unknown>;
}

export interface ArtifactStore {
  put(input: ArtifactInput): Promise<ArtifactReference>;
  get(id: string): Promise<Artifact>;
  delete?(id: string): Promise<void>;
  list?(): Promise<ArtifactDescriptor[]>;
  healthCheck?(): Promise<void>;
}

export class ArtifactNotFoundError extends Error {}
export class ArtifactStoreConfigurationError extends Error {}
export class ArtifactStoreOperationError extends Error {}
