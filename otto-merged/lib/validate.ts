// ─────────────────────────────────────────────────────────────────────────────
// lib/validate.ts
// Zod-powered request validation helpers
// ─────────────────────────────────────────────────────────────────────────────

import { z, ZodSchema } from "zod";
import type { ApiError } from "@/types/api";

export interface ValidationResult<T> {
  success: true;
  data: T;
}
export interface ValidationError {
  success: false;
  error: ApiError;
}

export type ValidationOutcome<T> = ValidationResult<T> | ValidationError;

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns a typed discriminated union — no throws, caller decides what to do.
 */
export async function validateBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<ValidationOutcome<T>> {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return {
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    };
  }

  const result = schema.safeParse(json);

  if (!result.success) {
    const details = result.error.flatten().fieldErrors;
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "One or more fields are invalid.",
        details,
      },
    };
  }

  return { success: true, data: result.data };
}

// ── Shared re-usable schemas ──────────────────────────────────────────────────

export const urgencySchema = z.enum([
  "same-day",
  "urgent",
  "standard",
  "flexible",
]);

export const taskWeightsSchema = z.object({
  value: z.number().min(0).max(10).default(7),
  speed: z.number().min(0).max(10).default(5),
  quality: z.number().min(0).max(10).default(6),
});

export const runTaskSchema = z.object({
  goal: z.string().min(5, "Goal must be at least 5 characters.").max(500),
  budget: z.number().positive("Budget must be a positive number."),
  urgency: urgencySchema,
  constraints: z.string().max(300).optional().default(""),
  weights: taskWeightsSchema.optional(),
});
