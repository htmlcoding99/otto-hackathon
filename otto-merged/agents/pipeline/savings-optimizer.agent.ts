// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/savings-optimizer.agent.ts
// Stage 6 — Selects the winner and produces a complete savings analysis
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { callWithFallback } from "@/lib/llm";
import { logger } from "@/lib/logger";
import type { AgentRole } from "@/types/agent";
import type { Candidate } from "@/types/recommendation";
import type {
  SavingsOptimizerInput,
  SavingsOptimizerOutput,
  ReasoningStep,
} from "@/types/pipeline";

// ─────────────────────────────────────────────────────────────────────────────

export class SavingsOptimizerAgent extends BaseAgent<
  SavingsOptimizerInput,
  SavingsOptimizerOutput
> {
  readonly role: AgentRole = "decision";

  protected async run(
    taskId: string,
    input: SavingsOptimizerInput
  ): Promise<SavingsOptimizerOutput> {
    const { goal, ranked, rejected } = input;
    const t0 = Date.now();

    if (!ranked.length) {
      return {
        winner: {} as Candidate,
        estimatedSavings: 0,
        vsAvgSavings: 0,
        vsMostExpensiveSavings: 0,
        budgetRemaining: 0,
        savingsNarrative: "No candidates available to optimize savings.",
        reasoning: {
          agent: "SavingsOptimizerAgent",
          action: "winner_selection",
          reasoning: "No ranked candidates available.",
          confidence: 0,
          durationMs: Date.now() - t0,
          timestamp: new Date().toISOString(),
          provider: "rule-based",
          model: "fallback",
        },
      };
    }

    const winner: Candidate = ranked[0];
    const allPrices = ranked.map((c) => c.price);
    const avgPrice = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
    const maxPrice = Math.max(...allPrices);

    const estimatedSavings = Math.max(0, maxPrice - winner.price);
    const vsAvgSavings = Math.max(0, avgPrice - winner.price);
    const budgetRemaining = goal.budget - winner.price;

    logger.info("SavingsOptimizerAgent", "Optimizing winner selection", {
      taskId,
      winner: winner.name,
      estimatedSavings,
    });

    // ── AI narrative (with rule-based fallback) ───────────────────────────────
    let savingsNarrative = "";
    let providerUsed = "rule-based";
    let modelUsed = "fallback";

    try {
      const llmResult = await callWithFallback(
        "decision",
        "You are OTTO 2.0, an AI decision engine. Write a compelling 2-sentence savings narrative for the winning recommendation. Mention the specific savings amount, score, and why it beats the alternatives. Be enthusiastic but factual.",
        `Goal: ${goal.goal}
Winner: ${winner.name} — $${winner.price.toFixed(2)} — Score: ${winner.scores.finalScore}
vs Average: saves $${vsAvgSavings.toFixed(2)} | vs Most Expensive: saves $${estimatedSavings.toFixed(2)}
Budget remaining: $${budgetRemaining.toFixed(2)}
Candidates evaluated: ${ranked.length + rejected.length} (${rejected.length} eliminated)`
      );
      if (llmResult.success && llmResult.data) {
        savingsNarrative = llmResult.data.text;
        providerUsed = llmResult.data.provider;
        modelUsed = llmResult.data.model;
      } else {
        throw new Error(llmResult.error || "All LLM providers failed");
      }
    } catch (err) {
      logger.warn("SavingsOptimizerAgent", "LLM unavailable, using rule-based narrative", err);
      savingsNarrative = this.buildNarrative(winner, estimatedSavings, vsAvgSavings, budgetRemaining, ranked.length + rejected.length, rejected.length);
    }

    const durationMs = Date.now() - t0;

    const reasoning: ReasoningStep = {
      agent: "SavingsOptimizerAgent",
      action: "winner_selection",
      reasoning: `Selected "${winner.name}" (Score: ${winner.scores.finalScore}) as optimal. Saves $${estimatedSavings.toFixed(2)} vs most expensive, $${vsAvgSavings.toFixed(2)} vs avg. $${budgetRemaining.toFixed(2)} budget remaining.`,
      confidence: Math.min(0.99, winner.scores.finalScore / 100),
      durationMs,
      timestamp: new Date().toISOString(),
      provider: providerUsed,
      model: modelUsed,
    };

    this.recordStep(
      "select_winner",
      { rankedCount: ranked.length },
      {
        winner: winner.name,
        price: winner.price,
        estimatedSavings,
        vsAvgSavings,
        budgetRemaining,
      },
      durationMs
    );

    return {
      winner,
      estimatedSavings,
      vsAvgSavings,
      vsMostExpensiveSavings: estimatedSavings,
      budgetRemaining,
      savingsNarrative,
      reasoning,
    };
  }

  private buildNarrative(
    winner: Candidate,
    estimatedSavings: number,
    vsAvgSavings: number,
    budgetRemaining: number,
    total: number,
    eliminated: number
  ): string {
    return `After evaluating ${total} candidates and eliminating ${eliminated}, OTTO selected ${winner.name} as the optimal choice — saving you $${estimatedSavings.toFixed(2)} versus the most expensive option and $${vsAvgSavings.toFixed(2)} versus the average. With $${budgetRemaining.toFixed(2)} remaining in your budget, this recommendation achieves a score of ${winner.scores.finalScore}/100 across value, speed, and quality dimensions.`;
  }
}
