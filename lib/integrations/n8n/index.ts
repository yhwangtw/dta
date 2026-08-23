import { loadDtaConfig } from "@/lib/config/env";
import { MockWorkflowExecutor, DisabledWorkflowExecutor } from "./mock-workflow-executor";
import { N8nWorkflowExecutor } from "./n8n-workflow-executor";
import type { WorkflowExecutor } from "./workflow-executor";

export function createWorkflowExecutor(): WorkflowExecutor {
  const config = loadDtaConfig();
  if (config.workflowProvider === "n8n") return new N8nWorkflowExecutor(config);
  if (config.workflowProvider === "mock") return new MockWorkflowExecutor();
  return new DisabledWorkflowExecutor();
}
