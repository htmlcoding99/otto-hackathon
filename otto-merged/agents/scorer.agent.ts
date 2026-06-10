// ─────────────────────────────────────────────────────────────────────────────
// agents/scorer.agent.ts
// Applies the OTTO scoring engine to a list of candidates
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "./base.agent";
import { ScoringService } from "@/services/scoring.service";
import type { AgentRole } from "@/types/agent";
import type { Candidate, DecisionTwinProfile, RejectedCandidate } from "@/types/recommendation";
import type { Task } from "@/types/task";

interface ScorerInput {
  candidates: Candidate[];
  task: Task;
  profile: DecisionTwinProfile;
}

interface ScorerOutput {
  ranked: Candidate[];
  rejected: RejectedCandidate[];
}

// ─────────────────────────────────────────────────────────────────────────────

export class ScorerAgent extends BaseAgent<ScorerInput, ScorerOutput> {
  readonly role: AgentRole = "scorer";

  protected async run(_taskId: string, input: ScorerInput): Promise<ScorerOutput> {
    const t0 = Date.now();

    const { ranked, rejected } = ScoringService.filterAndRank(
      input.candidates,
      input.task,
      input.profile
    );

    this.recordStep(
      "filter_and_rank",
      { total: input.candidates.length },
      { ranked: ranked.length, rejected: rejected.length },
      Date.now() - t0
    );

    return { ranked, rejected };
  }
}
