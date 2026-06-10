// ─────────────────────────────────────────────────────────────────────────────
// services/recommendation.service.ts
// Orchestrates scoring, AI reasoning, and recommendation assembly
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import { chatCompletion } from "@/lib/openai";
import { ScoringService } from "./scoring.service";
import { TaskService } from "./task.service";
import { CandidateService } from "./candidate.service";
import { NotFoundError, AgentError } from "@/lib/errors";
import type { Candidate, DecisionTwinProfile, RecommendationResponse } from "@/types/recommendation";
import type { RecommendationRequest } from "@/types/recommendation";

// ── Default twin profile (used when caller sends nothing) ─────────────────────
const DEFAULT_PROFILE: DecisionTwinProfile = {
  budgetSensitivity: 50,
  deliveryPriority: 50,
  qualityFocus: 60,
  riskTolerance: 40,
  valueOrientation: 70,
  decisionCount: 0,
};

// ── Candidate source ──────────────────────────────────────────────────────────
// Live Exa web search + LLM commerce-attribute enrichment (see CandidateService).
async function fetchCandidates(
  goal: string,
  budget: number,
  preferences = ""
): Promise<Candidate[]> {
  return CandidateService.fetch({ goal, budget, preferences });
}

// ─────────────────────────────────────────────────────────────────────────────

export const RecommendationService = {
  async generate(req: RecommendationRequest): Promise<RecommendationResponse> {
    const start = Date.now();
    logger.info("RecommendationService", "Generating recommendation", { taskId: req.taskId });

    // 1. Load task
    const task = await TaskService.findById(req.taskId);

    // 2. Merge twin profile
    const profile: DecisionTwinProfile = { ...DEFAULT_PROFILE, ...req.twinProfile };

    // 3. Fetch candidates
    const candidates = await fetchCandidates(task.goal, task.budget, task.constraints);
    if (!candidates.length) {
      throw new AgentError("No candidates found for this task.");
    }

    // 4. Filter & rank
    const { ranked, rejected } = ScoringService.filterAndRank(candidates, task, profile);
    if (!ranked.length) {
      throw new AgentError("All candidates were eliminated by constraints.");
    }

    const winner = ranked[0];

    // 5. AI reasoning
    let reasoning = "";
    const llmResult = await chatCompletion(
      "You are OTTO, an AI decision engine. Given a winning product recommendation, write a 2-sentence reasoning that explains why this is the best choice given the user's goal, budget, and constraints. Be concise and specific.",
      `Goal: ${task.goal}\nBudget: $${task.budget}\nWinner: ${winner.name} ($${winner.price}) — Score: ${winner.scores.finalScore}`
    );
    if (llmResult.success && llmResult.data) {
      reasoning = llmResult.data;
    } else {
      logger.warn("RecommendationService", "AI reasoning failed, using fallback", llmResult.error);
      reasoning = `${winner.name} scored highest across value, speed, and quality dimensions aligned with your goal.`;
    }

    // 6. Compute confidence & savings
    const confidence = Math.min(98, winner.scores.finalScore + 10);
    const avgPrice = ranked.reduce((s, c) => s + c.price, 0) / ranked.length;
    const estimatedSavings = Math.max(0, avgPrice - winner.price);

    const response: RecommendationResponse = {
      taskId: task.id,
      winner,
      ranked,
      rejected,
      confidence,
      reasoning,
      estimatedSavings,
      generatedAt: new Date().toISOString(),
    };

    logger.info("RecommendationService", "Recommendation generated", {
      taskId: task.id,
      winner: winner.name,
      durationMs: Date.now() - start,
    });

    return response;
  },
};
