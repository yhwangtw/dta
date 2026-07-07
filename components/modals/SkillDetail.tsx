"use client";

import { useEffect, useState } from "react";
import type { Skill } from "./skills-config-types";
import { sourceLabel, shortenPath } from "./skills-config-types";
import { MarkdownBody } from "@/components/chat/MarkdownBody";
import styles from "./SkillDetail.module.css";

export function Toggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const toggleClass = loading
    ? (enabled ? styles.toggleLoading : styles.toggleLoadingDisabled)
    : (enabled ? styles.toggleEnabled : styles.toggleDisabled);

  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={
        enabled
          ? "Visible in model prompt — click to disable"
          : "Hidden from model prompt — click to enable"
      }
      className={`${styles.toggle} ${toggleClass}`}
    >
      <span
        className={`${styles.toggleKnob} ${enabled ? styles.toggleKnobOn : styles.toggleKnobOff}`}
      />
    </button>
  );
}

export function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
  saveError,
}: {
  skill: Skill;
  cwd: string;
  onToggle: (skill: Skill) => void;
  toggling: boolean;
  saveError: string | null;
}) {
  const label = sourceLabel(skill);
  const enabled = !skill.disableModelInvocation;

  // SKILL.md body, fetched lazily per selected skill. The component remounts
  // per skill (key={filePath} at the call site), so plain state is enough.
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/skills?cwd=${encodeURIComponent(cwd)}&content=${encodeURIComponent(skill.filePath)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { content?: string };
        if (!cancelled) setContent(data.content ?? "");
      } catch (e) {
        if (!cancelled) setContentError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [cwd, skill.filePath]);

  function displayPath(p: string): string {
    if (label === "project" && p.startsWith(cwd)) {
      const rel = p.slice(cwd.length).replace(/^[/\\]/, "");
      return `./${rel}`;
    }
    return shortenPath(p);
  }

  return (
    <div className={styles.container}>
      {/* Path + tag + toggle */}
      <div className={styles.pathRow}>
        <span
          className={`${styles.tag} ${label === "project" ? styles.tagProject : styles.tagGlobal}`}
        >
          {label}
        </span>
        <span className={styles.pathText}>
          {displayPath(skill.filePath)}
        </span>
        <Toggle
          enabled={enabled}
          loading={toggling}
          onToggle={() => onToggle(skill)}
        />
        {saveError && (
          <span className={styles.errorText}>
            {saveError}
          </span>
        )}
      </div>

      <div className={styles.fieldSection}>
        <span className={styles.fieldLabel}>
          Name
        </span>
        <span className={styles.fieldValueMono}>
          {skill.name}
        </span>
      </div>

      <div className={styles.fieldSection}>
        <span className={styles.fieldLabel}>
          Description
        </span>
        <span className={styles.fieldValueText}>
          {skill.description}
        </span>
      </div>

      <div className={styles.fieldSection}>
        <span className={styles.fieldLabel}>
          Content
        </span>
        {contentError ? (
          <span className={styles.errorText}>{contentError}</span>
        ) : content === null ? (
          <span className={styles.fieldValueText}>Loading…</span>
        ) : content.trim() === "" ? (
          <span className={styles.fieldValueText}>(empty — frontmatter only)</span>
        ) : (
          <div className={styles.contentBox}>
            <MarkdownBody className="markdown-file-preview">{content}</MarkdownBody>
          </div>
        )}
      </div>
    </div>
  );
}
