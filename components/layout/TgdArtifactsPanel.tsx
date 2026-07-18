"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import s from "./TgdArtifactsPanel.module.css";

interface ArtifactFile {
  name: string;
  path: string;
  phase?: string;
}
interface Feature {
  name: string;
  path: string;
  docs: ArtifactFile[];
  prototypes: ArtifactFile[];
  phasesDone: string[];
}
interface Artifacts {
  exists: boolean;
  tgdDir: string | null;
  top: ArtifactFile[];
  features: Feature[];
}

interface Props {
  cwd: string | null;
  refreshKey?: number;
  onOpenFile: (filePath: string, fileName: string) => void;
}

// The 7 phases in order, with which artifact-derived evidence marks them done.
const PHASES = ["map", "define", "plan", "develop", "verify", "review", "release"] as const;
const PHASE_LABEL: Record<string, string> = {
  map: "Map", define: "Define", plan: "Plan", develop: "Develop",
  verify: "Verify", review: "Review", release: "Release",
};

function fileIcon(name: string) {
  const html = name.endsWith(".html");
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      {html ? <path d="M9 15l-1.5 2 1.5 2M15 15l1.5 2-1.5 2" /> : <><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>}
    </svg>
  );
}

// ── Full-tree view: browse the ENTIRE tGD dir (nothing hidden — .scans,
// wiki/docs, prototypes, everything), lazily via the file-list endpoint. ──
interface DirEntry { name: string; isDir: boolean; size: number; }

async function listDir(abs: string): Promise<DirEntry[]> {
  try {
    const res = await fetch(`/api/files/${encodeFilePathForApi(abs)}?type=list`);
    if (!res.ok) return [];
    const d = await res.json() as { entries?: DirEntry[] };
    return d.entries ?? [];
  } catch {
    return [];
  }
}

function TreeNode({
  name, abs, isDir, depth, onOpenFile,
}: { name: string; abs: string; isDir: boolean; depth: number; onOpenFile: Props["onOpenFile"] }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const pad = 8 + depth * 13;

  useEffect(() => {
    if (isDir && open && children === null) listDir(abs).then(setChildren);
  }, [isDir, open, abs, children]);

  if (!isDir) {
    return (
      <button onClick={() => onOpenFile(abs, name)} className={s.fileRow} style={{ paddingLeft: pad }} title={abs}>
        <span className={s.fileIcon}>{fileIcon(name)}</span>
        <span className={s.fileName}>{name}</span>
      </button>
    );
  }
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className={s.dirRow} style={{ paddingLeft: pad }} title={abs}>
        <svg className={s.treeChevron} data-open={open || undefined} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3 2 7 5 3 8" />
        </svg>
        <span className={s.dirName}>{name}</span>
      </button>
      {open && children?.map((c) => (
        <TreeNode key={c.name} name={c.name} abs={joinFilePath(abs, c.name)} isDir={c.isDir} depth={depth + 1} onOpenFile={onOpenFile} />
      ))}
    </>
  );
}

function FileTree({ root, onOpenFile }: { root: string; onOpenFile: Props["onOpenFile"] }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  useEffect(() => { let live = true; listDir(root).then((e) => { if (live) setEntries(e); }); return () => { live = false; }; }, [root]);
  if (entries === null) return <div className={s.treeLoading}>Loading…</div>;
  if (entries.length === 0) return <div className={s.noFeatures}>Empty directory.</div>;
  return (
    <div className={s.tree}>
      {entries.map((e) => (
        <TreeNode key={e.name} name={e.name} abs={joinFilePath(root, e.name)} isDir={e.isDir} depth={0} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}

/**
 * tGD artifacts view — curated Map through Release lifecycle documents and
 * prototypes written into the sibling `<project>-tGD/` directory.
 * Two views: "Artifacts" (curated per-feature/phase) and "Files" (the whole
 * tGD dir as a tree, nothing hidden). Clicking a file opens it in the right
 * panel (markdown / HTML preview).
 */
export function TgdArtifactsPanel({ cwd, refreshKey, onOpenFile }: Props) {
  const [data, setData] = useState<Artifacts | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"artifacts" | "files">("artifacts");
  useEffect(() => { setView((localStorage.getItem("pi-tgd-artifacts-view") as "artifacts" | "files") ?? "artifacts"); }, []);
  const pickView = useCallback((v: "artifacts" | "files") => { setView(v); localStorage.setItem("pi-tgd-artifacts-view", v); }, []);

  const load = useCallback(async () => {
    if (!cwd) { setData(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/tgd/artifacts?cwd=${encodeURIComponent(cwd)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as Artifacts);
    } catch {
      setData({ exists: false, tgdDir: null, top: [], features: [] });
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!cwd) return <div className={s.empty}>Select a project first</div>;

  const fileRow = (f: ArtifactFile) => (
    <button key={f.path} onClick={() => onOpenFile(f.path, f.name)} className={s.fileRow} title={f.path}>
      <span className={s.fileIcon}>{fileIcon(f.name)}</span>
      <span className={s.fileName}>{f.name}</span>
    </button>
  );

  return (
    <div className={s.container}>
      <div className={`${s.header} chrome-mono`}>
        <span className={s.brand}>tGD</span>
        <div className={s.viewToggle} role="tablist">
          <button role="tab" aria-selected={view === "artifacts"} onClick={() => pickView("artifacts")} className={view === "artifacts" ? s.viewTabActive : s.viewTab}>Artifacts</button>
          <button role="tab" aria-selected={view === "files"} onClick={() => pickView("files")} className={view === "files" ? s.viewTabActive : s.viewTab}>Files</button>
        </div>
        <button onClick={load} title="Refresh" className={s.refresh} disabled={loading}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? s.spinning : undefined}>
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {!data || !data.exists ? (
        <div className={s.empty}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span>No tGD artifacts yet</span>
          <span className={s.emptyHint}>Run <code>/tgd-map</code> then <code>/tgd-define</code> to produce a PRD &amp; spec — they&apos;ll appear here.</span>
        </div>
      ) : view === "files" && data.tgdDir ? (
        <div className={s.body}>
          <FileTree key={data.tgdDir + (refreshKey ?? 0)} root={data.tgdDir} onOpenFile={onOpenFile} />
        </div>
      ) : (
        <div className={s.body}>
          {data.top.length > 0 && (
            <div className={s.section}>
              <div className={s.sectionTitle}>Project</div>
              {data.top.map(fileRow)}
            </div>
          )}

          {data.features.map((feat) => (
            <div key={feat.path} className={s.feature}>
              <div className={s.featureHead}>
                <span className={s.featureName} title={feat.name}>{feat.name}</span>
              </div>
              {/* phase correspondence — which phases this feature has evidence for */}
              <div className={s.phases}>
                {PHASES.map((p) => {
                  const done = feat.phasesDone.includes(p);
                  return (
                    <span key={p} className={`${s.phaseChip} ${done ? s.phaseDone : s.phaseTodo}`} title={`${PHASE_LABEL[p]}${done ? " — has artifacts" : ""}`}>
                      {PHASE_LABEL[p]}
                    </span>
                  );
                })}
              </div>
              {feat.docs.map(fileRow)}
              {feat.prototypes.length > 0 && (
                <div className={s.protoGroup}>
                  <span className={s.protoLabel}>prototype</span>
                  {feat.prototypes.map(fileRow)}
                </div>
              )}
            </div>
          ))}

          {data.features.length === 0 && data.top.length > 0 && (
            <div className={s.noFeatures}>No feature specs yet — run <code>/tgd-define</code>.</div>
          )}
        </div>
      )}
    </div>
  );
}
