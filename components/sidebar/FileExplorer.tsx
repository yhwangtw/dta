"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getFileIcon, FolderIcon } from "./FileIcons";
import { encodeFilePathForApi, getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import styles from "./FileExplorer.module.css";
import { useI18n } from "@/lib/i18n";

const JUNK_DIRS = new Set([
  ".git", ".next", ".nuxt", "node_modules", "__pycache__", ".venv", "venv",
  ".idea", ".vscode", ".DS_Store", "dist", "build", ".cache", ".turbo",
]);

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface FileNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  children?: FileNode[];
  loaded?: boolean;
}

interface SearchHit {
  name: string;
  relative: string;
  full: string;
  isDir: boolean;
}

interface MenuTarget {
  x: number;
  y: number;
  fullPath: string;
  relative: string;
  isDir: boolean;
  gitStatus?: string;
}

interface Props {
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  refreshKey?: number;
  onAtMention?: (relativePath: string) => void;
  /** Open the HEAD ↔ worktree diff for a changed file (relative path). */
  onOpenDiff?: (relativePath: string) => void;
}

async function fetchEntries(dirPath: string): Promise<FileNode[]> {
  const encoded = encodeFilePathForApi(dirPath);
  const res = await fetch(`/api/files/${encoded}?type=list`);
  if (!res.ok) return [];
  const data = await res.json() as { entries?: FileEntry[] };
  return (data.entries ?? [])
    .filter((e) => !JUNK_DIRS.has(e.name))
    .map((e) => ({
      name: e.name,
      fullPath: joinFilePath(dirPath, e.name),
      isDir: e.isDir,
      size: e.size,
      children: e.isDir ? [] : undefined,
      loaded: !e.isDir,
    }));
}

/** Porcelain status → badge letter + color. */
function GitBadge({ status }: { status: string }) {
  const letter = status === "??" ? "U" : status[0];
  const color =
    letter === "D" ? "var(--color-error-text)"
    : letter === "A" || letter === "U" ? "var(--color-success, #22c55e)"
    : "var(--color-warning-text-strong, #d97706)";
  return <span className={styles.gitBadge} style={{ color }}>{letter}</span>;
}

