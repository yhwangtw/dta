import { LocalMemoryStore } from "./local-memory-store";
import { PostgresMemoryStore } from "./postgres-memory-store";
import { RedisMemoryStore } from "./redis-memory-store";
import type { MemoryStore } from "./memory-store";
import { MemoryStoreConfigurationError } from "./memory-store";
import { loadDtaConfig } from "@/lib/config/env";

let store: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (store) return store;
  const config = loadDtaConfig();
  if (config.memoryStoreProvider === "postgres") {
    if (!config.postgresUrl) throw new MemoryStoreConfigurationError("POSTGRES_URL is required for the Postgres MemoryStore");
    store = new PostgresMemoryStore(config.postgresUrl, config.memoryMaxEntries, config.memoryTtlSeconds);
  } else if (config.memoryStoreProvider === "redis") {
    if (!config.redisUrl) throw new MemoryStoreConfigurationError("REDIS_URL is required for the Redis MemoryStore");
    store = new RedisMemoryStore(config.redisUrl, config.memoryMaxEntries, config.memoryTtlSeconds);
  } else {
    store = new LocalMemoryStore(undefined, config.memoryMaxEntries, config.memoryTtlSeconds);
  }
  return store;
}

export function resetMemoryStoreForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("MemoryStore reset is test-only");
  store = null;
}
