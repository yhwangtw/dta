"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { getFileIcon, FolderIcon } from "./FileIcons";
import { encodeFilePathForApi, getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import styles from "./FileExplorer.module.css";
import { useI18n } from "@/lib/i18n";

const JUNK_DIRS = new Set([
  ".git", ".next", ".nuxt", "node_modules", "__pycache__", ".venv", "venv",
  ".idea", ".vscode", ".DS_Store", "dist", "build", ".cache", ".turbo",
]);

function matchesFilter(node: FileNode, q: string): boolean {
  if (node.name.toLowerCase().includes(q)) return true;
  if (node.isDir && node.children) {
    return node.children.some((c) => matchesFilter(c, q));
  }
  return false;
}

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

interface Props {
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  refreshKey?: number;
  onAtMention?: (relativePath: string) => void;
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

function TreeNode({
  node,
  depth,
  cwd,
  onOpenFile,
  onAtMention,
  expandedPaths,
  onToggleExpanded,
  refreshKey,
  filterQuery,
}: {
  node: FileNode;
  depth: number;
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  onAtMention?: (relativePath: string) => void;
  expandedPaths: Set<string>;
  onToggleExpanded: (fullPath: string, open: boolean) => void;
  refreshKey?: number;
  filterQuery?: string;
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

  // When refreshKey causes a re-render with the same node identity, reload open dirs
  const prevLoadedRef = useRef(loaded);
  useEffect(() => {
    prevLoadedRef.current = loaded;
  });

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

  return (
    <div>
      <div
        onClick={handleClick}
        className={`hover-bg hover-group ${styles.treeNode}`}
        style={{ paddingLeft: 8 + depth * 14 }}
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
        <span
          className={styles.fileName}
          title={node.fullPath}
        >
          {node.name}
        </span>
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
              onAtMention(getRelativeFilePath(node.fullPath, cwd));
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
          {children
            .filter((c) => !filterQuery || c.isDir ? true : matchesFilter(c, filterQuery))
            .map((child) => (
            <TreeNode key={child.fullPath} node={child} depth={depth + 1} cwd={cwd} onOpenFile={onOpenFile} onAtMention={onAtMention} expandedPaths={expandedPaths} onToggleExpanded={onToggleExpanded} refreshKey={refreshKey} filterQuery={filterQuery} />
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

export function FileExplorer({ cwd, onOpenFile, refreshKey, onAtMention }: Props) {
  const { t } = useI18n();
  const [roots, setRoots] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const prevCwdRef = useRef<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-expand parent paths when filter is active
  const effectiveExpanded = useMemo(() => {
    if (!filterQuery.trim()) return expandedPaths;
    const q = filterQuery.toLowerCase();
    const autoExpand = new Set<string>();
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.isDir && matchesFilter(n, q)) {
          // expand this dir so children are visible
          autoExpand.add(n.fullPath);
          if (n.children && n.children.length > 0) {
            walk(n.children);
          }
        }
      }
    };
    walk(roots);
    // Merge with user-toggled paths
    for (const p of expandedPaths) autoExpand.add(p);
    return autoExpand;
  }, [filterQuery, roots, expandedPaths]);

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

  const filteredRoots = filterQuery.trim()
    ? roots.filter((n) => matchesFilter(n, filterQuery.toLowerCase()))
    : roots;

  return (
    <div>
      {/* Filter input */}
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
      <div className={styles.filterResults}>
        {filteredRoots.map((node) => (
          <TreeNode
            key={node.fullPath}
            node={node}
            depth={0}
            cwd={cwd}
            onOpenFile={onOpenFile}
            onAtMention={onAtMention}
            expandedPaths={effectiveExpanded}
            onToggleExpanded={handleToggleExpanded}
            refreshKey={refreshKey}
            filterQuery={filterQuery.trim() || undefined}
          />
        ))}
        {filteredRoots.length === 0 && (
          <div className={styles.noResults}>
            {filterQuery.trim() ? "No matches" : "No files found"}
          </div>
        )}
      </div>
    </div>
  );
}
