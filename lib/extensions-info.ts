// ============================================================================
// Serialize a pi ExtensionRunner into a JSON-safe report for the Extensions
// management panel: what loaded, what it registered (commands/tools/flags),
// and — crucially — the load diagnostics that are otherwise invisible in the
// web UI (a broken extension currently fails silently).
// ============================================================================

export interface ExtensionCommandInfo {
  name: string;
  invocationName: string;
  description?: string;
  source?: string;
}

export interface ExtensionToolInfo {
  name: string;
  description?: string;
  source?: string;
}

export interface ExtensionFlagInfo {
  name: string;
  description?: string;
  type: "boolean" | "string";
  default?: boolean | string;
  value?: boolean | string;
  source?: string;
}

export interface ExtensionDiagnosticInfo {
  type: "warning" | "error" | "collision";
  message: string;
  path?: string;
}

export interface ExtensionsReport {
  paths: string[];
  commands: ExtensionCommandInfo[];
  tools: ExtensionToolInfo[];
  flags: ExtensionFlagInfo[];
  diagnostics: ExtensionDiagnosticInfo[];
}

// The slice of pi's ExtensionRunner this module reads. Structural, so tests
// can pass a plain object and the route can pass the real runner.
export interface RunnerLike {
  getExtensionPaths(): string[];
  getRegisteredCommands(): Array<{
    name: string;
    invocationName: string;
    description?: string;
    sourceInfo?: { path?: string };
  }>;
  getAllRegisteredTools(): Array<{
    definition: { name: string; description?: string };
    sourceInfo?: { path?: string };
  }>;
  getFlags(): Map<string, {
    name: string;
    description?: string;
    type: "boolean" | "string";
    default?: boolean | string;
    extensionPath?: string;
  }>;
  getFlagValues(): Map<string, boolean | string>;
  getCommandDiagnostics(): Array<{ type: "warning" | "error" | "collision"; message: string; path?: string }>;
  getShortcutDiagnostics(): Array<{ type: "warning" | "error" | "collision"; message: string; path?: string }>;
}

export function buildExtensionsReport(
  runner: RunnerLike,
  /** Extension files that failed to load at all (from the resource loader). */
  loadErrors: Array<{ path: string; error: string }> = [],
): ExtensionsReport {
  const flagValues = runner.getFlagValues();
  const flags: ExtensionFlagInfo[] = [...runner.getFlags().values()].map((f) => ({
    name: f.name,
    description: f.description,
    type: f.type,
    default: f.default,
    value: flagValues.has(f.name) ? flagValues.get(f.name) : f.default,
    source: f.extensionPath,
  }));

  // Command + shortcut diagnostics can overlap (same broken file reported by
  // both loaders) — dedupe on type+message+path.
  const seen = new Set<string>();
  const diagnostics: ExtensionDiagnosticInfo[] = [];
  // Hard load failures first — a broken extension file never reaches the
  // runner, so its error only exists in the resource loader's result.
  for (const e of loadErrors) {
    const key = `error|${e.error}|${e.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diagnostics.push({ type: "error", message: e.error, path: e.path });
  }
  for (const d of [...runner.getCommandDiagnostics(), ...runner.getShortcutDiagnostics()]) {
    const key = `${d.type}|${d.message}|${d.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diagnostics.push({ type: d.type, message: d.message, path: d.path });
  }

  return {
    paths: runner.getExtensionPaths(),
    commands: runner.getRegisteredCommands().map((c) => ({
      name: c.name,
      invocationName: c.invocationName,
      description: c.description,
      source: c.sourceInfo?.path,
    })),
    tools: runner.getAllRegisteredTools().map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      source: t.sourceInfo?.path,
    })),
    flags,
    diagnostics,
  };
}
