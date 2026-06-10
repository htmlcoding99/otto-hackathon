// ─────────────────────────────────────────────────────────────────────────────
// app/api/budget/estimate/route.ts
// POST /api/budget/estimate — live price range for a goal.
//
// Runs the real Exa search + LLM price enrichment (the same CandidateService the
// pipeline uses) and returns the min/max/avg of the estimated prices, so the UI
// can tell the user whether their budget is higher than what's actually needed.
// This is intentionally a live call and may take a few seconds.
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CandidateService } from "@/services/candidate.service";
import { logger } from "@/lib/logger";

const schema = z.object({
  goal: z.string().min(3).max(500),
  budget: z.number().positive().optional(),
  constraints: z.string().max(300).optional().default(""),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 });
  }

  const { goal, budget, constraints } = parsed.data;

  try {
    const candidates = await CandidateService.fetch({
      goal,
      // Used to bias the Exa query; LLM enrichment estimates the real prices.
      budget: budget ?? 100,
      preferences: constraints,
    });

    const prices = candidates
      .map((c) => c.price)
      .filter((p) => Number.isFinite(p) && p > 0);

    if (!prices.length) {
      return NextResponse.json({ count: 0, min: null, max: null, avg: null });
    }

    return NextResponse.json({
      count: prices.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((s, p) => s + p, 0) / prices.length,
    });
  } catch (e) {
    logger.error("POST /api/budget/estimate", "Live price estimate failed", e);
    return NextResponse.json({ error: "Live price estimate failed" }, { status: 500 });
  }
}
