"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
}

// ============================================================================
// Module-level store — one shared list so the composer's slash menu and the
// management modal always agree (editing a template in the modal updates the
// menu live). Same pattern as useToast's global store.
// ============================================================================

let prompts: PromptTemplate[] = [];
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): PromptTemplate[] {
  return prompts;
}
const EMPTY: PromptTemplate[] = [];
function getServerSnapshot(): PromptTemplate[] {
  return EMPTY;
}

async function load(force = false): Promise<void> {
  if (loaded && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) {
        const data = await res.json() as { prompts?: PromptTemplate[] };
        prompts = data.prompts ?? [];
        loaded = true;
        emit();
      }
    } catch {
      // best-effort
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function savePrompt(input: { id?: string; name: string; body: string }): Promise<void> {
  try {
    const res = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const data = await res.json() as { prompts?: PromptTemplate[] };
      prompts = data.prompts ?? prompts;
      emit();
    }
  } catch {
    await load(true);
  }
}

async function deletePrompt(id: string): Promise<void> {
  // optimistic
  prompts = prompts.filter((p) => p.id !== id);
  emit();
  try {
    const res = await fetch("/api/prompts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) await load(true);
  } catch {
    await load(true);
  }
}

export function usePrompts() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { void load(); }, []);
  const savePromptCb = useCallback((input: { id?: string; name: string; body: string }) => savePrompt(input), []);
  const deletePromptCb = useCallback((id: string) => deletePrompt(id), []);
  const reload = useCallback(() => load(true), []);
  return { prompts: list, savePrompt: savePromptCb, deletePrompt: deletePromptCb, reload };
}
