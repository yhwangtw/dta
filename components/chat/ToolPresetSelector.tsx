"use client";

import React, { useState, useRef, useEffect } from "react";
import { TOOL_PRESETS, TOOL_PRESET_MAP } from "./chat-input-constants";
import { useI18n, type MsgKey } from "@/lib/i18n";
import styles from "./ComposerSelector.module.css";

type ToolPresetLabel = typeof TOOL_PRESETS[number];

const TOOL_LABEL_KEYS: Record<ToolPresetLabel, MsgKey> = {
  off: "input.tools.off",
  default: "input.tools.default",
  full: "input.tools.full",
};

const TOOL_DESC_KEYS: Record<ToolPresetLabel, MsgKey> = {
  off: "input.toolsDesc.off",
  default: "input.toolsDesc.default",
  full: "input.toolsDesc.full",
};

interface ToolPresetSelectorProps {
  toolPreset?: "none" | "default" | "full";
  isStreaming: boolean;
  onToolPresetChange?: (preset: "none" | "default" | "full") => void;
}

export function ToolPresetSelector({
  toolPreset,
  isStreaming,
  onToolPresetChange,
}: ToolPresetSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = (
    Object.entries(TOOL_PRESET_MAP)
      .find(([, value]) => value === (toolPreset ?? "default"))?.[0]
    ?? "default"
  ) as ToolPresetLabel;

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

  if (!onToolPresetChange) return null;

  return (
    <div ref={ref} className={styles.root}>
      <button
        onClick={() => !isStreaming && setOpen((v) => !v)}
        disabled={isStreaming}
        type="button"
        aria-label={t("input.toolsTitle")}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t("input.toolsTitle")}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span>{t(TOOL_LABEL_KEYS[selectedLabel])}</span>
      </button>
      {open && (
        <div className={`${styles.panel} ${styles.panelAbsolute}`} role="listbox" aria-label={t("input.toolsTitle")}>
          {TOOL_PRESETS.map((lvl) => {
            const preset = TOOL_PRESET_MAP[lvl];
            const isActive = (toolPreset ?? "default") === preset;
            const desc = t(TOOL_DESC_KEYS[lvl]);
            return (
              <button
                key={lvl}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => { setOpen(false); if (!isActive) onToolPresetChange(preset); }}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
              >
                {isActive
                  ? <svg className={styles.check} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                  : <span className={styles.checkSpacer} />}
                <span className={styles.optionLabel}>{t(TOOL_LABEL_KEYS[lvl])}</span>
                <span className={styles.description}>{desc}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
