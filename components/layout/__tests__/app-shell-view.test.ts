import { describe, expect, it } from "vitest";
import { resolveAppShellCenterView } from "../app-shell-view";

describe("resolveAppShellCenterView", () => {
  it("keeps the center loading until session initialization finishes", () => {
    expect(resolveAppShellCenterView({
      initialized: false,
      hasSelectedSession: false,
      hasNewSessionCwd: false,
      hasActiveCwd: false,
    })).toBe("loading");
  });

  it("shows an existing session before other workspace states", () => {
    expect(resolveAppShellCenterView({
      initialized: true,
      hasSelectedSession: true,
      hasNewSessionCwd: true,
      hasActiveCwd: true,
    })).toBe("session");
  });

  it("opens a new composer only after New explicitly supplies a cwd", () => {
    expect(resolveAppShellCenterView({
      initialized: true,
      hasSelectedSession: false,
      hasNewSessionCwd: true,
      hasActiveCwd: true,
    })).toBe("new");
  });

  it("keeps an explicit new composer visible while a stale session route clears", () => {
    expect(resolveAppShellCenterView({
      initialized: false,
      hasSelectedSession: false,
      hasNewSessionCwd: true,
      hasActiveCwd: true,
    })).toBe("new");
  });

  it("keeps a selected project on the session-or-New placeholder", () => {
    expect(resolveAppShellCenterView({
      initialized: true,
      hasSelectedSession: false,
      hasNewSessionCwd: false,
      hasActiveCwd: true,
    })).toBe("project");
  });

  it("shows onboarding after initialization when no workspace is selected", () => {
    expect(resolveAppShellCenterView({
      initialized: true,
      hasSelectedSession: false,
      hasNewSessionCwd: false,
      hasActiveCwd: false,
    })).toBe("welcome");
  });
});
