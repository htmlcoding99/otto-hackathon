// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/ranking.agent.ts
// Stage 5 — Scores and ranks all passing candidates
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { logger } from "@/lib/logger";
import { RankingEngine } from "@/services/ranking.service";
import type { AgentRole } from "@/types/agent";
import type { RankingInput, RankingOutput, ReasoningStep } from "@/types/pipeline";

// ─────────────────────────────────────────────────────────────────────────────

export class RankingAgent extends BaseAgent<RankingInput, RankingOutput> {
  readonly role: AgentRole = "scorer";

  protected async run(taskId: string, input: RankingInput): Promise<RankingOutput> {
    const { goal, candidates, profile } = input;
    const t0 = Date.now();

    logger.info("RankingAgent", "Scoring candidates", {
      taskId,
      count: candidates.length,
    });

    if (!candidates.length) {
      return {
        ranked: [],
        scoreBreakdown: {},
        reasoning: {
          agent: "RankingAgent",
          action: "multi_factor_scoring",
          reasoning: "No candidates available to rank.",
          confidence: 0,
          durationMs: Date.now() - t0,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Utilize the deterministic Ranking Engine
    const scored = RankingEngine.rank(candidates, goal.budget, goal.weights, profile);

    const scoreBreakdown = Object.fromEntries(
      scored.map((c) => [c.id, c.scores.finalScore])
    );

    const durationMs = Date.now() - t0;

    const top = scored[0];
    const reasoning: ReasoningStep = {
      agent: "RankingAgent",
      action: "multi_factor_scoring",
      reasoning: `Scored ${scored.length} candidates using weights Value=${goal.weights.value}/Speed=${goal.weights.speed}/Quality=${goal.weights.quality} and twin profile. Top candidate: "${top.name}" (Score: ${top.scores.finalScore}, Value: ${top.scores.valueScore}, Speed: ${top.scores.deliveryScore}, Quality: ${top.scores.qualityScore}, PrefFit: ${top.scores.prefFit}).`,
      confidence: 0.93,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    this.recordStep(
      "rank_candidates",
      { weights: goal.weights, profileHints: profile },
      { topCandidate: top.name, topScore: top.scores.finalScore },
      durationMs
    );

    return { ranked: scored, scoreBreakdown, reasoning };
  }
}
