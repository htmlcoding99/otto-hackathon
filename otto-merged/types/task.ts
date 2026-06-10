// ─────────────────────────────────────────────────────────────────────────────
// types/task.ts
// Core task & mission types for OTTO 2.0
// ─────────────────────────────────────────────────────────────────────────────

export type UrgencyLevel = "same-day" | "urgent" | "standard" | "flexible";

export type TaskStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export interface TaskWeights {
  value: number;   // 0–10
  speed: number;   // 0–10
  quality: number; // 0–10
}

export interface Task {
  id: string;
  goal: string;
  budget: number;
  urgency: UrgencyLevel;
  constraints: string;
  weights: TaskWeights;
  status: TaskStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface RunTaskRequest {
  goal: string;
  budget: number;
  urgency: UrgencyLevel;
  constraints?: string;
  weights?: Partial<TaskWeights>;
}

export interface RunTaskResponse {
  taskId: string;
  status: TaskStatus;
  message: string;
}
