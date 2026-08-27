import { WorkflowExecutionError, type WorkflowExecutionContext, type WorkflowExecutor } from "./workflow-executor";

export class MockWorkflowExecutor implements WorkflowExecutor {
  async execute(workflow: string, payload: unknown, context: WorkflowExecutionContext = {}): Promise<unknown> {
    if (process.env.NODE_ENV === "production") throw new WorkflowExecutionError("Mock workflows are disabled in production");
    return {
      ok: true,
      mock: true,
      workflow,
      payload,
      ...(context.executionId || context.idempotencyKey ? { context } : {}),
    };
  }
}

export class DisabledWorkflowExecutor implements WorkflowExecutor {
  async execute(): Promise<never> {
    throw new WorkflowExecutionError("Workflow execution is disabled");
  }
}
