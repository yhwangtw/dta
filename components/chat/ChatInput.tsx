"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef, KeyboardEvent } from "react";
import { COMPOSITION_END_ENTER_GRACE_MS, buildSlashItems } from "./chat-input-constants";
import { SlashMenu, filterSlashItems } from "./SlashMenu";
import { loadDraft, saveDraft, clearDraft, loadHistory, saveHistory } from "@/lib/composer-persistence";
import { shouldFencePaste, fencePaste } from "@/lib/paste-fence";
import { showToast } from "@/hooks/useToast";
import { FileMentionMenu, type FileMentionItem } from "./FileMentionMenu";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import { usePrompts } from "@/hooks/usePrompts";
import { ModelSelector } from "./ModelSelector";
import { ThinkingSelector } from "./ThinkingSelector";
import { ToolPresetSelector } from "./ToolPresetSelector";
import { useChatInputControls } from "@/hooks/useChatInputControls";
import styles from "./ChatInput.module.css";
import { useI18n } from "@/lib/i18n";

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

interface Props {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onAbort: () => void;
  onSteer?: (message: string, images?: AttachedImage[]) => void;
  onFollowUp?: (message: string, images?: AttachedImage[]) => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  onModelChange?: (provider: string, modelId: string) => void;
  onCompact?: () => void;
  onAbortCompaction?: () => void;
  isCompacting?: boolean;
  compactError?: string | null;
  toolPreset?: "none" | "default" | "full";
  onToolPresetChange?: (preset: "none" | "default" | "full") => void;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
  /** Project cwd — enables the `@file` mention autocomplete. */
  cwd?: string | null;
  /** Stable per-session key for draft/history persistence. */
  persistKey?: string | null;
}

/**
 * Find an in-progress `@` mention before the caret: the `@` must be at the
 * start or after whitespace, and the token after it must not contain
 * whitespace (unless quoted with `"`, for paths with spaces).
 */
export function detectFileMention(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const token = before.slice(at + 1);
  if (token.startsWith('"')) {
    const inner = token.slice(1);
    if (inner.includes('"')) return null; // quote closed — mention finished
    return { start: at, query: inner };
  }
  if (/\s/.test(token)) return null;
  return { start: at, query: token };
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  /** Forcefully replace the entire input value (no-op on identical value). */
  setText: (text: string) => void;
  addImages: (files: File[]) => void;
}



