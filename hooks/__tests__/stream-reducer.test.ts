import { describe, it, expect } from "vitest";
import { streamReducer, type StreamingState } from "../use-agent-session-types";
import type { AgentMessage } from "@/lib/types";

const idle: StreamingState = { isStreaming: false, streamingMessage: null };
const msg: Partial<AgentMessage> = { role: "assistant", content: [{ type: "text", text: "partial" }] };

describe("streamReducer", () => {
  it("start: begins streaming with no message", () => {
    expect(streamReducer(idle, { type: "start" })).toEqual({ isStreaming: true, streamingMessage: null });
  });

  it("update: stores the in-flight message and stays streaming", () => {
    const started = streamReducer(idle, { type: "start" });
    const updated = streamReducer(started, { type: "update", message: msg });
    expect(updated.isStreaming).toBe(true);
    expect(updated.streamingMessage).toBe(msg);
  });

  it("update overwrites the previous partial message", () => {
    const s1 = streamReducer(idle, { type: "update", message: msg });
    const msg2: Partial<AgentMessage> = { role: "assistant", content: [{ type: "text", text: "partial longer" }] };
    const s2 = streamReducer(s1, { type: "update", message: msg2 });
    expect(s2.streamingMessage).toBe(msg2);
  });

  it("end: clears streaming state", () => {
    const streaming = streamReducer(idle, { type: "update", message: msg });
    expect(streamReducer(streaming, { type: "end" })).toEqual(idle);
  });

  it("reset (message_end mid-turn): clears the bubble like end", () => {
    const streaming = streamReducer(idle, { type: "update", message: msg });
    expect(streamReducer(streaming, { type: "reset" })).toEqual(idle);
  });
});
