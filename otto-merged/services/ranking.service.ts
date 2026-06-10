// ─────────────────────────────────────────────────────────────────────────────
// services/ranking.service.ts
// Deterministic, Explainable Ranking Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { Candidate, DecisionTwinProfile, CandidateScores } from "@/types/recommendation";

const DELIVERY_SCORE_MAP: Record<number, number> = {
  1: 100,
  2: 90,
  3: 75,
  4: 55,
  5: 35,
  6: 20,
};

export class RankingEngine {
  /**
   * Main entry point to rank candidates and attach explanations.
   */
  static rank(
    candidates: Candidate[],
    budget: number,
    weights: { value: number; speed: number; quality: number },
    profile: DecisionTwinProfile
  ): Candidate[] {
    if (!candidates.length) return [];

    // Step 1: Compute baseline scores and explanations
    const scored = candidates.map(c => ({
      ...c,
      scores: this.computeScores(c, budget, weights, profile),
    }));

    // Step 2: Compute relative savings score
    this.applySavingsScores(scored);

    // Step 3: Blend savings into final score
    this.blendFinalScore(scored);

    // Step 4: Sort by final score descending
    scored.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    // Step 5: Assign badges based on the whole group
    this.assignBadges(scored);

    return scored;
  }

  private static computeScores(
    c: Candidate,
    budget: number,
    weights: { value: number; speed: number; quality: number },
    profile: DecisionTwinProfile
  ): CandidateScores {
    const explanations: Record<string, string> = {};

    // 1. Value Score
    const valueScore = Math.max(0, Math.round(((budget - c.price) / budget) * 100));
    explanations.valueScore = `Base value score of ${valueScore} derived from $${c.price} price against $${budget} budget.`;

    // 2. Delivery Score
    const deliveryDays = Math.min(c.deliveryDays, 6);
    const deliveryScore = DELIVERY_SCORE_MAP[deliveryDays] ?? 15;
    explanations.deliveryScore = `Delivery in ${c.deliveryDays} days maps to a speed score of ${deliveryScore}/100.`;

    // 3. Quality Score
    const qualityScore = Math.round(((c.rating - 3.5) / 1.5) * 100);
    explanations.qualityScore = `Rating of ${c.rating} yields a quality score of ${qualityScore}/100.`;

    // 4. Preference Fit (Decision Twin Alignment)
    let prefFit = 50;
    const prefReasons: string[] = [];
    if (profile.budgetSensitivity > 60 && valueScore > 60) {
      prefFit += 20;
      prefReasons.push("High budget sensitivity aligns with good value.");
    }
    if (profile.deliveryPriority > 60 && deliveryScore > 75) {
      prefFit += 15;
      prefReasons.push("High delivery priority aligns with fast shipping.");
    }
    if (profile.qualityFocus > 65 && qualityScore > 80) {
      prefFit += 15;
      prefReasons.push("High quality focus aligns with top ratings.");
    }
    prefFit = Math.min(100, prefFit);
    explanations.prefFit = `Base 50. ${prefReasons.join(" ")} Total: ${prefFit}/100.`;

    // 5. Final Score — a clean weighted average of the three user-weighted
    //    dimensions, then nudged by Decision-Twin preference fit. Quality is NOT
    //    double-counted (the old formula added it twice, which squashed every
    //    candidate into the same mid-40s/50s band).
    const wv = weights.value / 10;
    const ws = weights.speed / 10;
    const wq = weights.quality / 10;
    const totalWeight = wv + ws + wq || 1;

    const weighted =
      (valueScore * wv + deliveryScore * ws + qualityScore * wq) / totalWeight;

    // prefFit acts as a ±modifier (15% of the score) rather than a flat term.
    const finalScore = Math.round(Math.min(100, weighted * 0.85 + prefFit * 0.15));

    explanations.finalScore = `Weighted average (V:${wv}, S:${ws}, Q:${wq}) blended 85/15 with preference fit.`;

    return { valueScore, deliveryScore, qualityScore, savingsScore: 0, prefFit, finalScore, explanations };
  }

  private static applySavingsScores(candidates: Candidate[]): void {
    const avgPrice = candidates.reduce((s, c) => s + c.price, 0) / candidates.length;
    for (const c of candidates) {
      const saved = Math.max(0, avgPrice - c.price);
      c.scores.savingsScore = Math.min(100, Math.round((saved / avgPrice) * 100));
      if (c.scores.explanations) {
        c.scores.explanations.savingsScore = `Saves $${saved.toFixed(2)} compared to category average ($${avgPrice.toFixed(2)}).`;
      }
    }
  }

  private static blendFinalScore(candidates: Candidate[]): void {
    // Savings is an ADDITIVE bonus (up to +15), not a 0.8 multiplier. The old
    // version multiplied the score by 0.8, so any candidate priced at/above the
    // category average (savings = 0) — and every single-candidate result — got
    // deflated ~20% (e.g. a real 60 was shown as 48).
    for (const c of candidates) {
      const bonus = Math.round(c.scores.savingsScore * 0.15);
      c.scores.finalScore = Math.min(100, c.scores.finalScore + bonus);
      if (c.scores.explanations) {
        c.scores.explanations.finalScore += ` +${bonus} savings bonus. Final: ${c.scores.finalScore}/100.`;
      }
    }
  }

  private static assignBadges(candidates: Candidate[]): void {
    if (!candidates.length) return;
    const maxScore = Math.max(...candidates.map((c) => c.scores.finalScore));
    const minPrice = Math.min(...candidates.map((c) => c.price));
    const maxRating = Math.max(...candidates.map((c) => c.rating));
    const minDelivery = Math.min(...candidates.map((c) => c.deliveryDays));

    for (const c of candidates) {
      const badges = new Set(c.badges);
      if (c.scores.finalScore === maxScore) badges.add("top");
      if (c.price === minPrice) badges.add("value");
      if (c.rating === maxRating) badges.add("premium");
      if (c.deliveryDays === minDelivery) badges.add("fast");
      c.badges = [...badges] as Candidate["badges"];
    }
  }
}
