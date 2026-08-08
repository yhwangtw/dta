"use client";

import React, { useState, useRef, useEffect } from "react";
import { THINKING_LEVELS, type ThinkingLevelOption } from "./chat-input-constants";
import { useI18n, type MsgKey } from "@/lib/i18n";
import styles from "./ComposerSelector.module.css";

const THINKING_LABEL_KEYS: Record<ThinkingLevelOption, MsgKey> = {
  auto: "input.thinking.auto",
  off: "input.thinking.off",
  minimal: "input.thinking.minimal",
  low: "input.thinking.low",
  medium: "input.thinking.medium",
  high: "input.thinking.high",
  xhigh: "input.thinking.xhigh",
};

const THINKING_DESC_KEYS: Record<ThinkingLevelOption, MsgKey> = {
  auto: "input.thinkingDesc.auto",
  off: "input.thinkingDesc.off",
  minimal: "input.thinkingDesc.minimal",
  low: "input.thinkingDesc.low",
  medium: "input.thinkingDesc.medium",
  high: "input.thinkingDesc.high",
  xhigh: "input.thinkingDesc.xhigh",
};

interface ThinkingSelectorProps {
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  thinkingLevelMap?: Record<string, string | null> | null;
  availableThinkingLevels?: string[] | null;
  isStreaming: boolean;
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
}

export function ThinkingSelector({
  thinkingLevel,
  thinkingLevelMap,
  availableThinkingLevels,
  isStreaming,
  onThinkingLevelChange,
}: ThinkingSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!onThinkingLevelChange) return null;

  return (
    <div ref={ref} className={styles.root}>
      <button
        onClick={() => !isStreaming && setOpen((v) => !v)}
        disabled={isStreaming}
        type="button"
        aria-label={t("input.thinkingTitle")}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t("input.thinkingTitle")}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z" />
          <line x1="7" y1="18" x2="12" y2="18" />
          <line x1="8" y1="21" x2="11" y2="21" />
        </svg>
        <span>{(() => {
          const lvl = thinkingLevel ?? "auto";
          if (lvl === "auto" || !thinkingLevelMap) return t(THINKING_LABEL_KEYS[lvl]);
          const mapped = thinkingLevelMap[lvl];
          return mapped != null ? mapped : t(THINKING_LABEL_KEYS[lvl]);
        })()}</span>
      </button>
      {open && (
        <div className={`${styles.panel} ${styles.panelAbsolute}`} role="listbox" aria-label={t("input.thinkingTitle")}>
          {THINKING_LEVELS.filter((lvl) => {
            if (!availableThinkingLevels) return true;
            if (lvl === "auto") return true;
            return availableThinkingLevels.includes(lvl);
          }).map((lvl) => {
            const isActive = (thinkingLevel ?? "auto") === lvl;
            const desc = t(THINKING_DESC_KEYS[lvl]);
            const mappedVal = (lvl !== "auto" && thinkingLevelMap) ? thinkingLevelMap[lvl] : undefined;
            const displayLabel = (mappedVal != null && mappedVal !== lvl) ? mappedVal : t(THINKING_LABEL_KEYS[lvl]);
            const showOriginal = mappedVal != null && mappedVal !== lvl;
            return (
              <button
                key={lvl}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => { setOpen(false); if (!isActive) onThinkingLevelChange(lvl); }}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
              >
                {isActive
                  ? <svg className={styles.check} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                  : <span className={styles.checkSpacer} />}
                <span className={styles.optionLabel}>
                  {displayLabel}
                  {showOriginal && <span className={styles.originalLabel}>({lvl})</span>}
                </span>
                <span className={styles.description}>{desc}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
