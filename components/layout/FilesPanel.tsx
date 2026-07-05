"use client";

import { FileExplorer } from "../sidebar/FileExplorer";
import { useI18n } from "@/lib/i18n";
import s from "./FilesPanel.module.css";

interface Props {
  cwd: string | null;
  onOpenFile: (filePath: string, fileName: string) => void;
  onAtMention?: (relativePath: string) => void;
  refreshKey?: number;
}

/**
 * Full-height file tree panel — the Files view of the contextual panel.
 * Splitting this out of SessionSidebar gives both the session list and the
 * tree the whole column instead of fighting over one.
 */
export function FilesPanel({ cwd, onOpenFile, onAtMention, refreshKey }: Props) {
  const { t } = useI18n();

  if (!cwd) {
    return (
      <div className={s.empty}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span>{t("sidebar.selectProjectFirst")}</span>
      </div>
    );
  }

  const shortCwd = cwd.length > 34 ? `…${cwd.slice(-33)}` : cwd;

  return (
    <div className={s.container}>
      <div className={`${s.header} chrome-mono`} title={cwd}>
        {shortCwd}
      </div>
      <div className={s.tree}>
        <FileExplorer cwd={cwd} onOpenFile={onOpenFile} refreshKey={refreshKey} onAtMention={onAtMention} />
      </div>
    </div>
  );
}
