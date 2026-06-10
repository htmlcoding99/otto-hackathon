// ─────────────────────────────────────────────────────────────────────────────
// services/exa.service.ts
// Exa Search Service Wrapper (REAL API VERSION)
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "@/lib/logger";

export interface ExaCandidate {
  name: string;
  price: number;
  url: string;
  description: string;
  reasoning_score: number;
  image?: string;          // og:image / preview thumbnail from the result page

  rating?: number;
  deliveryDays?: number;
  reviews?: number;
  features?: string[];
}

interface SearchParams {
  goal: string;
  budget: number;
  preferences: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL EXA API CALL (replaces mock system)
// ─────────────────────────────────────────────────────────────────────────────

// Collapse the raw scraped text Exa returns (titles + highlight snippets) into
// clean, human-readable strings. Exa highlights arrive full of embedded
// newlines, "[...]" elision markers, repeated price fragments, and FAQ
// boilerplate — dumping those straight into the UI looks like raw data.
function cleanText(input: string): string {
  return input
    .replace(/\[\.\.\.\]/g, " ")     // drop Exa's "[...]" elision markers
    .replace(/\s+/g, " ")             // collapse all whitespace (incl. newlines)
    .trim();
}

// A product title is a single line; take the first non-empty line and tidy it.
function cleanName(title: string): string {
  const firstLine = (title || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return cleanText(firstLine || title || "Untitled product");
}

// Build a readable description from Exa highlights: clean each snippet, drop
// price-only / empty fragments, de-duplicate, then cap the length.
function cleanDescription(highlights: string[] | undefined, fallback: string): string {
  const fragments = (highlights && highlights.length ? highlights : [fallback])
    .map(cleanText)
    .filter((s) => s.length > 0 && !/^\$?\d[\d.,]*$/.test(s)); // drop bare prices

  const seen = new Set<string>();
  const unique = fragments.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const joined = unique.join(" ");
  return joined.length > 280 ? joined.slice(0, 277).trimEnd() + "…" : joined;
}

async function executeExaSearch(
  query: string,
  maxPrice: number
): Promise<ExaCandidate[]> {
  logger.debug("ExaService", `REAL Exa search: "${query}"`);

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.EXA_API_KEY!,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      contents: {
        highlights: true,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Exa API error: ${res.status}`);
  }

  const data = await res.json();

  const results: ExaCandidate[] = (data.results || []).map((r: any) => ({
    name: cleanName(r.title),
    price: maxPrice, // Exa does NOT provide price → handled later in RankingEngine
    url: r.url,
    description: cleanDescription(r.highlights, r.text || ""),
    reasoning_score: 0.7,
    // Exa returns the page's og:image when one exists — used as the product
    // thumbnail in the UI. May be undefined for results with no preview image.
    image: typeof r.image === "string" && r.image.startsWith("http") ? r.image : undefined,
  }));

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS (keeps retry + fallback logic)
// ─────────────────────────────────────────────────────────────────────────────

export class ExaService {
  private static MAX_RETRIES = 2;

  static async searchCandidates({
    goal,
    budget,
    preferences,
  }: SearchParams): Promise<ExaCandidate[]> {
    let attempt = 0;
    let lastError: Error | null = null;

    const strictQuery = `${goal} under $${budget} ${preferences}`.trim();

    // ── PHASE 1: STRICT SEARCH ─────────────────────────────────────────────
    while (attempt < this.MAX_RETRIES) {
      try {
        const results = await executeExaSearch(strictQuery, budget);

        if (results.length > 0) {
          logger.info("ExaService", "Strict search success", {
            count: results.length,
          });

          return this.normalizeScores(results);
        }

        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;

        logger.warn(
          "ExaService",
          `Strict search failed (${attempt}/${this.MAX_RETRIES})`,
          { error: lastError.message }
        );

        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    // ── PHASE 2: EXPANDED SEARCH ────────────────────────────────────────────
    logger.info("ExaService", "Falling back to expanded search");

    const broadQuery = `${goal} best options`.trim();
    attempt = 0;

    while (attempt < this.MAX_RETRIES) {
      try {
        const results = await executeExaSearch(broadQuery, budget * 1.5);

        if (results.length > 0) {
          logger.info("ExaService", "Expanded search success", {
            count: results.length,
          });

          return this.normalizeScores(results);
        }

        return [];
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;

        logger.warn(
          "ExaService",
          `Expanded search failed (${attempt}/${this.MAX_RETRIES})`,
          { error: lastError.message }
        );

        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    throw new Error(
      `Exa search failed after retries. Last error: ${lastError?.message}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  private static normalizeScores(
    candidates: ExaCandidate[]
  ): ExaCandidate[] {
    return candidates
      .map((c) => ({
        ...c,
        reasoning_score: Math.min(1, Math.max(0, c.reasoning_score)),
      }))
      .sort((a, b) => b.reasoning_score - a.reasoning_score);
  }
}