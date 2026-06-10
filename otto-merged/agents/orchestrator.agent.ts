// ─────────────────────────────────────────────────────────────────────────────
// agents/orchestrator.agent.ts
// Coordinates the full OTTO pipeline: Research → Score → Decide
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "./base.agent";
import { ResearcherAgent } from "./researcher.agent";
import { ScorerAgent } from "./scorer.agent";
import { DecisionAgent } from "./decision.agent";
import { TaskService } from "@/services/task.service";
import { logger } from "@/lib/logger";
import type { AgentRole } from "@/types/agent";
import type { DecisionTwinProfile, Candidate } from "@/types/recommendation";

const DEFAULT_PROFILE: DecisionTwinProfile = {
  budgetSensitivity: 50,
  deliveryPriority: 50,
  qualityFocus: 60,
  riskTolerance: 40,
  valueOrientation: 70,
  decisionCount: 0,
};

interface OrchestratorInput {
  twinProfile?: Partial<DecisionTwinProfile>;
}

export interface OrchestratorOutput {
  winner: Candidate;
  ranked: Candidate[];
  rejected: unknown[];
  confidence: number;
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class OrchestratorAgent extends BaseAgent<OrchestratorInput, OrchestratorOutput> {
  readonly role: AgentRole = "orchestrator";

  protected async run(taskId: string, input: OrchestratorInput): Promise<OrchestratorOutput> {
    const task = await TaskService.findById(taskId);
    const profile: DecisionTwinProfile = { ...DEFAULT_PROFILE, ...input.twinProfile };

    await TaskService.updateStatus(taskId, "running");

    // ── Step 1: Research ─────────────────────────────────────────────────────
    logger.info("OrchestratorAgent", "Delegating to ResearcherAgent", { taskId });
    const researcher = new ResearcherAgent();
    const researchResult = await researcher.execute(taskId, {
      goal: task.goal,
      budget: task.budget,
      constraints: task.constraints,
    });

    if (!researchResult.success || !researchResult.data) {
      await TaskService.updateStatus(taskId, "failed");
      return {
        winner: {} as Candidate,
        ranked: [],
        rejected: [],
        confidence: 0,
        reasoning: `Researcher failed: ${researchResult.error}`,
      };
    }
    this.recordStep("research_complete", {}, { candidatesFound: researchResult.data.candidates.length });

    // ── Step 2: Score ────────────────────────────────────────────────────────
    logger.info("OrchestratorAgent", "Delegating to ScorerAgent", { taskId });
    const scorer = new ScorerAgent();
    const scoreResult = await scorer.execute(taskId, {
      candidates: researchResult.data.candidates,
      task,
      profile,
    });

    if (!scoreResult.success || !scoreResult.data) {
      await TaskService.updateStatus(taskId, "failed");
      return {
        winner: {} as Candidate,
        ranked: [],
        rejected: [],
        confidence: 0,
        reasoning: `Scorer failed: ${scoreResult.error}`,
      };
    }
    this.recordStep("scoring_complete", {}, { ranked: scoreResult.data.ranked.length });

    // ── Step 3: Decide ───────────────────────────────────────────────────────
    logger.info("OrchestratorAgent", "Delegating to DecisionAgent", { taskId });
    const decider = new DecisionAgent();
    const decisionResult = await decider.execute(taskId, {
      ranked: scoreResult.data.ranked,
      goal: task.goal,
      budget: task.budget,
    });

    if (!decisionResult.success || !decisionResult.data) {
      await TaskService.updateStatus(taskId, "failed");
      return {
        winner: {} as Candidate,
        ranked: scoreResult.data.ranked,
        rejected: scoreResult.data.rejected,
        confidence: 0,
        reasoning: `Decision failed: ${decisionResult.error}`,
      };
    }

    await TaskService.updateStatus(taskId, "awaiting_approval");

    return {
      winner: decisionResult.data.winner,
      ranked: scoreResult.data.ranked,
      rejected: scoreResult.data.rejected,
      confidence: decisionResult.data.confidence,
      reasoning: decisionResult.data.reasoning,
    };
  }
}
