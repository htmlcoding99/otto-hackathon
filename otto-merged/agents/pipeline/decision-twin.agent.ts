// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/decision-twin.agent.ts
// Stage 2 — Builds a personalised DecisionTwin preference profile
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { callWithFallback } from "@/lib/llm";
import { logger } from "@/lib/logger";
import type { AgentRole } from "@/types/agent";
import type { DecisionTwinProfile } from "@/types/recommendation";
import type {
  DecisionTwinInput,
  DecisionTwinOutput,
  ReasoningStep,
} from "@/types/pipeline";

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the DecisionTwinAgent for OTTO 2.0.

Your job is to synthesise a preference profile (DecisionTwin) from the user's goal,
the planner's analysis, and any existing profile data.

Respond ONLY with valid JSON matching this schema:
{
  "profile": {
    "budgetSensitivity": number,   // 0–100
    "deliveryPriority": number,    // 0–100
    "qualityFocus": number,        // 0–100
    "riskTolerance": number,       // 0–100
    "valueOrientation": number,    // 0–100
    "decisionCount": number        // pass through from existing profile
  },
  "insight": string,              // 1-sentence profile summary
  "dominantTrait": string         // e.g. "budget-conscious", "quality-seeker", "speed-first"
}
`.trim();

// ─────────────────────────────────────────────────────────────────────────────

export class DecisionTwinAgent extends BaseAgent<DecisionTwinInput, DecisionTwinOutput> {
  readonly role: AgentRole = "orchestrator";

  protected async run(taskId: string, input: DecisionTwinInput): Promise<DecisionTwinOutput> {
    const { goal, plannerOutput, existingProfile, pastMissions } = input;
    const t0 = Date.now();

    logger.info("DecisionTwinAgent", "Building preference profile", { taskId });

    const pastSummary =
      pastMissions && pastMissions.length
        ? pastMissions
            .slice(0, 5)
            .map(
              (m) =>
                `• "${m.goal}"${m.pick ? ` → chose ${m.pick}` : ""}${
                  m.price != null ? ` ($${m.price})` : ""
                }`
            )
            .join("\n")
        : "none";

    const userMessage = `
Goal: ${goal.goal}
Budget: $${goal.budget}  Urgency: ${goal.urgency}
User-set weights — Value: ${goal.weights.value}/10, Speed: ${goal.weights.speed}/10, Quality: ${goal.weights.quality}/10

Planner hints: ${JSON.stringify(plannerOutput.twinProfileHints)}
Key requirements: ${plannerOutput.keyRequirements.join(", ")}
Risk flags: ${plannerOutput.riskFlags.join(", ") || "none"}

Existing profile (if any): ${existingProfile ? JSON.stringify(existingProfile) : "none"}

The user's recent past missions (use these to personalise the profile — e.g. if they
consistently picked cheaper or premium options, reflect that):
${pastSummary}
    `.trim();

    let parsed: { profile: DecisionTwinProfile; insight: string; dominantTrait: string };
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
      logger.warn("DecisionTwinAgent", "LLM unavailable, using rule-based profile", err);
      parsed = this.buildRuleBasedProfile(goal, plannerOutput, existingProfile);
    }

    // Ensure decisionCount is carried forward
    parsed.profile.decisionCount = existingProfile?.decisionCount ?? 0;

    const durationMs = Date.now() - t0;

    const reasoning: ReasoningStep = {
      agent: "DecisionTwinAgent",
      action: "profile_synthesis",
      reasoning: `Built profile for dominant trait "${parsed.dominantTrait}". Insight: ${parsed.insight}`,
      confidence: 0.88,
      durationMs,
      timestamp: new Date().toISOString(),
      provider: providerUsed,
      model: modelUsed,
    };

    this.recordStep("build_profile", { plannerHints: plannerOutput.twinProfileHints }, parsed, durationMs);

    return { ...parsed, reasoning };
  }

  // ── Rule-based fallback ───────────────────────────────────────────────────
  private buildRuleBasedProfile(
    goal: DecisionTwinInput["goal"],
    planner: DecisionTwinInput["plannerOutput"],
    existing?: Partial<DecisionTwinProfile>
  ): { profile: DecisionTwinProfile; insight: string; dominantTrait: string } {
    const hints = planner.twinProfileHints;

    const profile: DecisionTwinProfile = {
      budgetSensitivity: existing?.budgetSensitivity ?? hints.budgetSensitivity ?? 50,
      deliveryPriority: existing?.deliveryPriority ?? hints.deliveryPriority ?? 50,
      qualityFocus: existing?.qualityFocus ?? hints.qualityFocus ?? 60,
      riskTolerance: existing?.riskTolerance ?? hints.riskTolerance ?? 40,
      valueOrientation: existing?.valueOrientation ?? hints.valueOrientation ?? 70,
      decisionCount: existing?.decisionCount ?? 0,
    };

    // Blend with user-supplied weights
    profile.valueOrientation = Math.round((profile.valueOrientation + goal.weights.value * 10) / 2);
    profile.deliveryPriority = Math.round((profile.deliveryPriority + goal.weights.speed * 10) / 2);
    profile.qualityFocus = Math.round((profile.qualityFocus + goal.weights.quality * 10) / 2);

    const dominant =
      profile.budgetSensitivity > 70
        ? "budget-conscious"
        : profile.qualityFocus > 70
        ? "quality-seeker"
        : profile.deliveryPriority > 70
        ? "speed-first"
        : "balanced";

    return {
      profile,
      insight: `You balance value (${profile.valueOrientation}), quality (${profile.qualityFocus}), and speed (${profile.deliveryPriority}) with a ${dominant} lean.`,
      dominantTrait: dominant,
    };
  }
}
