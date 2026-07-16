// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModelCatalog } from "../use-model-catalog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface DeferredResponse {
  resolve: (value: Response) => void;
  promise: Promise<Response>;
}

function deferredResponse(): DeferredResponse {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { resolve, promise };
}

function responseFor(provider: string, id: string): Response {
  return {
    ok: true,
    json: async () => ({
      models: { [`${provider}:${id}`]: id },
      modelList: [{ provider, id, name: id }],
      defaultModel: { provider, modelId: id },
    }),
  } as Response;
}

function Harness({ cwd }: { cwd: string }) {
  const { modelNames } = useModelCatalog(true, 0, undefined, null, cwd);
  return <div data-testid="models">{Object.keys(modelNames).join(",")}</div>;
}

describe("useModelCatalog", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  it("ignores an older catalog response after the cwd changes", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<Harness cwd="/workspace/first" />));
    await act(async () => root?.render(<Harness cwd="/workspace/second" />));

    await act(async () => second.resolve(responseFor("new-provider", "new-model")));
    expect(container.textContent).toBe("new-provider:new-model");

    await act(async () => first.resolve(responseFor("old-provider", "old-model")));
    expect(container.textContent).toBe("new-provider:new-model");
  });
});
