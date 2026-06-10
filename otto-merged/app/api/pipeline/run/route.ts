// ─────────────────────────────────────────────────────────────────────────────
// app/api/pipeline/run/route.ts
// POST /api/pipeline/run — execute the full 6-stage OTTO pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, toApiError } from "@/lib/api-response";
import { validateBody } from "@/lib/validate";
import { OttoError } from "@/lib/errors";
import { runOttoPipeline } from "@/agents/pipeline";
import { logger } from "@/lib/logger";
import { HTTP_STATUS } from "@/types/api";
import { v4 as uuidv4 } from "uuid";

// ── Request schema ────────────────────────────────────────────────────────────

const pipelineRunSchema = z.object({
  goal: z.string().min(5).max(500),
  budget: z.number().positive(),
  urgency: z.enum(["same-day", "urgent", "standard", "flexible"]).default("standard"),
  constraints: z.string().max(300).optional().default(""),
  weights: z
    .object({
      value: z.number().min(0).max(10).default(7),
      speed: z.number().min(0).max(10).default(5),
      quality: z.number().min(0).max(10).default(6),
    })
    .optional()
    .default({ value: 7, speed: 5, quality: 6 }),
  existingProfile: z
    .object({
      budgetSensitivity: z.number().min(0).max(100).optional(),
      deliveryPriority: z.number().min(0).max(100).optional(),
      qualityFocus: z.number().min(0).max(100).optional(),
      riskTolerance: z.number().min(0).max(100).optional(),
      valueOrientation: z.number().min(0).max(100).optional(),
      decisionCount: z.number().optional(),
    })
    .optional(),
  pastMissions: z
    .array(
      z.object({
        goal: z.string(),
        pick: z.string().optional(),
        price: z.number().optional(),
      })
    )
    .max(10)
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const start = Date.now();

  const validation = await validateBody(request, pipelineRunSchema);
  if (!validation.success) {
    return err(validation.error, { status: HTTP_STATUS.UNPROCESSABLE });
  }

  const { goal, budget, urgency, constraints, weights, existingProfile, pastMissions } = validation.data;
  const taskId = uuidv4();

  logger.info("POST /api/pipeline/run", "Pipeline run initiated", { taskId, goal });

  try {
    const pipelineResult = await runOttoPipeline(
      { taskId, goal, budget, urgency: urgency as any, constraints: constraints || "", weights: weights as any },
      existingProfile,
      pastMissions
    );

    if (!pipelineResult.success) {
      return err(
        {
          code: `PIPELINE_STAGE_FAILED:${pipelineResult.error.stage.toUpperCase()}`,
          message: pipelineResult.error.message,
          details: pipelineResult.error,
        },
        { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start }
      );
    }

    return ok(pipelineResult.result, {
      status: HTTP_STATUS.CREATED,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    logger.error("POST /api/pipeline/run", "Unexpected pipeline error", e);
    if (e instanceof OttoError) {
      return err({ code: e.code, message: e.message }, { status: e.statusCode as typeof HTTP_STATUS[keyof typeof HTTP_STATUS] });
    }
    return err(toApiError(e), { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start });
  }
}
