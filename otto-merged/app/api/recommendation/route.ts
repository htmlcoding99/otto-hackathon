// ─────────────────────────────────────────────────────────────────────────────
// app/api/recommendation/route.ts
// POST /api/recommendation — generate a recommendation for an existing task
// GET  /api/recommendation?taskId=<id> — retrieve a cached recommendation
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, toApiError } from "@/lib/api-response";
import { validateBody } from "@/lib/validate";
import { OttoError } from "@/lib/errors";
import { RecommendationService } from "@/services/recommendation.service";
import { logger } from "@/lib/logger";
import { HTTP_STATUS } from "@/types/api";

const recommendationSchema = z.object({
  taskId: z.string().uuid("taskId must be a valid UUID."),
  twinProfile: z
    .object({
      budgetSensitivity: z.number().min(0).max(100).optional(),
      deliveryPriority: z.number().min(0).max(100).optional(),
      qualityFocus: z.number().min(0).max(100).optional(),
      riskTolerance: z.number().min(0).max(100).optional(),
      valueOrientation: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

// ── POST — generate ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const start = Date.now();

  const validation = await validateBody(request, recommendationSchema);
  if (!validation.success) {
    return err(validation.error, { status: HTTP_STATUS.UNPROCESSABLE });
  }

  try {
    const recommendation = await RecommendationService.generate(validation.data);
    logger.info("POST /api/recommendation", "Recommendation generated", {
      taskId: validation.data.taskId,
      winner: recommendation.winner.name,
    });

    return ok(recommendation, { status: HTTP_STATUS.CREATED, durationMs: Date.now() - start });
  } catch (e) {
    logger.error("POST /api/recommendation", "Generation failed", e);
    if (e instanceof OttoError) {
      return err({ code: e.code, message: e.message }, { status: e.statusCode as typeof HTTP_STATUS[keyof typeof HTTP_STATUS] });
    }
    return err(toApiError(e), { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start });
  }
}

// ── GET — retrieve ────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return err(
      { code: "MISSING_PARAM", message: "taskId query parameter is required." },
      { status: HTTP_STATUS.BAD_REQUEST }
    );
  }

  // In production, retrieve from a cache/DB here. 
  // For now, return a clear not-implemented message.
  return err(
    { code: "NOT_CACHED", message: "Recommendation not found. POST to /api/recommendation to generate one." },
    { status: HTTP_STATUS.NOT_FOUND }
  );
}
