import { existsSync, readdirSync, statSync } from "fs";
import { join, dirname, basename } from "path";

// ============================================================================
// tGD artifacts live in a SIBLING directory of the code repo — `$TGD_DIR`,
// which the tGD workflow resolves as env `$TGD_DIR` or `../<project>-tGD/`.
// Structure (authoritative, from the tGD repo's /tgd-* command specs):
//
//   <project>-tGD/                ← $TGD_DIR
//   ├── CONTEXT.md                ← /tgd-map
//   ├── TRACKING-PLAN.md          ← /tgd-plan
//   ├── wiki/wiki.html            ← /tgd-map (infra)
//   ├── .scans/                   ← /tgd-map (infra — excluded)
//   └── <feature-name>/           ← a "feature" = dir with PRD.md or SPEC.md
//       ├── PRD.md  SPEC.md  DESIGN.md  TASKS.md  METRICS.md
//       └── prototype/*.html
// ============================================================================

/** Resolve the `$TGD_DIR` for a project cwd, or null if none exists. */
export function resolveTgdDir(cwd: string): string | null {
  const sibling = join(dirname(cwd), `${basename(cwd)}-tGD`);
  if (existsSync(sibling) && statSync(sibling).isDirectory()) return sibling;
  const env = process.env.TGD_DIR;
  if (env && existsSync(env) && statSync(env).isDirectory()) return env;
  return null;
}

export interface TgdArtifactFile {
  name: string;
  path: string;
  /** which tGD phase produced it (for pipeline correspondence) */
  phase?: string;
}

export interface TgdFeature {
  name: string;
  path: string;
  docs: TgdArtifactFile[];
  prototypes: TgdArtifactFile[];
  /** phase slugs this feature has completed evidence for */
  phasesDone: string[];
  /** newest mtime across the feature's docs — used to pick the "current" feature */
  mtimeMs: number;
}

export interface TgdArtifacts {
  exists: boolean;
  tgdDir: string | null;
  /** top-level docs (CONTEXT.md, TRACKING-PLAN.md, wiki) */
  top: TgdArtifactFile[];
  features: TgdFeature[];
}

// Which document maps to which phase — used for the pipeline correspondence.
const DOC_PHASE: Record<string, string> = {
  "PRD.md": "define",
  "SPEC.md": "define",
  "DESIGN.md": "define",
  "TASKS.md": "plan",
  "METRICS.md": "plan",
};
const FEATURE_DOC_ORDER = ["PRD.md", "SPEC.md", "DESIGN.md", "TASKS.md", "METRICS.md"];

function isFeatureDir(dir: string): boolean {
  return existsSync(join(dir, "PRD.md")) || existsSync(join(dir, "SPEC.md"));
}

export function readTgdArtifacts(cwd: string): TgdArtifacts {
  const tgdDir = resolveTgdDir(cwd);
  if (!tgdDir) return { exists: false, tgdDir: null, top: [], features: [] };

  const top: TgdArtifactFile[] = [];
  for (const [name, phase] of [["CONTEXT.md", "map"], ["TRACKING-PLAN.md", "plan"]] as const) {
    if (existsSync(join(tgdDir, name))) top.push({ name, path: join(tgdDir, name), phase });
  }
  const wiki = join(tgdDir, "wiki", "wiki.html");
  if (existsSync(wiki)) top.push({ name: "wiki.html", path: wiki, phase: "map" });

  const features: TgdFeature[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(tgdDir); } catch { /* ignore */ }
  for (const name of entries.sort()) {
    if (name.startsWith(".")) continue;        // .scans, dot-dirs
    if (name === "wiki") continue;
    const dir = join(tgdDir, name);
    let isDir = false;
    try { isDir = statSync(dir).isDirectory(); } catch { /* ignore */ }
    if (!isDir || !isFeatureDir(dir)) continue;

    const docs: TgdArtifactFile[] = [];
    const phasesDone = new Set<string>();
    let mtimeMs = 0;
    for (const doc of FEATURE_DOC_ORDER) {
      const p = join(dir, doc);
      if (existsSync(p)) {
        const phase = DOC_PHASE[doc];
        docs.push({ name: doc, path: p, phase });
        if (phase) phasesDone.add(phase);
        try { mtimeMs = Math.max(mtimeMs, statSync(p).mtimeMs); } catch { /* ignore */ }
      }
    }
    const prototypes: TgdArtifactFile[] = [];
    const protoDir = join(dir, "prototype");
    if (existsSync(protoDir)) {
      try {
        for (const f of readdirSync(protoDir).sort()) {
          if (f.endsWith(".html")) prototypes.push({ name: f, path: join(protoDir, f), phase: "define" });
        }
      } catch { /* ignore */ }
    }
    features.push({ name, path: dir, docs, prototypes, phasesDone: [...phasesDone], mtimeMs });
  }

  return { exists: true, tgdDir, top, features };
}
