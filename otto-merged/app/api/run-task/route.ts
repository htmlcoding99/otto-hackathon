// ─────────────────────────────────────────────────────────────────────────────
// app/api/run-task/route.ts
// POST /api/run-task — create a new decision task & kick off the agent pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest } from "next/server";
import { ok, err, toApiError } from "@/lib/api-response";
import { validateBody, runTaskSchema } from "@/lib/validate";
import { OttoError } from "@/lib/errors";
import { TaskService } from "@/services/task.service";
import { OrchestratorAgent } from "@/agents/orchestrator.agent";
import { logger } from "@/lib/logger";
import { HTTP_STATUS } from "@/types/api";

export async function POST(request: NextRequest) {
  const start = Date.now();

  // 1. Validate environment variables safely
  if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return err(
      { code: "MISSING_CONFIG", message: "No LLM API keys found in environment variables." },
      { status: HTTP_STATUS.SERVER_ERROR }
    );
  }

  // 2. Validate request body
  const validation = await validateBody(request, runTaskSchema);
  if (!validation.success) {
    return err(validation.error, { status: HTTP_STATUS.UNPROCESSABLE });
  }

  const { goal, budget, urgency, constraints, weights } = validation.data;

  try {
    // 2. Create task record
    const task = await TaskService.create({ goal, budget, urgency, constraints, weights });
    logger.info("POST /api/run-task", "Task created, launching orchestrator", { taskId: task.id });

    // 4. Launch orchestrator (blocking execution for MVP testing)
    const orchestrator = new OrchestratorAgent();
    const result = await orchestrator.execute(task.id, {});

    if (!result.success) {
      logger.error("POST /api/run-task", "Orchestrator failed internally", { result });
      return err(
        { code: "ORCHESTRATOR_FAILED", message: result.error || "The agent pipeline failed during execution." },
        { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start }
      );
    }

    return ok(
      {
        taskId: task.id,
        status: result.status,
        output: result.data,
        steps: result.steps?.length || 0,
        durationMs: result.totalDurationMs,
      },
      { status: HTTP_STATUS.CREATED, durationMs: Date.now() - start }
    );
  } catch (e) {
    logger.error("POST /api/run-task", "Orchestrator failed", e);
    if (e instanceof OttoError) {
      return err({ code: e.code, message: e.message }, { status: e.statusCode as typeof HTTP_STATUS[keyof typeof HTTP_STATUS] });
    }
    return err(toApiError(e), { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start });
  }
}
