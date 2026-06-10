// ─────────────────────────────────────────────────────────────────────────────
// services/scoring.service.ts
// Pure scoring & ranking logic extracted from the legacy frontend
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Candidate,
  CandidateScores,
  DecisionTwinProfile,
  RejectedCandidate,
} from "@/types/recommendation";
import type { Task } from "@/types/task";

const DELIVERY_SCORE_MAP: Record<number, number> = {
  1: 100,
  2: 90,
  3: 75,
  4: 55,
  5: 35,
  6: 20,
};

// ─────────────────────────────────────────────────────────────────────────────

function scoreOne(
  c: Candidate,
  task: Task,
  profile: DecisionTwinProfile
): CandidateScores {
  const { budget, weights } = task;
  const wv = weights.value / 10;
  const ws = weights.speed / 10;
  const wq = weights.quality / 10;

  const valueScore = Math.max(0, Math.round(((budget - c.price) / budget) * 100));
  const deliveryScore = DELIVERY_SCORE_MAP[Math.min(c.deliveryDays, 6)] ?? 15;
  const qualityScore = Math.round(((c.rating - 3.5) / 1.5) * 100);

  let prefFit = 50;
  if (profile.budgetSensitivity > 60 && valueScore > 60) prefFit += 20;
  if (profile.deliveryPriority > 60 && deliveryScore > 75) prefFit += 15;
  if (profile.qualityFocus > 65 && qualityScore > 80) prefFit += 15;
  prefFit = Math.min(100, prefFit);

  const totalWeight = wv + ws + wq + 1 + 0.5;
  const finalScore = Math.round(
    (valueScore * wv +
      deliveryScore * ws +
      qualityScore * wq +
      qualityScore * 1 +
      prefFit * 0.5) /
      totalWeight
  );

  return { valueScore, deliveryScore, qualityScore, savingsScore: 0, prefFit, finalScore };
}

function applySavingsScores(candidates: Candidate[]): void {
  const avgPrice =
    candidates.reduce((s, c) => s + c.price, 0) / candidates.length;
  for (const c of candidates) {
    const saved = Math.max(0, avgPrice - c.price);
    c.scores.savingsScore = Math.min(100, Math.round((saved / avgPrice) * 100));
  }
}

function applySavingsWeighting(candidates: Candidate[]): void {
  for (const c of candidates) {
    c.scores.finalScore = Math.round(
      c.scores.finalScore * 0.8 + c.scores.savingsScore * 0.2
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface FilterAndRankResult {
  ranked: Candidate[];
  rejected: RejectedCandidate[];
}

export const ScoringService = {
  /**
   * Filter out candidates that violate hard constraints (budget, urgency,
   * minimum rating), score the rest, and return them sorted by finalScore.
   */
  filterAndRank(
    candidates: Candidate[],
    task: Task,
    profile: DecisionTwinProfile
  ): FilterAndRankResult {
    const ranked: Candidate[] = [];
    const rejected: RejectedCandidate[] = [];

    for (const c of candidates) {
      if (c.price > task.budget) {
        rejected.push({ ...c, rejectedReason: `Over budget ($${c.price} > $${task.budget})` });
        continue;
      }
      if (task.urgency === "same-day" && c.deliveryDays > 1) {
        rejected.push({ ...c, rejectedReason: `Same-day unavailable (${c.deliveryDays}-day ship)` });
        continue;
      }
      if (task.urgency === "urgent" && c.deliveryDays > 3) {
        rejected.push({ ...c, rejectedReason: `Too slow for urgent (${c.deliveryDays} days)` });
        continue;
      }
      if (c.rating < 4.2) {
        rejected.push({ ...c, rejectedReason: `Below quality threshold (${c.rating}★ < 4.2★)` });
        continue;
      }

      c.scores = scoreOne(c, task, profile);
      ranked.push(c);
    }

    applySavingsScores(ranked);
    applySavingsWeighting(ranked);
    ranked.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    return { ranked, rejected };
  },
};
