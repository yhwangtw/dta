export interface WorkflowExecutionContext {
  executionId?: string;
  idempotencyKey?: string;
}

export interface WorkflowExecutor {
  execute(workflow: string, payload: unknown, context?: WorkflowExecutionContext): Promise<unknown>;
}

export class WorkflowExecutionError extends Error {}
