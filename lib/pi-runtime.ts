import { join } from "node:path";
import {
  AuthStorage,
  ModelRegistry,
  createAgentSessionServices,
  getAgentDir,
  type AgentSessionServices,
  type ExtensionError,
  type LoadExtensionsResult,
  type ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionProviderInfo } from "./extensions-info";

interface ProviderModelLike {
  id: string;
  name: string;
  provider: string;
}

export interface TrackableModelRegistry {
  registerProvider(name: string, config: ProviderConfig): void;
  unregisterProvider(name: string): void;
  getAll(): ProviderModelLike[];
  getAvailable(): ProviderModelLike[];
  getProviderDisplayName(name: string): string;
}

interface TrackedProvider {
  sources: Set<string>;
  status: "registered" | "error";
  error?: string;
}

export class ExtensionProviderTracker {
  private readonly providers = new Map<string, TrackedProvider>();

  constructor(private readonly registry: TrackableModelRegistry) {}

  discover(name: string, source: string): void {
    const existing = this.providers.get(name);
    if (existing) {
      existing.sources.add(source);
      return;
    }
    this.providers.set(name, { sources: new Set([source]), status: "registered" });
  }

  registered(name: string): void {
    const existing = this.providers.get(name) ?? {
      sources: new Set(["<runtime>"]),
      status: "registered" as const,
    };
    existing.status = "registered";
    delete existing.error;
    this.providers.set(name, existing);
  }

  failed(name: string, error: unknown): void {
    const existing = this.providers.get(name) ?? {
      sources: new Set(["<runtime>"]),
      status: "error" as const,
    };
    existing.status = "error";
    existing.error = error instanceof Error ? error.message : String(error);
    this.providers.set(name, existing);
  }

  unregistered(name: string): void {
    this.providers.delete(name);
  }

  snapshot(): ExtensionProviderInfo[] {
    const all = this.registry.getAll();
    const available = new Set(this.registry.getAvailable().map((model) => `${model.provider}:${model.id}`));
    return [...this.providers.entries()]
      .map(([name, tracked]) => {
        const models = all.filter((model) => model.provider === name);
        return {
          name,
          displayName: this.registry.getProviderDisplayName(name),
          status: tracked.status,
          modelCount: models.length,
          availableModelCount: models.filter((model) => available.has(`${name}:${model.id}`)).length,
          modelIds: models.map((model) => model.id).sort(),
          sources: [...tracked.sources].sort(),
          error: tracked.error,
        } satisfies ExtensionProviderInfo;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function trackExtensionProviders<T extends TrackableModelRegistry>(registry: T): ExtensionProviderTracker {
  const tracker = new ExtensionProviderTracker(registry);
  const registerProvider = registry.registerProvider.bind(registry);
  const unregisterProvider = registry.unregisterProvider.bind(registry);

  registry.registerProvider = (name, config) => {
    try {
      registerProvider(name, config);
      tracker.registered(name);
    } catch (error) {
      tracker.failed(name, error);
      throw error;
    }
  };
  registry.unregisterProvider = (name) => {
    unregisterProvider(name);
    tracker.unregistered(name);
  };
  return tracker;
}

export async function createTrackedAgentServices(cwd: string): Promise<{
  services: AgentSessionServices;
  providerTracker: ExtensionProviderTracker;
}> {
  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  const providerTracker = trackExtensionProviders(modelRegistry);

  // Pi explicitly supports loading async provider factories without starting a
  // session (the same path used by `pi --list-models`). Keep model discovery on
  // that service path instead of constructing a bare ModelRegistry.
  // Source: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#piregisterprovidername-config
  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    authStorage,
    modelRegistry,
    resourceLoaderOptions: {
      extensionsOverride(base: LoadExtensionsResult) {
        for (const registration of base.runtime.pendingProviderRegistrations) {
          providerTracker.discover(registration.name, registration.extensionPath);
        }
        return base;
      },
    },
  });

  return { services, providerTracker };
}

export async function bindWebExtensions(
  session: { bindExtensions(bindings: { mode: "rpc"; onError: (error: ExtensionError) => void }): Promise<void> },
  onError: (error: ExtensionError) => void,
): Promise<void> {
  // SDK hosts must bind extensions after session creation. This emits
  // session_start and resources_discover and installs runtime error handling.
  // Source: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md
  await session.bindExtensions({ mode: "rpc", onError });
}
