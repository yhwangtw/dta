export interface MemoryStore {
  getConversationMemory(conversationId: string): Promise<unknown>;
  appendConversationMemory(conversationId: string, entry: unknown): Promise<void>;
  deleteConversationMemory(conversationId: string): Promise<void>;
  healthCheck?(): Promise<void>;
  close?(): Promise<void>;
}

export class MemoryStoreConfigurationError extends Error {}
