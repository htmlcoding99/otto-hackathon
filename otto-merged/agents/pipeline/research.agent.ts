// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/research.agent.ts
// Stage 3 — Fetches candidate products via LIVE Exa web search.
// ─────────────────────────────────────────────────────────────────────────────
//
// Uses CandidateService, which runs a real Exa search and then enriches each
// result with an LLM step to estimate the commerce attributes Exa can't supply
// (price, rating, delivery, reviews). Requires EXA_API_KEY + an LLM key.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { logger } from "@/lib/logger";
import { CandidateService } from "@/services/candidate.service";
import type { AgentRole } from "@/types/agent";
import type { Candidate } from "@/types/recommendation";
import type { ResearchInput, ResearchOutput, ReasoningStep } from "@/types/pipeline";

// ─────────────────────────────────────────────────────────────────────────────

export class ResearchAgent extends BaseAgent<ResearchInput, ResearchOutput> {
  readonly role: AgentRole = "researcher";

  protected async run(taskId: string, input: ResearchInput): Promise<ResearchOutput> {
    const { goal, searchQuery } = input;
    const t0 = Date.now();

    logger.info("ResearchAgent", "Running live Exa search via CandidateService", { taskId, query: searchQuery });

    // Live Exa search + LLM commerce-attribute enrichment (price, rating, …).
    const candidates: Candidate[] = await CandidateService.fetch({
      goal: searchQuery,
      budget: goal.budget,
      preferences: goal.constraints,
    });

    const durationMs = Date.now() - t0;

    const reasoning: ReasoningStep = {
      agent: "ResearchAgent",
      action: "exa_search",
      reasoning: `Live Exa search for "${searchQuery}" returned ${candidates.length} real web results, enriched with estimated pricing.`,
      confidence: 0.9,
      durationMs,
      timestamp: new Date().toISOString(),
      provider: "exa",
      model: "exa-neural",
    };

    this.recordStep("exa_search", { query: searchQuery }, { count: candidates.length }, durationMs);

    return { candidates, totalFound: candidates.length, source: "exa", reasoning };
  }
}
