"use client";

import { useEffect, useRef } from "react";
import styles from "./ToolPanel.module.css";

export interface ToolEntry {
  name: string;
  description: string;
  active: boolean;
}

export type ToolPreset = "none" | "default" | "full";
export const PRESET_NONE: string[] = [];
export const PRESET_DEFAULT: string[] = ["read", "bash", "edit", "write", "ask_user"];
export const PRESET_FULL: string[] = ["bash", "read", "edit", "write", "grep", "find", "ls", "ask_user"];

export function getPresetFromTools(tools: ToolEntry[]): ToolPreset {
  const active = tools.filter(t => t.active).map(t => t.name).sort().join(",");
  if (active === "") return "none";
  if (active === [...PRESET_DEFAULT].sort().join(",")) return "default";
  if (active === [...PRESET_FULL].sort().join(",")) return "full";
  return "default"; // closest match
}

interface Props {
  tools: ToolEntry[];
  onPreset: (preset: ToolPreset, toolNames: string[]) => void;
  onClose: () => void;
}

const PRESETS: { id: ToolPreset; label: string; desc: string; tools: string[] }[] = [
  { id: "none",    label: "Off",  desc: "No tools",                                tools: PRESET_NONE },
  { id: "default", label: "Low",  desc: "read · bash · edit · write · ask",              tools: PRESET_DEFAULT },
  { id: "full",    label: "High", desc: "read · bash · edit · write · grep · find · ls · ask", tools: PRESET_FULL },
];

export function ToolPanel({ tools, onPreset, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const current = getPresetFromTools(tools);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const currentIndex = PRESETS.findIndex(p => p.id === current);

  return (
    <div ref={panelRef} className={styles.panel}>
      {/* Segmented control */}
      <div className={styles.segmentedControl}>
        {PRESETS.map((preset) => {
          const isActive = current === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => { onPreset(preset.id, preset.tools); onClose(); }}
              className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ""}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Description of current selection */}
      <div className={styles.description}>
        {currentIndex >= 0 ? PRESETS[currentIndex].desc || "No tools enabled" : ""}
        {current === "none" && <span> — agent will not use any tools</span>}
      </div>

      {/* Track bar */}
      <div className={styles.trackBar}>
        {PRESETS.map((_, i) => (
          <div
            key={i}
            className={`${styles.trackSegment} ${i <= currentIndex ? styles.trackSegmentActive : ""}`}
          />
        ))}
      </div>

      <div className={styles.note}>
        takes effect on next turn
      </div>
    </div>
  );
}
