// ─────────────────────────────────────────────────────────────────────────────
// agents/researcher.agent.ts
// Fetches and normalises candidate products for a given task
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "./base.agent";
import { callWithFallback } from "@/lib/llm";
import { CandidateService } from "@/services/candidate.service";
import type { AgentRole } from "@/types/agent";
import type { Candidate } from "@/types/recommendation";

interface ResearcherInput {
  goal: string;
  budget: number;
  constraints: string;
}

interface ResearcherOutput {
  candidates: Candidate[];
  sourceQuery: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class ResearcherAgent extends BaseAgent<ResearcherInput, ResearcherOutput> {
  readonly role: AgentRole = "researcher";

  protected async run(taskId: string, input: ResearcherInput): Promise<ResearcherOutput> {
    const { goal, budget, constraints } = input;
    const t0 = Date.now();

    let query = `${goal} under $${budget}`; // default fallback
    const llmResult = await callWithFallback(
      "research",
      "You are a shopping research assistant. Given a user goal, budget, and constraints, output a precise Google Shopping search query (max 10 words). Output ONLY the query string.",
      `Goal: ${goal}\nBudget: $${budget}\nConstraints: ${constraints || "none"}`
    );
    if (llmResult.success && llmResult.data) {
      query = llmResult.data.text;
    }
    this.recordStep("generate_query", { goal, budget }, { query }, Date.now() - t0);

    // Step 2: Fetch candidates via live Exa search + LLM enrichment.
    const t1 = Date.now();
    const candidates: Candidate[] = await CandidateService.fetch({
      goal,
      budget,
      preferences: constraints,
    });
    this.recordStep("fetch_candidates", { query }, { count: candidates.length }, Date.now() - t1);

    return { candidates, sourceQuery: query };
  }
}
