import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalMemoryStore } from "../integrations/memory/local-memory-store";
import { PostgresMemoryStore, type PostgresMemoryClient } from "../integrations/memory/postgres-memory-store";
import { RedisMemoryStore, type RedisMemoryClient } from "../integrations/memory/redis-memory-store";

describe("LocalMemoryStore", () => {
  it("isolates conversation memory and stores entries outside process globals", async () => {
    const root = mkdtempSync(join(tmpdir(), "dta-memory-"));
    try {
      const store = new LocalMemoryStore(root);
      await store.appendConversationMemory("conversation-a", { role: "user", text: "Pilot" });
      await store.appendConversationMemory("conversation-a", { role: "agent", text: "Noted" });
      await store.appendConversationMemory("conversation-b", { role: "user", text: "Separate" });
      await expect(store.getConversationMemory("conversation-a")).resolves.toEqual([
        { role: "user", text: "Pilot" },
        { role: "agent", text: "Noted" },
      ]);
      await expect(store.getConversationMemory("conversation-b")).resolves.toEqual([{ role: "user", text: "Separate" }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("serializes concurrent appends for one conversation", async () => {
    const root = mkdtempSync(join(tmpdir(), "dta-memory-concurrent-"));
    try {
      const store = new LocalMemoryStore(root);
      await Promise.all(Array.from({ length: 20 }, (_, index) => store.appendConversationMemory("same", { index })));
      const entries = await store.getConversationMemory("same") as Array<{ index: number }>;
      expect(entries).toHaveLength(20);
      expect(new Set(entries.map((entry) => entry.index)).size).toBe(20);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("enforces retention size and supports user-requested deletion", async () => {
    const root = mkdtempSync(join(tmpdir(), "dta-memory-retention-"));
    try {
      const store = new LocalMemoryStore(root, 2, 3600);
      await store.appendConversationMemory("conversation", { index: 1 });
      await store.appendConversationMemory("conversation", { index: 2 });
      await store.appendConversationMemory("conversation", { index: 3 });
      await expect(store.getConversationMemory("conversation")).resolves.toEqual([{ index: 2 }, { index: 3 }]);
      await store.deleteConversationMemory("conversation");
      await expect(store.getConversationMemory("conversation")).resolves.toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("production MemoryStore adapters", () => {
  it("uses parameterized Postgres queries and returns ordered JSON entries", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client: PostgresMemoryClient = {
      async query<Row>(text: string, values?: unknown[]) {
        calls.push({ text, values });
        const rows = text.includes("SELECT entry FROM") ? [{ entry: { index: 1 } }, { entry: { index: 2 } }] : [];
        return { rows: rows as Row[] };
      },
    };
    const store = new PostgresMemoryStore("postgres://unused", 100, 3_600, client);
    await store.appendConversationMemory("user:project:conversation", { index: 1 });
    await expect(store.getConversationMemory("user:project:conversation")).resolves.toEqual([{ index: 1 }, { index: 2 }]);
    await store.deleteConversationMemory("user:project:conversation");
    expect(calls.some((call) => call.text.includes("$1") && call.values?.length)).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("user:project:conversation");
  });

  it("caps and expires Redis lists without exposing raw conversation ids", async () => {
    const values = new Map<string, string[]>();
    const expirations: Array<{ key: string; seconds: number }> = [];
    const client: RedisMemoryClient = {
      isOpen: false,
      async connect() { this.isOpen = true; },
      on() { return this; },
      async rPush(key, value) { const list = values.get(key) ?? []; list.push(value); values.set(key, list); return list.length; },
      async lTrim(key, start) { const list = values.get(key) ?? []; values.set(key, list.slice(start)); return "OK"; },
      async lRange(key, start) { return (values.get(key) ?? []).slice(start); },
      async expire(key, seconds) { expirations.push({ key, seconds }); return true; },
      async del(key) { const existed = values.delete(key); return existed ? 1 : 0; },
    };
    const store = new RedisMemoryStore("redis://unused", 2, 3_600, client);
    await store.appendConversationMemory("private-conversation", { index: 1 });
    await store.appendConversationMemory("private-conversation", { index: 2 });
    await store.appendConversationMemory("private-conversation", { index: 3 });
    await expect(store.getConversationMemory("private-conversation")).resolves.toEqual([{ index: 2 }, { index: 3 }]);
    expect([...values.keys()][0]).not.toContain("private-conversation");
    expect(expirations.at(-1)?.seconds).toBe(3_600);
    await store.deleteConversationMemory("private-conversation");
    await expect(store.getConversationMemory("private-conversation")).resolves.toEqual([]);
  });
});
