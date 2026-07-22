"use client";

import type {
  WebExtensionUIDialogRequest,
  WebExtensionUIEvent,
  WebExtensionUIWidgetPlacement,
} from "@/lib/web-extension-ui-types";
import { isWebExtensionUIDialogRequest } from "@/lib/web-extension-ui-types";

export interface ExtensionUIState {
  dialogs: WebExtensionUIDialogRequest[];
  statuses: Record<string, string>;
  widgets: Record<string, { lines: string[]; placement: WebExtensionUIWidgetPlacement }>;
}

export const initialExtensionUIState: ExtensionUIState = {
  dialogs: [],
  statuses: {},
  widgets: {},
};

export type ExtensionUIAction =
  | { type: "event"; event: WebExtensionUIEvent }
  | { type: "reset" };

export function extensionUIReducer(state: ExtensionUIState, action: ExtensionUIAction): ExtensionUIState {
  if (action.type === "reset") return initialExtensionUIState;
  const event = action.event;

  if (event.type === "extension_ui_closed") {
    return { ...state, dialogs: state.dialogs.filter((dialog) => dialog.id !== event.id) };
  }
  if (isWebExtensionUIDialogRequest(event)) {
    if (state.dialogs.some((dialog) => dialog.id === event.id)) return state;
    return { ...state, dialogs: [...state.dialogs, event] };
  }
  if (event.method === "setStatus") {
    const statuses = { ...state.statuses };
    if (event.statusText === undefined) delete statuses[event.statusKey];
    else statuses[event.statusKey] = event.statusText;
    return { ...state, statuses };
  }
  if (event.method === "setWidget") {
    const widgets = { ...state.widgets };
    if (event.widgetLines === undefined) delete widgets[event.widgetKey];
    else widgets[event.widgetKey] = {
      lines: event.widgetLines,
      placement: event.widgetPlacement ?? "aboveEditor",
    };
    return { ...state, widgets };
  }
  return state;
}
