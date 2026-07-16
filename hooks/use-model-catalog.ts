"use client";

import { useState, useEffect } from "react";

export interface ModelRef {
  provider: string;
  modelId: string;
}

/**
 * Loads the model catalog (/api/models): display names, selectable list,
 * thinking-level metadata, and — for new sessions — the default model
 * pre-selection. `overrideSetNewSessionModel` lets the caller intercept the
 * selection (parallel panes share one selection through the parent).
 */
export function useModelCatalog(
  isNew: boolean,
  modelsRefreshKey: number | undefined,
  overrideSetNewSessionModel?: (model: ModelRef | null) => void,
  sessionId?: string | null,
  cwd?: string | null,
) {
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<Record<string, Record<string, string | null>>>({});
  const [newSessionModel, setNewSessionModelState] = useState<ModelRef | null>(null);
  const setNewSessionModel = overrideSetNewSessionModel ?? setNewSessionModelState;

  useEffect(() => {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (cwd) params.set("cwd", cwd);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    fetch(`/api/models${suffix}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((d: { models: Record<string, string>; modelList?: { id: string; name: string; provider: string }[]; defaultModel?: ModelRef | null; thinkingLevels?: Record<string, string[]>; thinkingLevelMaps?: Record<string, Record<string, string | null>> }) => {
      setModelNames(d.models);
      if (d.thinkingLevels) setModelThinkingLevels(d.thinkingLevels);
      if (d.thinkingLevelMaps) setModelThinkingLevelMaps(d.thinkingLevelMaps);
      if (d.modelList) {
        setModelList(d.modelList);
        if (isNew && d.modelList.length > 0) {
          const def = d.defaultModel;
          const match = def && d.modelList.find((m) => m.id === def.modelId && m.provider === def.provider);
          const selected = match
            ? { provider: match.provider, modelId: match.id }
            : { provider: d.modelList[0].provider, modelId: d.modelList[0].id };
          setNewSessionModel(selected);
        }
      }
    }).catch(() => {});
  }, [isNew, modelsRefreshKey, setNewSessionModel, sessionId, cwd]);

  return { modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, newSessionModel, setNewSessionModel };
}
