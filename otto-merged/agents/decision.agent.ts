// ─────────────────────────────────────────────────────────────────────────────
// agents/decision.agent.ts
// Selects the best candidate and produces a human-readable rationale
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "./base.agent";
import { chatCompletion } from "@/lib/openai";
import { logger } from "@/lib/logger";
import type { AgentRole } from "@/types/agent";
import type { Candidate } from "@/types/recommendation";

interface DecisionInput {
  ranked: Candidate[];
  goal: string;
  budget: number;
}

interface DecisionOutput {
  winner: Candidate;
  confidence: number;
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class DecisionAgent extends BaseAgent<DecisionInput, DecisionOutput> {
  readonly role: AgentRole = "decision";

  protected async run(taskId: string, input: DecisionInput): Promise<DecisionOutput> {
    const { ranked, goal, budget } = input;

    if (!ranked.length) {
      return {
        winner: {} as Candidate,
        confidence: 0,
        reasoning: "No ranked candidates to decide on.",
      };
    }

    const winner = ranked[0];
    const confidence = Math.min(98, winner.scores.finalScore + 10);

    // AI-generated reasoning
    let reasoning = "";
    const t0 = Date.now();
    const llmResult = await chatCompletion(
      "You are OTTO, an autonomous AI decision engine. Given the winning recommendation and context, write a compelling 2-sentence rationale for why this is the optimal choice. Be specific about the scores and savings.",
      `Goal: ${goal}\nBudget: $${budget}\nWinner: ${winner.name}\nPrice: $${winner.price}\nFinal Score: ${winner.scores.finalScore}\nValue: ${winner.scores.valueScore} | Speed: ${winner.scores.deliveryScore} | Quality: ${winner.scores.qualityScore}`
    );
    if (llmResult.success && llmResult.data) {
      reasoning = llmResult.data;
    } else {
      logger.warn("DecisionAgent", "AI reasoning unavailable, using default", llmResult.error);
      reasoning = `${winner.name} achieved the highest composite score (${winner.scores.finalScore}) across value, delivery, and quality, making it the optimal choice within your $${budget} budget.`;
    }

    this.recordStep(
      "select_winner",
      { candidatesEvaluated: ranked.length },
      { winner: winner.name, confidence, reasoningLength: reasoning.length },
      Date.now() - t0
    );

    return { winner, confidence, reasoning };
  }
}
