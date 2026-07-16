import { describe, expect, it, vi } from "vitest";
import { bindWebExtensions, trackExtensionProviders } from "../pi-runtime";

describe("Pi Web runtime integration", () => {
  it("tracks successful and failed extension provider registrations", () => {
    const models: Array<{ id: string; name: string; provider: string }> = [];
    const registry = {
      registerProvider(name: string, config: { models?: Array<{ id: string; name: string }> }) {
        if (name === "broken") throw new Error("invalid provider");
        for (const model of config.models ?? []) models.push({ ...model, provider: name });
      },
      unregisterProvider(name: string) {
        for (let i = models.length - 1; i >= 0; i--) if (models[i].provider === name) models.splice(i, 1);
      },
      getAll: () => models,
      getAvailable: () => models.filter((m) => m.id !== "team-large"),
      getProviderDisplayName: (name: string) => name === "team-ai" ? "Team AI" : name,
    };
    const tracker = trackExtensionProviders(registry);
    tracker.discover("team-ai", "/ext/provider.ts");
    tracker.discover("broken", "/ext/broken.ts");

    registry.registerProvider("team-ai", { models: [
      { id: "team-fast", name: "Team Fast" },
      { id: "team-large", name: "Team Large" },
    ] });
    expect(() => registry.registerProvider("broken", { models: [] })).toThrow("invalid provider");

    expect(tracker.snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "team-ai",
        displayName: "Team AI",
        status: "registered",
        modelCount: 2,
        availableModelCount: 1,
        sources: ["/ext/provider.ts"],
      }),
      expect.objectContaining({ name: "broken", status: "error", error: "invalid provider" }),
    ]));
  });

  it("binds the AgentSession extension lifecycle in RPC mode", async () => {
    const bindExtensions = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await bindWebExtensions({ bindExtensions }, onError);

    expect(bindExtensions).toHaveBeenCalledWith(expect.objectContaining({ mode: "rpc", onError }));
  });
});
