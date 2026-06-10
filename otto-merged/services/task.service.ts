// ─────────────────────────────────────────────────────────────────────────────
// services/task.service.ts
// Business logic for task creation, retrieval & lifecycle management
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import { NotFoundError } from "@/lib/errors";
import type { Task, RunTaskRequest, TaskStatus, TaskWeights } from "@/types/task";

// ── In-process store (swap for Redis/DB in production) ───────────────────────
// Keyed by taskId for O(1) lookup.
const taskStore = new Map<string, Task>();

const DEFAULT_WEIGHTS: TaskWeights = { value: 7, speed: 5, quality: 6 };

// ─────────────────────────────────────────────────────────────────────────────

export const TaskService = {
  /**
   * Create a new task and persist it to the store.
   */
  async create(payload: RunTaskRequest): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuidv4(),
      goal: payload.goal,
      budget: payload.budget,
      urgency: payload.urgency,
      constraints: payload.constraints ?? "",
      weights: { ...DEFAULT_WEIGHTS, ...payload.weights },
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };

    taskStore.set(task.id, task);
    logger.info("TaskService", `Task created`, { taskId: task.id });
    return task;
  },

  /**
   * Retrieve a task by ID.
   */
  async findById(taskId: string): Promise<Task> {
    const task = taskStore.get(taskId);
    if (!task) throw new NotFoundError(`Task ${taskId}`);
    return task;
  },

  /**
   * Update a task's status (and updatedAt).
   */
  async updateStatus(taskId: string, status: TaskStatus): Promise<Task> {
    const task = await this.findById(taskId);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    taskStore.set(taskId, task);
    logger.info("TaskService", `Task status updated`, { taskId, status });
    return task;
  },

  /**
   * List all tasks (for admin / debugging).
   */
  async listAll(): Promise<Task[]> {
    return Array.from(taskStore.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
};
