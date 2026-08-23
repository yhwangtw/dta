import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDtaConfig } from "@/lib/config/env";

export interface AuditEventInput {
  action: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  outcome: "success" | "failure";
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  occurredAt: string;
  previousHash: string;
  hash: string;
}

let lastHashByPath = new Map<string, string>();

function lastHash(path: string): string {
  const cached = lastHashByPath.get(path);
  if (cached) return cached;
  if (!existsSync(path)) return "GENESIS";
  try {
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const previous = JSON.parse(lines.at(-1) ?? "{}") as Partial<AuditEvent>;
    return typeof previous.hash === "string" && previous.hash ? previous.hash : "GENESIS";
  } catch {
    return "INVALID_CHAIN";
  }
}

function eventHash(event: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

export function recordAuditEvent(input: AuditEventInput): AuditEvent | null {
  const config = loadDtaConfig();
  if (!config.auditLogEnabled) return null;
  const path = config.auditLogPath;
  const withoutHash = {
    ...input,
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    previousHash: lastHash(path),
  };
  const event: AuditEvent = { ...withoutHash, hash: eventHash(withoutHash) };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  lastHashByPath.set(path, event.hash);
  return event;
}

export function readAuditEvents(limit = 200): { events: AuditEvent[]; chainValid: boolean } {
  const path = loadDtaConfig().auditLogPath;
  if (!existsSync(path)) return { events: [], chainValid: true };
  const events = readFileSync(path, "utf8").trim().split("\n").filter(Boolean).flatMap((line): AuditEvent[] => {
    try { return [JSON.parse(line) as AuditEvent]; }
    catch { return []; }
  });
  let previousHash = "GENESIS";
  let chainValid = true;
  for (const event of events) {
    const { hash, ...withoutHash } = event;
    if (event.previousHash !== previousHash || eventHash(withoutHash) !== hash) chainValid = false;
    previousHash = hash;
  }
  return { events: events.slice(-Math.max(1, Math.min(limit, 1_000))).reverse(), chainValid };
}

export function resetAuditLogForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Audit log reset is test-only");
  lastHashByPath = new Map();
}