function TreeNode({
  node, depth, cwd, onOpenFile, onAtMention, expandedPaths, onToggleExpanded,
  refreshKey, gitStatus, onContextMenu,
}: {
  node: FileNode;
  depth: number;
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  onAtMention?: (relativePath: string) => void;
  expandedPaths: Set<string>;
  onToggleExpanded: (fullPath: string, open: boolean) => void;
  refreshKey?: number;
  gitStatus: Map<string, string>;
  onContextMenu: (t: MenuTarget) => void;
}) {
  const open = expandedPaths.has(node.fullPath);
  const [children, setChildren] = useState<FileNode[]>(node.children ?? []);
  const [loaded, setLoaded] = useState(node.loaded ?? false);
  const [loading, setLoading] = useState(false);
  const loadChildren = useCallback(async (force = false) => {
    if (loaded && !force) return;
    setLoading(true);
    try {
      const entries = await fetchEntries(node.fullPath);
      setChildren(entries);
      setLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loaded, node.fullPath]);

  // Re-fetch children when refreshKey changes and the directory is already open/loaded
  useEffect(() => {
    if (open && loaded) {
      loadChildren(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleClick = useCallback(() => {
    if (node.isDir) {
      const next = !open;
      onToggleExpanded(node.fullPath, next);
      if (next && !loaded) loadChildren();
    } else {
      onOpenFile(node.fullPath, node.name);
    }
  }, [node.isDir, node.fullPath, node.name, loaded, open, loadChildren, onOpenFile, onToggleExpanded]);

  const relative = getRelativeFilePath(node.fullPath, cwd);
  const fileStatus = node.isDir ? undefined : gitStatus.get(relative);
  // A dir is "dirty" when any changed file lives under it.
  let dirDirty = false;
  if (node.isDir && gitStatus.size > 0) {
    const prefix = `${relative}/`;
    for (const key of gitStatus.keys()) {
      if (key.startsWith(prefix)) { dirDirty = true; break; }
    }
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu({ x: e.clientX, y: e.clientY, fullPath: node.fullPath, relative, isDir: node.isDir, gitStatus: fileStatus });
        }}
        onMouseDown={(e) => (e.currentTarget as HTMLElement).focus()}
        className={`hover-bg hover-group ${styles.treeNode}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        tabIndex={-1}
        data-fx-row
        data-dir={node.isDir ? "1" : "0"}
        data-open={open ? "1" : "0"}
      >
        {node.isDir && (
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="var(--text-dim)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className={styles.treeChevron}
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
        )}
        {!node.isDir && <span className={styles.fileSpacer} />}
        <span className={styles.iconWrapper}>
          {node.isDir ? <FolderIcon size={14} open={open} /> : getFileIcon(node.name, 14)}
        </span>
        <span className={styles.fileName} title={node.fullPath}>
          {node.name}
        </span>
        {fileStatus && <GitBadge status={fileStatus} />}
        {dirDirty && <span className={styles.dirtyDot} aria-hidden />}
        {loading && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
        )}
        {onAtMention && (
          <button
            className={`hover-reveal ${styles.mentionButton}`}
            onClick={(e) => {
              e.stopPropagation();
              onAtMention(relative);
            }}
            title="Insert path into chat"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
            </svg>
            mention
          </button>
        )}
      </div>
      {node.isDir && open && (
        <div>
          {children.map((child) => (
            <TreeNode key={child.fullPath} node={child} depth={depth + 1} cwd={cwd} onOpenFile={onOpenFile} onAtMention={onAtMention} expandedPaths={expandedPaths} onToggleExpanded={onToggleExpanded} refreshKey={refreshKey} gitStatus={gitStatus} onContextMenu={onContextMenu} />
          ))}
          {children.length === 0 && loaded && (
            <div className={styles.emptyDirMessage} style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({ cwd, onOpenFile, refreshKey, onAtMention, onOpenDiff }: Props) {
  const { t } = useI18n();
  const [roots, setRoots] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const prevCwdRef = useRef<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggleExpanded = useCallback((fullPath: string, open: boolean) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (open) next.add(fullPath); else next.delete(fullPath);
      return next;
    });
  }, []);

  useEffect(() => {
    const cwdChanged = prevCwdRef.current !== cwd;
    prevCwdRef.current = cwd;

    // Reset expanded state only when cwd changes, not on refreshKey bumps
    if (cwdChanged) setExpandedPaths(new Set());
    if (cwdChanged) setFilterQuery("");

    setLoading(cwdChanged);
    setError(null);
    fetchEntries(cwd)
      .then((entries) => setRoots(entries))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cwd, refreshKey]);

  // ── Git working-tree status (badges) ────────────────────────────────────
  const [gitStatus, setGitStatus] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    fetch(`/api/git/changes?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((d: { git?: boolean; files?: { path: string; status: string }[] }) => {
        if (!alive) return;
        const map = new Map<string, string>();
        if (d?.git && Array.isArray(d.files)) {
          for (const f of d.files) map.set(f.path, f.status);
        }
        setGitStatus(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [cwd, refreshKey]);

  // ── Deep search (server-side, ≥2 chars) ─────────────────────────────────
  const searchMode = filterQuery.trim().length >= 2;
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searchMode) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const q = filterQuery.trim();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/files/search?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`);
        const data = await res.json() as { results?: SearchHit[]; truncated?: boolean };
        setSearchResults(Array.isArray(data.results) ? data.results : []);
        setSearchTruncated(!!data.truncated);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [filterQuery, cwd, searchMode, refreshKey]);

  /** Clicking a dir in search results reveals it in the tree. */
  const revealInTree = useCallback((relative: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      const parts = relative.split("/");
      let acc = cwd;
      for (const part of parts) {
        acc = joinFilePath(acc, part);
        next.add(acc);
      }
      return next;
    });
    setFilterQuery("");
  }, [cwd]);

  // ── Context menu ─────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const copyText = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setMenu(null);
  }, []);

  // ── Keyboard navigation over rendered rows ───────────────────────────────
  const onTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    const rows = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-fx-row]") ?? []);
    if (rows.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? rows.indexOf(active) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = idx === -1 ? 0 : e.key === "ArrowDown" ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0);
      rows[next]?.focus();
    } else if (e.key === "Enter" && idx >= 0) {
      e.preventDefault();
      rows[idx].click();
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && idx >= 0) {
      const el = rows[idx];
      const isDir = el.dataset.dir === "1";
      const open = el.dataset.open === "1";
      if (isDir && ((e.key === "ArrowRight" && !open) || (e.key === "ArrowLeft" && open))) {
        e.preventDefault();
        el.click();
      }
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`skeleton-line ${styles.skeletonLine}`} style={{ width: `${60 + (i % 3) * 15}%`, marginLeft: i * 4 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorMessage}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Filter / search input */}
      <div className={styles.filterWrapper}>
        <input
          ref={filterInputRef}
          type="text"
          placeholder={t("sidebar.filterFiles")}
          aria-label="Filter files"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setFilterQuery(""); filterInputRef.current?.blur(); } }}
          className={styles.filterInput}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent-border-focus-strong)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
      </div>

      <div ref={containerRef} className={styles.filterResults} onKeyDown={onTreeKeyDown}>
        {searchMode ? (
          <>
            {searching && searchResults.length === 0 && (
              <div className={styles.noResults}>…</div>
            )}
            {searchResults.map((hit) => (
              <div
                key={hit.full}
                onClick={() => hit.isDir ? revealInTree(hit.relative) : onOpenFile(hit.full, hit.name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, fullPath: hit.full, relative: hit.relative, isDir: hit.isDir, gitStatus: gitStatus.get(hit.relative) });
                }}
                onMouseDown={(e) => (e.currentTarget as HTMLElement).focus()}
                className={`hover-bg hover-group ${styles.searchHit}`}
                title={hit.full}
                tabIndex={-1}
                data-fx-row
                data-dir={hit.isDir ? "1" : "0"}
                data-open="0"
              >
                <span className={styles.iconWrapper}>
                  {hit.isDir ? <FolderIcon size={14} /> : getFileIcon(hit.name, 14)}
                </span>
                <span className={styles.hitText}>
                  <span className={styles.fileName}>{hit.name}</span>
                  <span className={styles.hitPath}>{hit.relative}</span>
                </span>
                {gitStatus.has(hit.relative) && <GitBadge status={gitStatus.get(hit.relative)!} />}
                {onAtMention && !hit.isDir && (
                  <button
                    className={`hover-reveal ${styles.mentionButton}`}
                    onClick={(e) => { e.stopPropagation(); onAtMention(hit.relative); }}
                    title="Insert path into chat"
                  >
                    @
                  </button>
                )}
              </div>
            ))}
            {!searching && searchResults.length === 0 && (
              <div className={styles.noResults}>No matches</div>
            )}
            {searchTruncated && (
              <div className={styles.noResults}>{t("explorer.truncated")}</div>
            )}
          </>
        ) : (
          <>
            {roots.map((node) => (
              <TreeNode
                key={node.fullPath}
                node={node}
                depth={0}
                cwd={cwd}
                onOpenFile={onOpenFile}
                onAtMention={onAtMention}
                expandedPaths={expandedPaths}
                onToggleExpanded={handleToggleExpanded}
                refreshKey={refreshKey}
                gitStatus={gitStatus}
                onContextMenu={setMenu}
              />
            ))}
            {roots.length === 0 && (
              <div className={styles.noResults}>No files found</div>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className={`glass ${styles.contextMenu}`}
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <button className={styles.menuItem} onClick={() => copyText(menu.fullPath)}>
            {t("explorer.copyPath")}
          </button>
          <button className={styles.menuItem} onClick={() => copyText(menu.relative)}>
            {t("explorer.copyRel")}
          </button>
          {onAtMention && (
            <button className={styles.menuItem} onClick={() => { onAtMention(menu.relative); setMenu(null); }}>
              {t("explorer.mention")}
            </button>
          )}
          {onOpenDiff && !menu.isDir && menu.gitStatus && (
            <button className={styles.menuItem} onClick={() => { onOpenDiff(menu.relative); setMenu(null); }}>
              {t("explorer.diff")}
            </button>
          )}
          {!menu.isDir && (
            <a
              className={styles.menuItem}
              href={`/api/files/${encodeFilePathForApi(menu.fullPath)}?type=download`}
              download
              onClick={() => setMenu(null)}
            >
              {t("explorer.download")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
