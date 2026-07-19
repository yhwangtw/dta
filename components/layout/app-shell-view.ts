export type AppShellCenterView = "loading" | "session" | "new" | "project" | "welcome";

interface AppShellCenterState {
  initialized: boolean;
  hasSelectedSession: boolean;
  hasNewSessionCwd: boolean;
  hasActiveCwd: boolean;
}

/** Decide which center-panel experience should be visible for shell state. */
export function resolveAppShellCenterView(state: AppShellCenterState): AppShellCenterView {
  if (state.hasSelectedSession) return "session";
  if (state.hasNewSessionCwd) return "new";
  if (!state.initialized) return "loading";
  if (state.hasActiveCwd) return "project";
  return "welcome";
}
