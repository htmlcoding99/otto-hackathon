// ─────────────────────────────────────────────────────────────────────────────
// app/api/agents/execute/route.ts
// POST /api/agents/execute — run a specific named agent for a given task
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, toApiError } from "@/lib/api-response";
import { validateBody } from "@/lib/validate";
import { OttoError } from "@/lib/errors";
import { TaskService } from "@/services/task.service";
import { ResearcherAgent } from "@/agents/researcher.agent";
import { ScorerAgent } from "@/agents/scorer.agent";
import { DecisionAgent } from "@/agents/decision.agent";
import { OrchestratorAgent } from "@/agents/orchestrator.agent";
import { logger } from "@/lib/logger";
import { HTTP_STATUS } from "@/types/api";

const agentExecuteSchema = z.object({
  taskId: z.string().uuid("taskId must be a valid UUID."),
  role: z.enum(["orchestrator", "researcher", "scorer", "decision"]),
  context: z.record(z.unknown()).optional().default({}),
});

export async function POST(request: NextRequest) {
  const start = Date.now();

  const validation = await validateBody(request, agentExecuteSchema);
  if (!validation.success) {
    return err(validation.error, { status: HTTP_STATUS.UNPROCESSABLE });
  }

  const { taskId, role, context } = validation.data;

  try {
    // Ensure the task exists before spawning an agent
    await TaskService.findById(taskId);

    logger.info("POST /api/agents/execute", `Executing agent`, { taskId, role });

    let agentResult;
    switch (role) {
      case "orchestrator": {
        const agent = new OrchestratorAgent();
        agentResult = await agent.execute(taskId, (context || {}) as never);
        break;
      }
      case "researcher": {
        const task = await TaskService.findById(taskId);
        const agent = new ResearcherAgent();
        agentResult = await agent.execute(taskId, {
          goal: task.goal,
          budget: task.budget,
          constraints: task.constraints,
          ...context,
        });
        break;
      }
      case "scorer": {
        const agent = new ScorerAgent();
        agentResult = await agent.execute(taskId, context as never);
        break;
      }
      case "decision": {
        const agent = new DecisionAgent();
        agentResult = await agent.execute(taskId, context as never);
        break;
      }
      default:
        return err(
          { code: "UNKNOWN_ROLE", message: `Agent role '${role}' is not recognised.` },
          { status: HTTP_STATUS.BAD_REQUEST }
        );
    }

    return ok(agentResult, { durationMs: Date.now() - start });
  } catch (e) {
    logger.error("POST /api/agents/execute", "Agent execution failed", e);
    if (e instanceof OttoError) {
      return err({ code: e.code, message: e.message }, { status: e.statusCode as typeof HTTP_STATUS[keyof typeof HTTP_STATUS] });
    }
    return err(toApiError(e), { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start });
  }
}
