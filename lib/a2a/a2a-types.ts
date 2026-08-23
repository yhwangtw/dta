import type { ArtifactReference } from "@/lib/integrations/storage/artifact-store";

export type A2ATaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_AUTH_REQUIRED";

export interface A2APart {
  text?: string;
  data?: unknown;
  raw?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
  metadata?: Record<string, unknown>;
}

export interface A2AMessage {
  messageId: string;
  role: "ROLE_USER" | "ROLE_AGENT";
  parts: A2APart[];
  taskId?: string;
  contextId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2ASendMessageRequest {
  message: A2AMessage;
  configuration?: { acceptedOutputModes?: string[] };
  metadata?: Record<string, unknown>;
}

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: {
    state: A2ATaskState;
    timestamp: string;
    message?: A2AMessage;
  };
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

export interface A2AListTasksResponse {
  tasks: A2ATask[];
  nextPageToken: string;
  pageSize: number;
  totalSize: number;
}

export function artifactToA2A(reference: ArtifactReference, publicBaseUrl: string): A2AArtifact {
  return {
    artifactId: reference.id,
    name: reference.title,
    parts: [{
      url: `${publicBaseUrl}/api/artifacts/${encodeURIComponent(reference.id)}`,
      filename: reference.title,
      mediaType: reference.mimeType,
    }],
    metadata: { artifactType: reference.type, size: reference.size, createdAt: reference.createdAt },
  };
}
