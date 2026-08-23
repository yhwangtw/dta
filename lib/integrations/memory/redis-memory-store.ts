import { createHash } from "node:crypto";
import { createClient } from "redis";
import type { MemoryStore } from "./memory-store";

export interface RedisMemoryClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  on(event: "error", listener: (error: Error) => void): unknown;
  rPush(key: string, value: string): Promise<number>;
  lTrim(key: string, start: number, stop: number): Promise<string>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  expire(key: string, seconds: number): Promise<boolean>;
  del(key: string): Promise<number>;
  ping?(): Promise<string>;
  destroy?(): void;
}

function memoryKey(conversationId: string): string {
  const normalized = conversationId.trim();
  if (!normalized || normalized.length > 500) throw new Error("Invalid conversation id");
  return `dta:memory:${createHash("sha256").update(normalized).digest("hex")}`;
}

export class RedisMemoryStore implements MemoryStore {
  private connecting: Promise<void> | null = null;

  constructor(
    url: string,
    private readonly maxEntries = 1_000,
    private readonly ttlSeconds = 90 * 24 * 60 * 60,
    private readonly client: RedisMemoryClient = createClient({ url }) as unknown as RedisMemoryClient,
  ) {
    this.client.on("error", (error) => process.stderr.write(`[dta-memory] Redis connection error: ${error.message}\n`));
  }

  private async ready(): Promise<void> {
    if (this.client.isOpen) return;
    this.connecting ??= this.client.connect().then(() => undefined).finally(() => { this.connecting = null; });
    await this.connecting;
  }

  async getConversationMemory(conversationId: string): Promise<unknown> {
    await this.ready();
    const values = await this.client.lRange(memoryKey(conversationId), -this.maxEntries, -1);
    return values.flatMap((value) => {
      try { return [JSON.parse(value) as unknown]; }
      catch { return []; }
    });
  }

  async appendConversationMemory(conversationId: string, entry: unknown): Promise<void> {
    await this.ready();
    const key = memoryKey(conversationId);
    await this.client.rPush(key, JSON.stringify(entry));
    await this.client.lTrim(key, -this.maxEntries, -1);
    await this.client.expire(key, this.ttlSeconds);
  }

  async deleteConversationMemory(conversationId: string): Promise<void> {
    await this.ready();
    await this.client.del(memoryKey(conversationId));
  }

  async healthCheck(): Promise<void> {
    await this.ready();
    if (this.client.ping) await this.client.ping();
  }

  async close(): Promise<void> { this.client.destroy?.(); }
}
