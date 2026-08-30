import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST as reviewRoute } from "@/app/api/meeting-agent/runs/[id]/review/route";
import { getDtaDataDir } from "../config/env";
import {
  MeetingReviewConflictError,
  readMeetingRun,
  reviewMeetingRun,
  writeMeetingRun,
} from "../agents/meeting/meeting-result-store";
import type { MeetingResult, StoredMeetingResult } from "../agents/meeting/meeting-types";

const result: MeetingResult = {
  schemaVersion: "2.0",
  title: "Weekly sync",
  summary: "Pilot evidence is ready.",
  decisions: [],
  actionItems: [],
  requirements: [],
};

function completedRun(runId = randomUUID()): StoredMeetingResult {
  return {
    runId,
    status: "completed",
    result,
    artifacts: [],
    actions: [],
    reviewStatus: "needs_review",
    revision: 1,
    reviewHistory: [],
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

describe("meeting review lifecycle", () => {
  it("migrates legacy completed records to needs_review instead of approving them", () => {
    const runId = randomUUID();
    const directory = join(getDtaDataDir(), "meeting-runs");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${runId}.json`), JSON.stringify({
      runId,
      status: "completed",
      result,
      artifacts: [],
      updatedAt: "2026-08-20T00:00:00.000Z",
    }));

    expect(readMeetingRun(runId)).toMatchObject({ reviewStatus: "needs_review", revision: 1, reviewHistory: [] });
  });

  it("records the reviewer, decision, revision, and comment as an audit trail", () => {
    const run = completedRun();
    writeMeetingRun(run);

    const reviewed = reviewMeetingRun({
      runId: run.runId,
      decision: "approved",
      actorId: "reviewer-123",
      comment: "Evidence checked.",
    });

    expect(reviewed).toMatchObject({ reviewStatus: "approved", revision: 1 });
    expect(reviewed.reviewHistory).toEqual([expect.objectContaining({
      status: "approved",
      actorId: "reviewer-123",
      comment: "Evidence checked.",
      revision: 1,
    })]);
    expect(() => reviewMeetingRun({ runId: run.runId, decision: "approved", actorId: "reviewer-123" }))
      .toThrow(MeetingReviewConflictError);
  });

  it("exposes a JSON review endpoint without accepting a caller-supplied reviewer", async () => {
    const run = completedRun();
    writeMeetingRun(run);
    const response = await reviewRoute(new Request(`http://localhost/api/meeting-agent/runs/${run.runId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved", actorId: "spoofed-user" }),
    }), { params: Promise.resolve({ id: run.runId }) });

    expect(response.status).toBe(200);
    const body = await response.json() as { meetingRun: StoredMeetingResult };
    expect(body.meetingRun.reviewHistory[0].actorId).toBe("local-user");
  });

  it("requires a review comment when returning a result", async () => {
    const run = completedRun();
    writeMeetingRun(run);
    const response = await reviewRoute(new Request(`http://localhost/api/meeting-agent/runs/${run.runId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "changes_requested" }),
    }), { params: Promise.resolve({ id: run.runId }) });

    expect(response.status).toBe(400);
  });
});
