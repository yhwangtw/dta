import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { RequestPrincipal } from "@/lib/auth/request-auth";
import { getDtaDataDir } from "@/lib/config/env";

export function userStateKey(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function userStatePath(
  principal: RequestPrincipal,
  legacyPath: string,
  filename: string,
): string {
  if (principal.authType === "local") return legacyPath;
  return join(getDtaDataDir(), "users", userStateKey(principal.id), filename);
}

export function ensureStateDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
}
