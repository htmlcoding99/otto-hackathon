// ─────────────────────────────────────────────────────────────────────────────
// types/agent.ts
// Agent execution & orchestration types
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRole =
  | "orchestrator"
  | "researcher"
  | "scorer"
  | "decision"
  | "executor";

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentStep {
  stepIndex: number;
  action: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  timestamp: string;
}

export interface AgentResult<T = unknown> {
  agentId: string;
  role: AgentRole;
  taskId: string;
  status: AgentStatus;
  success: boolean;
  data: T | null;
  error: string | null;
  steps: AgentStep[];
  totalDurationMs: number;
  completedAt: string;
}

export interface AgentExecuteRequest {
  taskId: string;
  role: AgentRole;
  context?: Record<string, unknown>;
}

export interface AgentExecuteResponse {
  agentId: string;
  status: AgentStatus;
  result: AgentResult;
}
