// ─────────────────────────────────────────────────────────────────────────────
// agents/base.agent.ts
// Abstract base class for all OTTO agents
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import type { AgentRole, AgentResult, AgentStep, AgentStatus } from "@/types/agent";

export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  readonly agentId: string;
  abstract readonly role: AgentRole;

  protected steps: AgentStep[] = [];
  protected status: AgentStatus = "idle";
  private startedAt = 0;

  constructor() {
    this.agentId = uuidv4();
  }

  /** Subclasses implement this to perform their work. */
  protected abstract run(taskId: string, input: TInput): Promise<TOutput>;

  /**
   * Execute the agent: sets up timing, delegates to run(), collects result.
   * Guarantees no uncaught exceptions.
   */
  async execute(taskId: string, input: TInput): Promise<AgentResult<TOutput>> {
    this.startedAt = Date.now();
    this.status = "running";
    logger.info(this.role, `Agent started`, { agentId: this.agentId, taskId });

    let success = false;
    let data: TOutput | null = null;
    let error: string | null = null;

    try {
      data = await this.run(taskId, input);
      this.status = "done";
      success = true;
      logger.info(this.role, `Agent completed`, {
        agentId: this.agentId,
        taskId,
        durationMs: Date.now() - this.startedAt,
      });
    } catch (e) {
      this.status = "error";
      success = false;
      error = e instanceof Error ? e.message : String(e);
      logger.error(this.role, `Agent failed`, { agentId: this.agentId, taskId, error });
    }

    return {
      agentId: this.agentId,
      role: this.role,
      taskId,
      status: this.status,
      success,
      data,
      error,
      steps: this.steps,
      totalDurationMs: Date.now() - this.startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  /** Record an intermediate step — used for observability. */
  protected recordStep(
    action: string,
    input: unknown,
    output: unknown,
    durationMs = 0
  ): void {
    this.steps.push({
      stepIndex: this.steps.length,
      action,
      input,
      output,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}
