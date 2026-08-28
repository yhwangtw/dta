import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDtaDataDir } from "@/lib/config/env";
import { isAgentMetadata, type AgentMetadata } from "@/lib/agents/agent-types";

interface AgentMetadataFile {
  version: 1;
  sessions: Record<string, AgentMetadata>;
}

function storePath(): string {
  return join(getDtaDataDir(), "metadata", "sessions.json");
}

function readStore(): AgentMetadataFile {
  const path = storePath();
  if (!existsSync(path)) return { version: 1, sessions: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentMetadataFile>;
    const sessions = Object.fromEntries(Object.entries(raw.sessions ?? {}).filter((entry): entry is [string, AgentMetadata] => isAgentMetadata(entry[1])));
    return { version: 1, sessions };
  } catch {
    return { version: 1, sessions: {} };
  }
}

function writeStore(store: AgentMetadataFile): void {
  const path = storePath();
  mkdirSync(join(getDtaDataDir(), "metadata"), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

export function readAgentSessionMetadata(sessionId: string): AgentMetadata | null {
  return readStore().sessions[sessionId] ?? null;
}

export function readAllAgentSessionMetadata(): Record<string, AgentMetadata> {
  return structuredClone(readStore().sessions);
}

export function writeAgentSessionMetadata(sessionId: string, metadata: AgentMetadata): void {
  if (!isAgentMetadata(metadata)) throw new Error("Invalid agent metadata");
  const store = readStore();
  store.sessions[sessionId] = structuredClone(metadata);
  writeStore(store);
}

export function copyAgentSessionMetadata(previousSessionId: string, nextSessionId: string): void {
  if (previousSessionId === nextSessionId) return;
  const store = readStore();
  const metadata = store.sessions[previousSessionId];
  if (!metadata || store.sessions[nextSessionId]) return;
  // Pi fork/new-session replacement keeps the previous JSONL session on
  // disk. Retaining both mappings prevents the parent from becoming an
  // unowned, cross-user-visible legacy session.
  store.sessions[nextSessionId] = structuredClone(metadata);
  writeStore(store);
}

export function deleteAgentSessionMetadata(sessionId: string): void {
  const store = readStore();
  if (!store.sessions[sessionId]) return;
  delete store.sessions[sessionId];
  writeStore(store);
}
