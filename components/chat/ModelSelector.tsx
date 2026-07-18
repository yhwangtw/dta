"use client";

import React, { useState, useRef, useEffect } from "react";

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

interface ModelSelectorProps {
  modelOptions: ModelOption[];
  modelsByProvider: { provider: string; options: ModelOption[] }[];
  currentName: string | null;
  model?: { provider: string; modelId: string } | null;
  isStreaming: boolean;
  onModelChange?: (provider: string, modelId: string) => void;
}

export function ModelSelector({
  modelOptions,
  modelsByProvider,
  currentName,
  model,
  isStreaming,
  onModelChange,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!modelOptions.length || !currentName || !onModelChange) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width });
          setOpen((v) => !v);
        }}
        disabled={isStreaming}
        className={open ? "hover-text" : "bg-none hover-bg-text"}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 12px", height: 32, maxWidth: 220, overflow: "hidden",
          border: "none", borderRadius: "var(--radius-md)",
          color: "var(--text-muted)",
          cursor: isStreaming ? "not-allowed" : "pointer",
          fontSize: "calc(12px * var(--font-scale))", opacity: isStreaming ? 0.5 : 1,
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{currentName}</span>
      </button>
      {open && rect && (() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const bottom = viewportHeight - rect.top + 6;
        const maxH = Math.max(120, Math.min(rect.top - 8, viewportHeight * 0.6));
        return (
          <div ref={panelRef} style={{
            position: "fixed", bottom, left: rect.left,
            zIndex: 500, background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "var(--color-shadow-popup)",
            overflow: "hidden", width: "max-content", minWidth: rect.width, maxHeight: maxH, overflowY: "auto",
          }}>
            {modelsByProvider.map((group, gi) => (
              <div key={group.provider}>
                {modelsByProvider.length > 1 && (
                  <div style={{
                    padding: "6px 12px 4px", fontSize: "calc(10px * var(--font-scale))", fontWeight: 600,
                    color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em",
                    borderTop: gi > 0 ? "1px solid var(--border)" : "none",
                  }}>
                    {group.provider}
                  </div>
                )}
                {group.options.map((opt) => {
                  const isActive = opt.modelId === model?.modelId && opt.provider === model?.provider;
                  return (
                    <button
                      key={`${opt.provider}:${opt.modelId}`}
                      onClick={() => { setOpen(false); if (!isActive) onModelChange(opt.provider, opt.modelId); }}
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
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