export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, onSteer, onFollowUp, isStreaming, model, modelNames, modelList, onModelChange,
  onCompact, onAbortCompaction, isCompacting, compactError, toolPreset, onToolPresetChange,
  thinkingLevel, onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap,
  retryInfo,
  soundEnabled, onSoundToggle,
  cwd,
  persistKey,
}: Props, ref) {
  const { t } = useI18n();
  const { prompts } = usePrompts();
  const slashItems = useMemo(() => buildSlashItems(prompts), [prompts]);
  const [value, setValue] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // ── @file mention autocomplete ──
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionItems, setMentionItems] = useState<FileMentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionSeqRef = useRef(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const lastEscAtRef = useRef(0);

  useImperativeHandle(ref, () => ({
    insertIfEmpty(text: string) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (current.trim()) return;
      setValue(text);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    setText(text: string) {
      // Forcefully replace the entire input value. Used by quick-action
      // buttons (e.g. tGD phase chips) so clicking a different phase
      // swaps the slash command rather than appending to the existing one.
      setValue(text);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        // Move cursor to end of the new text.
        const end = ta.value.length;
        ta.setSelectionRange(end, end);
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    insertText(text: string) {
      const ta = textareaRef.current;
      if (!ta) {
        setValue((v) => v + (v ? " " : "") + text);
        return;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
      const newVal = before + sep + text + after;
      setValue(newVal);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = start + sep.length + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    addImages(files: File[]) {
      processImageFiles(files);
    },
  }));

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const newImages = await Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<AttachedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // result is "data:<mime>;base64,<data>"
              const base64 = result.split(",")[1];
              resolve({ data: base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setAttachedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  // Fetch @file suggestions: directory listing for empty/`dir/` queries
  // (drill-down), fuzzy filename search otherwise. Debounced; stale responses
  // dropped via a sequence counter.
  useEffect(() => {
    if (!mention || !cwd) { setMentionItems([]); return; }
    const seq = ++mentionSeqRef.current;
    const q = mention.query;
    const timer = setTimeout(async () => {
      try {
        let items: FileMentionItem[] = [];
        const slash = q.lastIndexOf("/");
        if (q === "" || q.endsWith("/") || slash >= 0) {
          // List <cwd>/<dirPart> and filter by the segment being typed.
          const dirPart = slash >= 0 ? q.slice(0, slash) : "";
          const namePart = slash >= 0 ? q.slice(slash + 1).toLowerCase() : q.toLowerCase();
          const abs = dirPart ? joinFilePath(cwd, dirPart) : cwd;
          const res = await fetch(`/api/files/${encodeFilePathForApi(abs)}?type=list`);
          if (res.ok) {
            const d = await res.json() as { entries?: { name: string; isDir: boolean }[] };
            items = (d.entries ?? [])
              .filter((e) => !namePart || e.name.toLowerCase().includes(namePart))
              .map((e) => ({ name: e.name, relative: dirPart ? `${dirPart}/${e.name}` : e.name, isDir: e.isDir }));
          }
        } else {
          const res = await fetch(`/api/files/search?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`);
          if (res.ok) {
            const d = await res.json() as { results?: { name: string; relative: string; isDir: boolean }[] };
            items = (d.results ?? []).map((r) => ({ name: r.name, relative: r.relative, isDir: r.isDir }));
          }
        }
        if (mentionSeqRef.current === seq) {
          setMentionItems(items.slice(0, 15));
          setMentionIndex(0);
        }
      } catch {
        if (mentionSeqRef.current === seq) setMentionItems([]);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [mention, cwd]);

  const applyMention = useCallback((item: FileMentionItem) => {
    const ta = textareaRef.current;
    if (!ta || !mention) return;
    const caret = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, mention.start);
    const after = ta.value.slice(caret);
    // Dirs drill down (keep the menu open); files finish the mention.
    const inserted = item.isDir
      ? `@${item.relative}/`
      : item.relative.includes(" ") ? `@"${item.relative}" ` : `@${item.relative} `;
    const newVal = before + inserted + after;
    setValue(newVal);
    if (item.isDir) {
      setMention({ start: mention.start, query: `${item.relative}/` });
    } else {
      setMention(null);
      setMentionItems([]);
    }
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    });
  }, [mention]);

  // Sent-message history — ArrowUp in an empty input recalls previous
  // messages, ArrowDown walks back toward the blank prompt (CLI muscle memory).
  // Persisted per session so it survives reloads.
  const historyRef = useRef<string[]>([]);
  const historyPosRef = useRef(-1); // -1 = not navigating
  const pushHistory = useCallback((msg: string) => {
    if (!msg) return;
    const h = historyRef.current;
    if (h[h.length - 1] !== msg) h.push(msg);
    if (h.length > 50) h.shift();
    historyPosRef.current = -1;
    saveHistory(persistKey ?? null, h);
  }, [persistKey]);

  // ── Draft persistence ──────────────────────────────────────────────────
  // Restore draft + history when the session changes; save the draft
  // (debounced) as it's typed. A refresh or session switch no longer eats
  // whatever was mid-composition.
  useEffect(() => {
    setValue(loadDraft(persistKey ?? null));
    historyRef.current = loadHistory(persistKey ?? null);
    historyPosRef.current = -1;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      }
    });
  }, [persistKey]);

  useEffect(() => {
    const timer = setTimeout(() => saveDraft(persistKey ?? null, value), 300);
    return () => clearTimeout(timer);
  }, [value, persistKey]);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg && !attachedImages.length) return;
    if (isStreaming) return;
    onSend(msg, attachedImages.length ? attachedImages : undefined);
    pushHistory(msg);
    setValue("");
    clearDraft(persistKey ?? null);
    clearImages();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachedImages, isStreaming, onSend, clearImages, pushHistory, persistKey]);

  const sendQueued = useCallback((mode: "steer" | "followup") => {
    const msg = value.trim();
    if (!msg && !attachedImages.length) return;
    if (mode === "steer" && onSteer) {
      onSteer(msg, attachedImages.length ? attachedImages : undefined);
    } else if (mode === "followup" && onFollowUp) {
      onFollowUp(msg, attachedImages.length ? attachedImages : undefined);
    }
    pushHistory(msg);
    setValue("");
    clearDraft(persistKey ?? null);
    clearImages();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, attachedImages, onSteer, onFollowUp, clearImages, pushHistory, persistKey]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent;
      const recentlyComposed = Date.now() - lastCompositionEndAtRef.current < COMPOSITION_END_ENTER_GRACE_MS;
      const isComposing =
        isComposingRef.current ||
        nativeEvent.isComposing ||
        nativeEvent.keyCode === 229;

      // @file mention menu navigation. Skipped mid-IME-composition: Enter
      // there commits the composed text, and arrows move between candidates.
      if (!isComposing && mention && mentionItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % mentionItems.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
          return;
        }
        if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
          e.preventDefault();
          if (mentionItems[mentionIndex]) applyMention(mentionItems[mentionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMention(null);
          setMentionItems([]);
          return;
        }
      }

      // Slash menu navigation (same IME rule as the mention menu above)
      if (!isComposing && showSlashMenu) {
        const filtered = filterSlashItems(slashItems, slashFilter);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashSelectedIndex((i) => (i + 1) % filtered.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (filtered[slashSelectedIndex]) {
            // Insert the item's payload (tGD `/name `, or a template's body),
            // don't auto-send.
            setValue(filtered[slashSelectedIndex].insert);
            setShowSlashMenu(false);
            setSlashFilter("");
            setSlashSelectedIndex(0);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSlashMenu(false);
          setSlashFilter("");
          setSlashSelectedIndex(0);
          return;
        }
      }

      // Esc-Esc while a run is streaming aborts it (CLI muscle memory).
      // Two presses within 600ms — a single Esc only arms it (and shows a
      // hint), so stray Escapes can't kill a run. Open menus consumed their
      // Escape above.
      if (e.key === "Escape" && isStreaming && !isComposing) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastEscAtRef.current < 600) {
          lastEscAtRef.current = 0;
          onAbort();
        } else {
          lastEscAtRef.current = now;
          showToast(t("input.escAbortHint"));
        }
        return;
      }

      // History recall: only when not composing and the input is empty or
      // already mid-recall, so normal multi-line cursor movement is untouched.
      if (!isComposing && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const h = historyRef.current;
        const navigating = historyPosRef.current !== -1;
        if (e.key === "ArrowUp" && h.length > 0 && (value === "" || navigating)) {
          e.preventDefault();
          const pos = navigating ? Math.max(0, historyPosRef.current - 1) : h.length - 1;
          historyPosRef.current = pos;
          setValue(h[pos]);
          return;
        }
        if (e.key === "ArrowDown" && navigating) {
          e.preventDefault();
          const pos = historyPosRef.current + 1;
          if (pos >= h.length) {
            historyPosRef.current = -1;
            setValue("");
          } else {
            historyPosRef.current = pos;
            setValue(h[pos]);
          }
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey && (isComposing || recentlyComposed)) {
        if (recentlyComposed) e.preventDefault();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming && (onSteer || onFollowUp)) {
          // Default Enter sends as steer if available, else followup
          sendQueued(onSteer ? "steer" : "followup");
        } else {
          handleSend();
        }
      }
    },
    [isStreaming, onSteer, onFollowUp, sendQueued, handleSend, showSlashMenu, slashFilter, slashSelectedIndex, slashItems, value, mention, mentionItems, mentionIndex, applyMention, onAbort, t]
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;

    const val = ta.value;

    // @file mention takes priority (it may contain "/" for drill-down, which
    // must not trigger the slash-command menu).
    if (cwd) {
      const m = detectFileMention(val, ta.selectionStart ?? val.length);
      setMention(m);
      if (m) {
        setShowSlashMenu(false);
        setSlashFilter("");
        return;
      }
    }

    // Slash commands are whole-message (selection replaces the entire input),
    // so only a "/" at the very start opens the menu — a mid-text "/" is a path.
    if (val.startsWith("/")) {
      const filterText = val.slice(1);
      if (filterText.includes(" ")) {
        setShowSlashMenu(false);
        setSlashFilter("");
      } else {
        setShowSlashMenu(true);
        setSlashFilter(filterText);
        // Keep the selection inside the narrowed list — a stale index past the
        // end leaves nothing highlighted and Enter a no-op.
        const count = filterSlashItems(slashItems, filterText).length;
        setSlashSelectedIndex((i) => (filterText === "" ? 0 : Math.min(i, Math.max(0, count - 1))));
      }
    } else {
      setShowSlashMenu(false);
      setSlashFilter("");
    }
  }, [cwd, slashItems]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length) {
      e.preventDefault();
      const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
      processImageFiles(files);
      return;
    }
    // Code-shaped multiline pastes get fenced so the transcript's markdown
    // render doesn't mangle them (conservative heuristic — prose is untouched).
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (shouldFencePaste(text)) {
      e.preventDefault();
      const ta = textareaRef.current;
      const fenced = fencePaste(text);
      if (!ta) { setValue((v) => v + fenced); return; }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const newVal = ta.value.slice(0, start) + fenced + ta.value.slice(end);
      setValue(newVal);
      requestAnimationFrame(() => {
        ta.setSelectionRange(start + fenced.length, start + fenced.length);
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    }
  }, [processImageFiles]);



  // Consolidate model/thinking/tool-preset state derivations
  const { modelOptions, modelsByProvider, currentName } = useChatInputControls({
    model,
    modelNames,
    modelList,
    onModelChange,
    thinkingLevel,
    onThinkingLevelChange,
    availableThinkingLevels,
    thinkingLevelMap,
    toolPreset,
    onToolPresetChange,
  });

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setShowSlashMenu(false);
        setSlashFilter("");
        setSlashSelectedIndex(0);
      }
      // Close the @file menu on outside clicks (its items handle mousedown).
      if (!(e.target as HTMLElement).closest?.('[data-testid="file-mention-menu"]') &&
          textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setMention(null);
        setMentionItems([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  return (
    <div className={styles.container}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          processImageFiles(files);
          e.target.value = "";
        }}
      />
      <div className={styles.innerWrapper}>
        {/* Retry banner */}
        {retryInfo && (
          <div className={styles.retryBanner}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.retryIcon}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Retrying ({retryInfo.attempt}/{retryInfo.maxAttempts})…{retryInfo.errorMessage && <span className={styles.retryErrorText}>— {retryInfo.errorMessage}</span>}
          </div>
        )}
        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div className={styles.imagePreviewRow}>
            {attachedImages.map((img, i) => (
              <div key={i} className={styles.imagePreviewItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  className={styles.imagePreviewImg}
                />
                <button
                  onClick={() => removeImage(i)}
                  className={styles.imageRemoveButton}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main input */}
        <div
          className={isStreaming && (onSteer || onFollowUp) ? styles.inputWrapperStreaming : styles.inputWrapperNormal}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
              lastCompositionEndAtRef.current = Date.now();
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={
              isStreaming && (onSteer || onFollowUp)
                ? t("input.steerHint")
                : isStreaming ? t("input.agentRunning")
                : t("input.message")
            }
            rows={1}
            className={styles.textarea}
          />

          {/* @file mention menu */}
          <FileMentionMenu
            show={!!mention}
            items={mentionItems}
            selectedIndex={mentionIndex}
            onSelect={applyMention}
            onHover={setMentionIndex}
          />

          {/* Slash command menu */}
          <SlashMenu
            show={showSlashMenu}
            items={slashItems}
            filter={slashFilter}
            selectedIndex={slashSelectedIndex}
            onSelect={(insert) => {
              setValue(insert);
              setShowSlashMenu(false);
              setSlashFilter("");
              setSlashSelectedIndex(0);
              textareaRef.current?.focus();
            }}
            onHover={setSlashSelectedIndex}
            onLeave={() => setSlashSelectedIndex(-1)}
            onClose={() => setShowSlashMenu(false)}
          />

          {isStreaming ? (
            <div className={styles.streamingActions}>
              {onSteer && (
                <button
                  onClick={() => sendQueued("steer")}
                  disabled={!value.trim() && !attachedImages.length}
                  title="打断 Agent 当前运行，立即注入消息"
                  className={(value.trim() || attachedImages.length) ? styles.steerButtonActive : styles.steerButtonDisabled}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 1 L9 5 L5 9" /><line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  Steer
                </button>
              )}
              {onFollowUp && (
                <button
                  onClick={() => sendQueued("followup")}
                  disabled={!value.trim() && !attachedImages.length}
                  title="在 Agent 完成后排队发送"
                  className={(value.trim() || attachedImages.length) ? styles.followUpButtonActive : styles.followUpButtonDisabled}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="1" x2="5" y2="6" /><polyline points="2.5 3.5 5 1 7.5 3.5" />
                    <line x1="2" y1="9" x2="8" y2="9" />
                  </svg>
                  Follow-up
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim() && !attachedImages.length}
              className={(value.trim() || attachedImages.length) ? styles.sendButtonActive : styles.sendButtonDisabled}
              onMouseDown={(e) => { if (value.trim() || attachedImages.length) e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="7" x2="11" y2="7" />
                <polyline points="7.5 3 12 7 7.5 11" />
              </svg>
              {t("input.send")}
            </button>
          )}
        </div>

        {/* Bottom bar: left | center (context) | right */}
        <div className={styles.bottomBar}>

          {/* LEFT: attach + model selector (idle) or steer/followup toggle (streaming) */}
          <div className={styles.bottomBarLeft}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach image"
              className={isStreaming ? styles.attachButtonDisabled : styles.attachButtonEnabled}
              style={{ color: attachedImages.length ? "var(--accent)" : "var(--text-muted)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            {/* Model selector — visible always, disabled during streaming */}
            <ModelSelector
              modelOptions={modelOptions}
              modelsByProvider={modelsByProvider}
              currentName={currentName}
              model={model}
              isStreaming={isStreaming}
              onModelChange={onModelChange}
            />
          </div>

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* RIGHT: thinking + tools preset + compact + sound (idle) | Stop + sound (streaming) */}
          <div className={styles.bottomBarRight}>
            <ThinkingSelector
              thinkingLevel={thinkingLevel}
              thinkingLevelMap={thinkingLevelMap}
              availableThinkingLevels={availableThinkingLevels}
              isStreaming={isStreaming}
              onThinkingLevelChange={onThinkingLevelChange}
            />
            <ToolPresetSelector
              toolPreset={toolPreset}
              isStreaming={isStreaming}
              onToolPresetChange={onToolPresetChange}
            />

            {!isStreaming && onCompact && (
              <div className={styles.compactWrapper}>
                {compactError && (
                  <div className={styles.compactErrorTooltip}>
                    {compactError}
                  </div>
                )}
                <button
                  onClick={isCompacting ? onAbortCompaction : onCompact}
                  disabled={isStreaming && !isCompacting}
                  className={isCompacting ? styles.compactButtonCompacting : (isStreaming && !isCompacting) ? styles.compactButtonDisabled : styles.compactButtonIdle}
                  title={isCompacting ? "停止压缩" : "压缩上下文"}
                >
                  {isCompacting ? (
                    <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" /></svg>Compacting…</>
                  ) : (
                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                      <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                    </svg>Compact</>
                  )}
                </button>
              </div>
            )}

            {isStreaming && (
              <button
                onClick={onAbort}
                title="停止 Agent"
                className={styles.stopButton}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
                </svg>
                Stop
              </button>
            )}

            {onSoundToggle !== undefined && (
              <button
                onClick={onSoundToggle}
                title={soundEnabled ? "关闭完成提示音" : "开启完成提示音"}
                className={soundEnabled ? styles.soundButtonEnabled : styles.soundButtonDisabled}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = soundEnabled ? "var(--text-muted)" : "var(--text-dim)";
                  e.currentTarget.style.opacity = soundEnabled ? "1" : "0.55";
                }}
              >
                {soundEnabled ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
});