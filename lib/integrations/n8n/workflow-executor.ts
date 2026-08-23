export interface WorkflowExecutor {
  execute(workflow: string, payload: unknown): Promise<unknown>;
}

export class WorkflowExecutionError extends Error {}
