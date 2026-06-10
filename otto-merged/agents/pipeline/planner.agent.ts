// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/planner.agent.ts
// Stage 1 — Decomposes the user goal into a structured execution plan
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { callWithFallback } from "@/lib/llm";
import { logger } from "@/lib/logger";
import type { AgentRole } from "@/types/agent";
import type { PlannerInput, PlannerOutput, ReasoningStep } from "@/types/pipeline";
import type { DecisionTwinProfile } from "@/types/recommendation";

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the PlannerAgent for OTTO 2.0, an autonomous AI decision engine.

Your job is to decompose the user's shopping goal into a clear execution plan.
Respond ONLY with valid JSON matching this exact schema (no markdown, no prose):
{
  "decomposedGoal": string,          // 1 sentence restatement of intent
  "searchStrategy": string,          // e.g. "price-range filter + quality-bias ranking"
  "keyRequirements": string[],       // 3–5 must-have requirements extracted from goal
  "riskFlags": string[],             // 0–3 risks (budget too tight, vague goal, etc.)
  "twinProfileHints": {              // Estimated preference weights 0–100
    "budgetSensitivity": number,
    "deliveryPriority": number,
    "qualityFocus": number,
    "riskTolerance": number,
    "valueOrientation": number
  },
  "searchQuery": string              // Optimised Google Shopping / Exa search query
}
`.trim();

// ─────────────────────────────────────────────────────────────────────────────

export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutput> {
  readonly role: AgentRole = "orchestrator"; // closest existing role

  protected async run(taskId: string, input: PlannerInput): Promise<PlannerOutput> {
    const { goal } = input;
    const t0 = Date.now();

    logger.info("PlannerAgent", "Decomposing goal", { taskId, goal: goal.goal });

    const userMessage = `
Goal: ${goal.goal}
Budget: $${goal.budget}
Urgency: ${goal.urgency}
Constraints: ${goal.constraints || "none"}
Weights — Value: ${goal.weights.value}/10, Speed: ${goal.weights.speed}/10, Quality: ${goal.weights.quality}/10
    `.trim();

    let parsed: Omit<PlannerOutput, "reasoning">;
    let providerUsed = "rule-based";
    let modelUsed = "fallback";

    try {
      const llmResult = await callWithFallback("planner", SYSTEM_PROMPT, userMessage);
      if (llmResult.success && llmResult.data) {
        parsed = JSON.parse(llmResult.data.text) as typeof parsed;
        providerUsed = llmResult.data.provider;
        modelUsed = llmResult.data.model;
      } else {
        throw new Error(llmResult.error || "All LLM providers failed");
      }
    } catch (err) {
      logger.warn("PlannerAgent", "LLM call failed, using rule-based fallback", err);
      parsed = this.fallback(goal.goal, goal.budget, goal.urgency, goal.constraints);
    }

    const durationMs = Date.now() - t0;

    const reasoning: ReasoningStep = {
      agent: "PlannerAgent",
      action: "goal_decomposition",
      reasoning: `Decomposed goal into ${parsed.keyRequirements.length} requirements. Strategy: ${parsed.searchStrategy}. Risk flags: ${parsed.riskFlags.join(", ") || "none"}.`,
      confidence: parsed.riskFlags.length === 0 ? 0.95 : 0.75,
      durationMs,
      timestamp: new Date().toISOString(),
      provider: providerUsed,
      model: modelUsed,
    };

    this.recordStep("decompose_goal", { goal: goal.goal }, parsed, durationMs);

    return { ...parsed, reasoning };
  }

  // ── Rule-based fallback (when OpenAI is unavailable) ─────────────────────
  private fallback(
    goal: string,
    budget: number,
    urgency: string,
    constraints: string
  ): Omit<PlannerOutput, "reasoning"> {
    const isGift = /gift|friend|sister|brother|parent/i.test(goal);
    const isFast = urgency === "same-day" || urgency === "urgent";

    return {
      decomposedGoal: `Find the best product matching: ${goal}`,
      searchStrategy: isFast
        ? "speed-first filter with quality threshold"
        : "quality-weighted multi-factor scoring",
      keyRequirements: [
        `Budget under $${budget}`,
        ...(isFast ? ["Fast delivery required"] : []),
        ...(isGift ? ["Gift-suitable packaging"] : []),
        ...(constraints ? [constraints] : []),
      ].slice(0, 5),
      riskFlags: budget < 20 ? ["Budget may be very tight for this category"] : [],
      twinProfileHints: {
        budgetSensitivity: Math.round(Math.max(0, (100 - budget / 2))),
        deliveryPriority: isFast ? 80 : 50,
        qualityFocus: isGift ? 75 : 60,
        riskTolerance: 40,
        valueOrientation: 70,
      } as Partial<DecisionTwinProfile>,
      searchQuery: `${goal} under $${budget}${constraints ? " " + constraints : ""}`,
    };
  }
}
