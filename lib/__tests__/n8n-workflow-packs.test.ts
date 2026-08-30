import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const IDS = [
  "meeting-create-jira",
  "meeting-notify-teams",
  "meeting-update-knowledge-base",
  "pm-create-jira-epic",
  "pm-publish-prd",
  "pm-notify-team",
];

describe("versioned n8n workflow packs", () => {
  for (const id of IDS) {
    it(`${id} validates DTA governance before a disabled integration action`, () => {
      const workflow = JSON.parse(readFileSync(resolve(process.cwd(), `deploy/n8n/${id}.json`), "utf8"));
      expect(workflow.active).toBe(false);
      expect(workflow.meta.dtaWorkflowSchemaVersion).toBe("1.0");
      expect(workflow.nodes.map((node: { name: string }) => node.name)).toEqual([
        "DTA Webhook",
        "Validate DTA Scope",
        "Build Integration Payload",
        "Dispatch Approved Action",
        "Return Execution Evidence",
      ]);
      const serialized = JSON.stringify(workflow);
      expect(serialized).toContain(id);
      expect(serialized).toContain("x-dta-user-id");
      expect(serialized).toContain("idempotency-key");
      expect(serialized).toContain("reviewStatus");
      expect(serialized).toContain("approved");
      expect(serialized).not.toMatch(/https:\/\/(?!.*example)/);
      expect(serialized).not.toMatch(/(?:token|secret|password)[=:][A-Za-z0-9_-]{12,}/i);
    });
  }
});
