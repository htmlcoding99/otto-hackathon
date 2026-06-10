// ─────────────────────────────────────────────────────────────────────────────
// types/pipeline.ts
// Shared interfaces for the OTTO 2.0 agent pipeline
// Every agent accepts PipelineInput<TContext> → returns PipelineOutput<TResult>
// ─────────────────────────────────────────────────────────────────────────────

import type { DecisionTwinProfile, Candidate, RejectedCandidate } from "./recommendation";
import type { Task } from "./task";

// ── Pipeline-level context ────────────────────────────────────────────────────

/** The immutable goal spec that flows through every agent unchanged */
export interface GoalSpec {
  taskId: string;
  goal: string;
  budget: number;
  urgency: "same-day" | "urgent" | "standard" | "flexible";
  constraints: string;
  weights: { value: number; speed: number; quality: number };
}

// ── Per-agent reasoning log ───────────────────────────────────────────────────

export interface ReasoningStep {
  agent: string;
  action: string;
  reasoning: string;
  confidence: number; // 0–1
  durationMs: number;
  timestamp: string;
  provider?: string;
  model?: string;
}

// ── Agent I/O contracts ───────────────────────────────────────────────────────

/** 1. PlannerAgent */
export interface PlannerInput {
  goal: GoalSpec;
}
export interface PlannerOutput {
  decomposedGoal: string;
  searchStrategy: string;
  keyRequirements: string[];
  riskFlags: string[];
  twinProfileHints: Partial<DecisionTwinProfile>;
  searchQuery: string;
  reasoning: ReasoningStep;
}

/** 2. DecisionTwinAgent */
// A compact summary of a previously-run mission, used to personalise new runs.
export interface PastMission {
  goal: string;
  pick?: string;   // name of the winner the user landed on
  price?: number;
}

export interface DecisionTwinInput {
  goal: GoalSpec;
  plannerOutput: PlannerOutput;
  existingProfile?: Partial<DecisionTwinProfile>;
  pastMissions?: PastMission[];
}
export interface DecisionTwinOutput {
  profile: DecisionTwinProfile;
  insight: string;
  dominantTrait: string;
  reasoning: ReasoningStep;
}

/** 3. ResearchAgent */
export interface ResearchInput {
  goal: GoalSpec;
  searchQuery: string;
  profile: DecisionTwinProfile;
}
export interface ResearchOutput {
  candidates: Candidate[];
  totalFound: number;
  source: "mock-exa" | "exa" | "serp" | "amazon";
  reasoning: ReasoningStep;
}

/** 4. ConstraintAnalysisAgent */
export interface ConstraintAnalysisInput {
  goal: GoalSpec;
  candidates: Candidate[];
  profile: DecisionTwinProfile;
}
export interface ConstraintAnalysisOutput {
  passed: Candidate[];
  rejected: RejectedCandidate[];
  hardConstraintsApplied: string[];
  softConstraintsApplied: string[];
  eliminationRate: number; // 0–1
  reasoning: ReasoningStep;
}

/** 5. RankingAgent */
export interface RankingInput {
  goal: GoalSpec;
  candidates: Candidate[];
  profile: DecisionTwinProfile;
}
export interface RankingOutput {
  ranked: Candidate[];
  scoreBreakdown: Record<string, number>; // candidateId → finalScore
  reasoning: ReasoningStep;
}

/** 6. SavingsOptimizerAgent */
export interface SavingsOptimizerInput {
  goal: GoalSpec;
  ranked: Candidate[];
  rejected: RejectedCandidate[];
  profile: DecisionTwinProfile;
}
export interface SavingsOptimizerOutput {
  winner: Candidate;
  estimatedSavings: number;
  vsAvgSavings: number;
  vsMostExpensiveSavings: number;
  budgetRemaining: number;
  savingsNarrative: string;
  reasoning: ReasoningStep;
}

// ── Final pipeline result ─────────────────────────────────────────────────────

export interface PipelineResult {
  taskId: string;
  goal: GoalSpec;

  // Stage outputs
  planner: PlannerOutput;
  decisionTwin: DecisionTwinOutput;
  research: ResearchOutput;
  constraintAnalysis: ConstraintAnalysisOutput;
  ranking: RankingOutput;
  savingsOptimizer: SavingsOptimizerOutput;

  // Final recommendation
  winner: Candidate;
  ranked: Candidate[];
  rejected: RejectedCandidate[];
  confidence: number;
  finalReasoning: string;

  // Observability
  reasoningChain: ReasoningStep[];
  totalDurationMs: number;
  completedAt: string;
}

export interface PipelineError {
  stage:
    | "planner"
    | "decision-twin"
    | "research"
    | "constraint-analysis"
    | "ranking"
    | "savings-optimizer";
  message: string;
  taskId: string;
}
