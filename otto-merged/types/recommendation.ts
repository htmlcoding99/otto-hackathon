// ─────────────────────────────────────────────────────────────────────────────
// types/recommendation.ts
// Candidate scoring & recommendation types
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeType = "top" | "fast" | "value" | "premium" | "eco";

export interface CandidateScores {
  valueScore: number;     // 0–100
  deliveryScore: number;  // 0–100
  qualityScore: number;   // 0–100
  savingsScore: number;   // 0–100
  prefFit: number;        // 0–100
  finalScore: number;     // 0–100  (composite)
  explanations?: Record<string, string>; // e.g. { valueScore: "...", ... }
}

export interface Candidate {
  id: string;
  name: string;
  price: number;
  rating: number;
  deliveryDays: number;
  reviews: number;
  url: string;
  description: string;
  features: string[];
  badges: BadgeType[];
  scores: CandidateScores;
  source?: string; // e.g. "amazon", "google_shopping"
  image?: string;  // product preview thumbnail (from the result page's og:image)
}

export interface RejectedCandidate extends Omit<Candidate, "scores"> {
  rejectedReason: string;
}

export interface DecisionTwinProfile {
  budgetSensitivity: number;   // 0–100
  deliveryPriority: number;    // 0–100
  qualityFocus: number;        // 0–100
  riskTolerance: number;       // 0–100
  valueOrientation: number;    // 0–100
  decisionCount: number;
}

export interface RecommendationRequest {
  taskId: string;
  twinProfile?: Partial<DecisionTwinProfile>;
}

export interface RecommendationResponse {
  taskId: string;
  winner: Candidate;
  ranked: Candidate[];
  rejected: RejectedCandidate[];
  confidence: number; // 0–100
  reasoning: string;
  estimatedSavings: number;
  generatedAt: string;
}
