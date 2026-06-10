// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/index.ts
// runOttoPipeline() — sequential 6-stage orchestrator function
//
// Pipeline: Goal → Planner → DecisionTwin → Research →
//           ConstraintAnalysis → Ranking → SavingsOptimizer → Result
// ─────────────────────────────────────────────────────────────────────────────

import { PlannerAgent } from "./planner.agent";
import { DecisionTwinAgent } from "./decision-twin.agent";
import { ResearchAgent } from "./research.agent";
import { ConstraintAnalysisAgent } from "./constraint-analysis.agent";
import { RankingAgent } from "./ranking.agent";
import { SavingsOptimizerAgent } from "./savings-optimizer.agent";
import { logger } from "@/lib/logger";
import { AgentError } from "@/lib/errors";
import type {
  GoalSpec,
  PipelineResult,
  PipelineError,
  ReasoningStep,
  PastMission,
} from "@/types/pipeline";
import type { DecisionTwinProfile } from "@/types/recommendation";

// ─────────────────────────────────────────────────────────────────────────────

export type PipelineRunResult =
  | { success: true; result: PipelineResult }
  | { success: false; error: PipelineError };

/**
 * runOttoPipeline
 *
 * Runs the complete 6-stage OTTO decision pipeline sequentially.
 * Each stage receives the outputs of all previous stages.
 *
 * @param goal       - The structured goal spec for this run
 * @param profile    - Optional pre-existing DecisionTwin profile to carry in
 */
export async function runOttoPipeline(
  goal: GoalSpec,
  profile?: Partial<DecisionTwinProfile>,
  pastMissions?: PastMission[]
): Promise<PipelineRunResult> {
  const pipelineStart = Date.now();
  const reasoningChain: ReasoningStep[] = [];

  logger.info("Pipeline", "Starting OTTO 6-stage pipeline", {
    taskId: goal.taskId,
    goal: goal.goal,
    budget: goal.budget,
  });

  // ── Stage 1: Planner ─────────────────────────────────────────────────────
  logger.info("Pipeline", "Stage 1/6 — PlannerAgent", { taskId: goal.taskId });
  const plannerAgent = new PlannerAgent();
  const plannerResult = await plannerAgent.execute(goal.taskId, { goal });

  if (!plannerResult.success || !plannerResult.data) {
    return stageFailed("planner", plannerResult.error ?? "PlannerAgent failed", goal.taskId);
  }
  const planner = plannerResult.data;
  reasoningChain.push(planner.reasoning);

  // ── Stage 2: DecisionTwin ────────────────────────────────────────────────
  logger.info("Pipeline", "Stage 2/6 — DecisionTwinAgent", { taskId: goal.taskId });
  const twinAgent = new DecisionTwinAgent();
  const twinResult = await twinAgent.execute(goal.taskId, {
    goal,
    plannerOutput: planner,
    existingProfile: profile,
    pastMissions,
  });

  if (!twinResult.success || !twinResult.data) {
    return stageFailed("decision-twin", twinResult.error ?? "DecisionTwinAgent failed", goal.taskId);
  }
  const decisionTwin = twinResult.data;
  reasoningChain.push(decisionTwin.reasoning);

  // ── Stage 3: Research ────────────────────────────────────────────────────
  logger.info("Pipeline", "Stage 3/6 — ResearchAgent", { taskId: goal.taskId });
  const researchAgent = new ResearchAgent();
  const researchResult = await researchAgent.execute(goal.taskId, {
    goal,
    searchQuery: planner.searchQuery,
    profile: decisionTwin.profile,
  });

  if (!researchResult.success || !researchResult.data) {
    return stageFailed("research", researchResult.error ?? "ResearchAgent failed", goal.taskId);
  }
  const research = researchResult.data;
  reasoningChain.push(research.reasoning);

  // ── Stage 4: Constraint Analysis ─────────────────────────────────────────
  logger.info("Pipeline", "Stage 4/6 — ConstraintAnalysisAgent", { taskId: goal.taskId });
  const constraintAgent = new ConstraintAnalysisAgent();
  const constraintResult = await constraintAgent.execute(goal.taskId, {
    goal,
    candidates: research.candidates,
    profile: decisionTwin.profile,
  });

  if (!constraintResult.success || !constraintResult.data) {
    return stageFailed("constraint-analysis", constraintResult.error ?? "ConstraintAnalysisAgent failed", goal.taskId);
  }
  const constraintAnalysis = constraintResult.data;
  reasoningChain.push(constraintAnalysis.reasoning);

  if (!constraintAnalysis.passed.length) {
    return stageFailed(
      "constraint-analysis",
      "All candidates were eliminated by constraints. Try relaxing your budget or urgency.",
      goal.taskId
    );
  }

  // ── Stage 5: Ranking ─────────────────────────────────────────────────────
  logger.info("Pipeline", "Stage 5/6 — RankingAgent", { taskId: goal.taskId });
  const rankingAgent = new RankingAgent();
  const rankingResult = await rankingAgent.execute(goal.taskId, {
    goal,
    candidates: constraintAnalysis.passed,
    profile: decisionTwin.profile,
  });

  if (!rankingResult.success || !rankingResult.data) {
    return stageFailed("ranking", rankingResult.error ?? "RankingAgent failed", goal.taskId);
  }
  const ranking = rankingResult.data;
  reasoningChain.push(ranking.reasoning);

  // ── Stage 6: Savings Optimizer ───────────────────────────────────────────
  logger.info("Pipeline", "Stage 6/6 — SavingsOptimizerAgent", { taskId: goal.taskId });
  const savingsAgent = new SavingsOptimizerAgent();
  const savingsResult = await savingsAgent.execute(goal.taskId, {
    goal,
    ranked: ranking.ranked,
    rejected: constraintAnalysis.rejected,
    profile: decisionTwin.profile,
  });

  if (!savingsResult.success || !savingsResult.data) {
    return stageFailed("savings-optimizer", savingsResult.error ?? "SavingsOptimizerAgent failed", goal.taskId);
  }
  const savingsOptimizer = savingsResult.data;
  reasoningChain.push(savingsOptimizer.reasoning);

  // ── Assemble final result ────────────────────────────────────────────────
  const confidence = Math.min(
    99,
    Math.round(
      reasoningChain.reduce((sum, step) => sum + step.confidence, 0) /
        reasoningChain.length *
        100
    )
  );

  const result: PipelineResult = {
    taskId: goal.taskId,
    goal,

    // Stage outputs
    planner,
    decisionTwin,
    research,
    constraintAnalysis,
    ranking,
    savingsOptimizer,

    // Final recommendation
    winner: savingsOptimizer.winner,
    ranked: ranking.ranked,
    rejected: constraintAnalysis.rejected,
    confidence,
    finalReasoning: savingsOptimizer.savingsNarrative,

    // Observability
    reasoningChain,
    totalDurationMs: Date.now() - pipelineStart,
    completedAt: new Date().toISOString(),
  };

  logger.info("Pipeline", "Pipeline complete", {
    taskId: goal.taskId,
    winner: result.winner.name,
    confidence,
    totalDurationMs: result.totalDurationMs,
    stages: reasoningChain.length,
  });

  return { success: true, result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function stageFailed(
  stage: PipelineError["stage"],
  message: string,
  taskId: string
): { success: false; error: PipelineError } {
  logger.error("Pipeline", `Stage ${stage} failed`, { message, taskId });
  return { success: false, error: { stage, message, taskId } };
}
