"use client";

import React, { useState, useRef, useEffect } from "react";
import { TOOL_PRESETS, TOOL_PRESET_MAP } from "./chat-input-constants";
import { useI18n, type MsgKey } from "@/lib/i18n";

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
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!onToolPresetChange) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => !isStreaming && setOpen((v) => !v)}
        disabled={isStreaming}
        type="button"
        aria-label={t("input.toolsTitle")}
        aria-expanded={open}
        title={t("input.toolsTitle")}
        className={open ? "hover-text" : "bg-none hover-bg-text"}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "8px 12px", height: 32,
          border: "none", borderRadius: 9,
          color: "var(--text-muted)",
          cursor: isStreaming ? "not-allowed" : "pointer",
          fontSize: "calc(12px * var(--font-scale))", opacity: isStreaming ? 0.5 : 1,
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span>{t(TOOL_LABEL_KEYS[selectedLabel])}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", right: 0,
          zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "var(--color-shadow-popup)",
          overflow: "hidden", minWidth: 120,
        }}>
          {TOOL_PRESETS.map((lvl) => {
            const preset = TOOL_PRESET_MAP[lvl];
            const isActive = (toolPreset ?? "default") === preset;
            const desc = t(TOOL_DESC_KEYS[lvl]);
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => { setOpen(false); if (!isActive) onToolPresetChange(preset); }}
                className={isActive ? "bg-selected" : "bg-none hover-bg"}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 12px",
                  border: "none",
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  cursor: "pointer", fontSize: "calc(12px * var(--font-scale))", textAlign: "left",
                  fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap",
                }}
              >
                {isActive
                  ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                  : <span style={{ width: 10, flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{t(TOOL_LABEL_KEYS[lvl])}</span>
                <span style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--text-dim)", marginLeft: 8 }}>{desc}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
