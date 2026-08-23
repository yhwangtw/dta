import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import type { MemoryStore } from "./memory-store";

interface ConversationMemoryFile {
  version: 1;
  conversationId: string;
  entries: unknown[];
  updatedAt: string;
}

export class LocalMemoryStore implements MemoryStore {
  private readonly pendingWrites = new Map<string, Promise<void>>();

  constructor(
    private readonly root = join(getDtaDataDir(), "memory"),
    private readonly maxEntries = 1_000,
    private readonly ttlSeconds = 90 * 24 * 60 * 60,
  ) {}

  private path(conversationId: string): string {
    const normalized = conversationId.trim();
    if (!normalized || normalized.length > 500) throw new Error("Invalid conversation id");
    return join(this.root, `${createHash("sha256").update(normalized).digest("hex")}.json`);
  }

  async getConversationMemory(conversationId: string): Promise<unknown> {
    try {
      const parsed = JSON.parse(await readFile(this.path(conversationId), "utf8")) as Partial<ConversationMemoryFile>;
      if (parsed.version !== 1 || parsed.conversationId !== conversationId || !Array.isArray(parsed.entries)) return [];
      if (typeof parsed.updatedAt === "string" && Date.now() - Date.parse(parsed.updatedAt) > this.ttlSeconds * 1_000) {
        await this.deleteConversationMemory(conversationId);
        return [];
      }
      return structuredClone(parsed.entries);
    } catch {
      return [];
    }
  }

  async appendConversationMemory(conversationId: string, entry: unknown): Promise<void> {
    const path = this.path(conversationId);
    const previous = this.pendingWrites.get(path) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(() => this.appendUnlocked(conversationId, entry, path));
    this.pendingWrites.set(path, pending);
    try {
      await pending;
    } finally {
      if (this.pendingWrites.get(path) === pending) this.pendingWrites.delete(path);
    }
  }

  private async appendUnlocked(conversationId: string, entry: unknown, path: string): Promise<void> {
    const current = await this.getConversationMemory(conversationId) as unknown[];
    const file: ConversationMemoryFile = {
      version: 1,
      conversationId,
      entries: [...current, structuredClone(entry)].slice(-this.maxEntries),
      updatedAt: new Date().toISOString(),
    };
    await mkdir(this.root, { recursive: true });
    const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, path);
  }

  async deleteConversationMemory(conversationId: string): Promise<void> {
    try { await unlink(this.path(conversationId)); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }

  async healthCheck(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.R_OK | constants.W_OK);
  }
}
