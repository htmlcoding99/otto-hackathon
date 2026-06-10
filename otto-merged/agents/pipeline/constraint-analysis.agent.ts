// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/constraint-analysis.agent.ts
// Stage 4 — Applies hard + soft constraints to eliminate ineligible candidates
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { logger } from "@/lib/logger";
import type { AgentRole } from "@/types/agent";
import type { Candidate, RejectedCandidate, DecisionTwinProfile } from "@/types/recommendation";
import type {
  ConstraintAnalysisInput,
  ConstraintAnalysisOutput,
  ReasoningStep,
} from "@/types/pipeline";

// ─────────────────────────────────────────────────────────────────────────────

const URGENCY_MAX_DAYS: Record<string, number> = {
  "same-day": 1,
  urgent: 3,
  standard: 7,
  flexible: 999,
};

const MIN_RATING = 4.2;

// ─────────────────────────────────────────────────────────────────────────────

export class ConstraintAnalysisAgent extends BaseAgent<
  ConstraintAnalysisInput,
  ConstraintAnalysisOutput
> {
  readonly role: AgentRole = "orchestrator";

  protected async run(
    taskId: string,
    input: ConstraintAnalysisInput
  ): Promise<ConstraintAnalysisOutput> {
    const { goal, candidates, profile } = input;
    const t0 = Date.now();

    logger.info("ConstraintAnalysisAgent", "Applying constraints", {
      taskId,
      totalCandidates: candidates.length,
    });

    const maxDays = URGENCY_MAX_DAYS[goal.urgency] ?? 999;
    const passed: Candidate[] = [];
    const rejected: RejectedCandidate[] = [];
    const hardConstraintsApplied: string[] = [];
    const softConstraintsApplied: string[] = [];

    // ── Track which hard constraints are active ──────────────────────────────
    hardConstraintsApplied.push(`Budget ≤ $${goal.budget}`);
    if (maxDays < 999) hardConstraintsApplied.push(`Delivery ≤ ${maxDays} days`);
    hardConstraintsApplied.push(`Rating ≥ ${MIN_RATING}★`);

    // ── Parse soft constraints from goal.constraints string ──────────────────
    const softTokens = goal.constraints
      .toLowerCase()
      .split(/,\s*/)
      .filter(Boolean);
    if (softTokens.length) {
      softConstraintsApplied.push(...softTokens.map((t) => `Preference: ${t}`));
    }

    for (const c of candidates) {
      const reasons: string[] = [];

      // Hard gate 1: budget
      if (c.price > goal.budget) {
        reasons.push(`Over budget ($${c.price.toFixed(2)} > $${goal.budget})`);
      }

      // Hard gate 2: urgency
      if (c.deliveryDays > maxDays) {
        reasons.push(`Delivery too slow (${c.deliveryDays}d > ${maxDays}d for ${goal.urgency})`);
      }

      // Hard gate 3: quality floor
      if (c.rating < MIN_RATING) {
        reasons.push(`Below quality floor (${c.rating}★ < ${MIN_RATING}★)`);
      }

      if (reasons.length > 0) {
        const { scores: _scores, ...rest } = c;
        rejected.push({ ...rest, rejectedReason: reasons.join(" · ") });
      } else {
        passed.push(c);
      }
    }

    const eliminationRate =
      candidates.length > 0 ? rejected.length / candidates.length : 0;
    const durationMs = Date.now() - t0;

    const reasoning: ReasoningStep = {
      agent: "ConstraintAnalysisAgent",
      action: "constraint_filtering",
      reasoning: `Applied ${hardConstraintsApplied.length} hard constraints and ${softConstraintsApplied.length} soft constraints. Eliminated ${rejected.length}/${candidates.length} candidates (${Math.round(eliminationRate * 100)}% elimination rate). ${passed.length} candidates advanced.`,
      confidence: 1.0, // deterministic
      durationMs,
      timestamp: new Date().toISOString(),
    };

    this.recordStep(
      "apply_constraints",
      { hard: hardConstraintsApplied, soft: softConstraintsApplied },
      { passed: passed.length, rejected: rejected.length },
      durationMs
    );

    return {
      passed,
      rejected,
      hardConstraintsApplied,
      softConstraintsApplied,
      eliminationRate,
      reasoning,
    };
  }
}
