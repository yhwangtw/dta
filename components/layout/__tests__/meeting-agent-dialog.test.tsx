// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingAgentDialog } from "../MeetingAgentDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RecognitionHandlers {
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onresult: ((event: unknown) => void) | null;
}

describe("MeetingAgentDialog voice typing", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  it("writes final microphone recognition into meeting source text", async () => {
    class MockSpeechRecognition implements RecognitionHandlers {
      static latest: MockSpeechRecognition | null = null;
      continuous = false;
      interimResults = false;
      lang = "";
      maxAlternatives = 1;
      onstart: ((event: Event) => void) | null = null;
      onend: ((event: Event) => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror = null;
      constructor() { MockSpeechRecognition.latest = this; }
      start() { this.onstart?.(new Event("start")); }
      stop() { this.onend?.(new Event("end")); }
      abort() {}
    }
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <MeetingAgentDialog managedWorkspaceCwd="/workspace/dta" onClose={vi.fn()} onLaunch={vi.fn()} />,
    ));

    const mic = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Speak to type"));
    expect(mic?.disabled).toBe(false);
    await act(async () => mic?.click());
    expect(container.textContent).toContain("Stop listening");

    await act(async () => MockSpeechRecognition.latest?.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: "Alex owns the pilot." }], { isFinal: true, length: 1 })],
    }));

    expect(container.querySelector<HTMLTextAreaElement>("#meeting-agent-source")?.value)
      .toBe("Alex owns the pilot.");
  });

  it("shows transcript and visual evidence produced from a video", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      results: [{
        name: "weekly-sync.mp4",
        size: 1024,
        ok: true,
        kind: "video",
        content: "# Media evidence\n[00:10] Alex: Pilot approved",
        chars: 49,
        artifactId: "media-1",
        transcriptArtifactId: "transcript-1",
        visualAnalysisArtifactId: "vision-1",
        timelineArtifactId: "timeline-1",
        keyframeArtifactIds: ["frame-1", "frame-2"],
        durationSeconds: 90,
        transcriptSegmentCount: 4,
        keyframeCount: 2,
        transcriptionStatus: "ready",
        visionStatus: "ready",
        warnings: [],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <MeetingAgentDialog managedWorkspaceCwd="/workspace/dta" onClose={vi.fn()} onLaunch={vi.fn()} />,
    ));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File([new Uint8Array([1, 2, 3])], "weekly-sync.mp4", { type: "video/mp4" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain("Transcript ready · 4 segments");
    expect(container.textContent).toContain("Visual evidence ready · 2 keyframes");
    expect(container.textContent).toContain("1:30");
    const launch = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate meeting minutes"));
    expect(launch?.disabled).toBe(false);
  });
});
