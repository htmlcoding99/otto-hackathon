// ─────────────────────────────────────────────────────────────────────────────
// services/candidate.service.ts
// Turns raw web results into fully-typed, scoreable Candidates.
//
// Pipeline (mirrors the legacy Research → Budget agents):
//   1. ExaService  → live web search (name, url, description)
//   2. LLM "budget" pass → estimate price, rating, deliveryDays, reviews, features
//      (Exa does not expose commerce metadata, so we infer it the same way the
//       original OTTO Budget agent did.)
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import { callWithFallback } from "@/lib/llm";
import { ExaService, type ExaCandidate } from "./exa.service";
import type { Candidate, CandidateScores } from "@/types/recommendation";

const EMPTY_SCORES: CandidateScores = {
  valueScore: 0,
  deliveryScore: 0,
  qualityScore: 0,
  savingsScore: 0,
  prefFit: 0,
  finalScore: 0,
};

interface FetchParams {
  goal: string;
  budget: number;
  preferences?: string;
}

// ── LLM enrichment ────────────────────────────────────────────────────────────
// Ask a fast model to estimate the commerce attributes Exa can't provide.
// Returns a map keyed by the candidate's 1-based index.
interface EnrichedAttrs {
  price: number;
  rating: number;
  deliveryDays: number;
  reviews: number;
  features: string[];
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function enrichWithLLM(
  raw: ExaCandidate[],
  goal: string,
  budget: number
): Promise<Map<number, EnrichedAttrs>> {
  const listing = raw
    .map(
      (c, i) =>
        `[${i + 1}] ${c.name}\n${(c.description || "").slice(0, 300)}`
    )
    .join("\n\n");

  const system =
    "You are OTTO's Budget agent. For each numbered product/listing, estimate realistic commerce attributes. " +
    "Reply with ONLY a JSON array (no prose, no markdown) where each element is " +
    '{"ref": <number>, "price": <usd number>, "rating": <number 1-5>, "deliveryDays": <integer 1-7>, "reviews": <integer>, "features": <string[]>}. ' +
    "Base estimates on the listing text and the user's budget. Prices should be plausible for the item, not always at the budget cap. " +
    "Vary the ratings realistically to one decimal between 3.9 and 4.9 based on each listing's quality signals — do NOT give every item the same rating (e.g. avoid making everything 4.5).";

  const user = `Goal: ${goal}\nBudget: $${budget}\n\nListings:\n${listing}`;

  const result = await callWithFallback("budget", system, user);
  const map = new Map<number, EnrichedAttrs>();

  if (!result.success || !result.data) {
    logger.warn("CandidateService", "LLM enrichment unavailable, using heuristics", {
      error: result.error,
    });
    return map;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(result.data.text));
    const rows: any[] = Array.isArray(parsed) ? parsed : parsed.candidates ?? [];
    for (const row of rows) {
      const ref = Number(row.ref);
      if (!Number.isFinite(ref)) continue;
      map.set(ref, {
        price: Number(row.price),
        rating: Number(row.rating),
        deliveryDays: Math.round(Number(row.deliveryDays)),
        reviews: Math.round(Number(row.reviews)),
        features: Array.isArray(row.features) ? row.features.map(String) : [],
      });
    }
  } catch (e) {
    logger.warn("CandidateService", "Failed to parse LLM enrichment JSON", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return map;
}

// Deterministic fallback when the LLM can't supply an attribute, so the
// downstream scoring/filtering pipeline always has usable numbers.
function heuristicAttrs(index: number, budget: number): EnrichedAttrs {
  const ratio = 0.95 - (index % 4) * 0.1; // spread prices below budget
  return {
    price: Math.round(budget * Math.max(0.4, ratio)),
    rating: 4.3 + (index % 3) * 0.2,
    deliveryDays: 2 + (index % 3),
    reviews: 150 + index * 37,
    features: [],
  };
}

function isUsable(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

// ─────────────────────────────────────────────────────────────────────────────

export const CandidateService = {
  /**
   * Fetch and fully hydrate candidates for a task. Returns Candidates with
   * zeroed scores — the ScoringService / RankingEngine fills those in.
   */
  async fetch({ goal, budget, preferences = "" }: FetchParams): Promise<Candidate[]> {
    const raw = await ExaService.searchCandidates({ goal, budget, preferences });
    if (!raw.length) {
      logger.warn("CandidateService", "Exa returned no candidates", { goal });
      return [];
    }

    const enrichment = await enrichWithLLM(raw, goal, budget);

    return raw.map((r, i) => {
      const llm = enrichment.get(i + 1);
      const fallback = heuristicAttrs(i, budget);

      const price = llm && isUsable(llm.price) ? llm.price : fallback.price;
      const rating = llm && isUsable(llm.rating) ? Math.min(5, llm.rating) : fallback.rating;
      const deliveryDays =
        llm && isUsable(llm.deliveryDays) ? llm.deliveryDays : fallback.deliveryDays;
      const reviews = llm && isUsable(llm.reviews) ? llm.reviews : fallback.reviews;
      const features = llm && llm.features.length ? llm.features : r.features ?? [];

      const candidate: Candidate = {
        id: uuidv4(),
        name: r.name,
        price,
        rating,
        deliveryDays,
        reviews,
        url: r.url,
        description: r.description,
        features,
        badges: [],
        scores: { ...EMPTY_SCORES },
        source: "exa",
      };
      return candidate;
    });
  },
};
