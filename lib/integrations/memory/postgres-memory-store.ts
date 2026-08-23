import { createHash } from "node:crypto";
import { Pool } from "pg";
import type { MemoryStore } from "./memory-store";

interface QueryResult<Row> { rows: Row[] }
export interface PostgresMemoryClient {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  end?(): Promise<void>;
}

function memoryKey(conversationId: string): string {
  const normalized = conversationId.trim();
  if (!normalized || normalized.length > 500) throw new Error("Invalid conversation id");
  return createHash("sha256").update(normalized).digest("hex");
}

export class PostgresMemoryStore implements MemoryStore {
  private schemaReady: Promise<void> | null = null;

  constructor(
    connectionString: string,
    private readonly maxEntries = 1_000,
    private readonly ttlSeconds = 90 * 24 * 60 * 60,
    private readonly client: PostgresMemoryClient = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 }) as unknown as PostgresMemoryClient,
  ) {}

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      await this.client.query(`CREATE TABLE IF NOT EXISTS dta_conversation_memory (
        conversation_key text NOT NULL,
        sequence bigserial PRIMARY KEY,
        entry jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await this.client.query("CREATE INDEX IF NOT EXISTS dta_conversation_memory_lookup ON dta_conversation_memory (conversation_key, sequence DESC)");
    })();
    return this.schemaReady;
  }

  async getConversationMemory(conversationId: string): Promise<unknown> {
    await this.ensureSchema();
    const key = memoryKey(conversationId);
    await this.client.query("DELETE FROM dta_conversation_memory WHERE conversation_key = $1 AND created_at < now() - make_interval(secs => $2::int)", [key, this.ttlSeconds]);
    const result = await this.client.query<{ entry: unknown }>(`SELECT entry FROM (
      SELECT sequence, entry FROM dta_conversation_memory
      WHERE conversation_key = $1 ORDER BY sequence DESC LIMIT $2
    ) recent ORDER BY sequence ASC`, [key, this.maxEntries]);
    return result.rows.map((row) => structuredClone(row.entry));
  }

  async appendConversationMemory(conversationId: string, entry: unknown): Promise<void> {
    await this.ensureSchema();
    const key = memoryKey(conversationId);
    await this.client.query("INSERT INTO dta_conversation_memory (conversation_key, entry) VALUES ($1, $2::jsonb)", [key, JSON.stringify(entry)]);
    await this.client.query(`DELETE FROM dta_conversation_memory
      WHERE conversation_key = $1 AND sequence NOT IN (
        SELECT sequence FROM dta_conversation_memory WHERE conversation_key = $1 ORDER BY sequence DESC LIMIT $2
      )`, [key, this.maxEntries]);
  }

  async deleteConversationMemory(conversationId: string): Promise<void> {
    await this.ensureSchema();
    await this.client.query("DELETE FROM dta_conversation_memory WHERE conversation_key = $1", [memoryKey(conversationId)]);
  }

  async healthCheck(): Promise<void> {
    await this.client.query("SELECT 1");
  }

  async close(): Promise<void> { await this.client.end?.(); }
}
