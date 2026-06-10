// ─────────────────────────────────────────────────────────────────────────────
// lib/moderation.ts
// Obfuscation-resistant content moderation for user-supplied goals/constraints.
//
// OTTO is a legitimate shopping assistant. This blocks requests that clearly
// involve illegal or prohibited items (drugs, weapons/explosives, explicit
// content, violence-for-hire) before they reach the live search + pipeline.
//
// Robustness — beyond exact keywords, this resists common evasion tricks:
//   • leetspeak           "m3th", "c0caine", "h3r0in"
//   • in-word separators  "m.e.t.h", "m-e-t-h", "m*e*t*h"
//   • spaced-out letters  "m e t h"
//   • repeated letters    "methhh", "cocaaaine"
// while staying deterministic (no extra API/latency).
//
// False-positive care — word-boundary anchoring avoids the "Scunthorpe problem"
// ("meth" ∌ "method"), and we deliberately exclude ambiguous terms so common
// legitimate products are NOT blocked: bath BOMB, LG C4 TV, ASSASSIN's Creed,
// surge SUPPRESSOR, Black OPIUM perfume, nerf GUN, etc.
// ─────────────────────────────────────────────────────────────────────────────

export type ModerationCategory =
  | "illegal-drugs"
  | "weapons-explosives"
  | "explicit-content"
  | "violence";

export interface ModerationResult {
  allowed: boolean;
  category?: ModerationCategory;
  /** User-facing explanation, safe to display in the UI. */
  reason?: string;
}

const BLOCKLIST: Record<ModerationCategory, string[]> = {
  "illegal-drugs": [
    "meth", "methamphetamine", "crystal meth", "cocaine", "crack cocaine",
    "heroin", "fentanyl", "mdma", "ecstasy", "lsd", "pcp", "magic mushrooms",
    "illegal drugs",
  ],
  "weapons-explosives": [
    "firearm", "firearms", "handgun", "handguns", "pistol", "rifle", "shotgun",
    "ammunition", "ammo", "assault rifle", "machine gun", "ghost gun", "ar-15",
    "ak-47", "silencer", "grenade", "dynamite", "tnt", "pipe bomb", "car bomb",
    "build a bomb", "make a bomb", "explosives", "anthrax", "sarin", "ricin",
  ],
  "explicit-content": [
    "porn", "pornography", "child porn", "csam", "escort service",
    "prostitute", "prostitution",
  ],
  violence: [
    "hitman", "hit man", "assassinate", "kill someone", "human trafficking",
  ],
};

const CATEGORY_LABEL: Record<ModerationCategory, string> = {
  "illegal-drugs": "illegal drugs",
  "weapons-explosives": "weapons or explosives",
  "explicit-content": "explicit content",
  violence: "violence or other illegal activity",
};

// ── Normalization ─────────────────────────────────────────────────────────────

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
  "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i",
};

function applyLeet(s: string): string {
  let out = "";
  for (const ch of s) out += LEET[ch] ?? ch;
  return out;
}

/** Lowercase + leetspeak → letters. Keeps spaces/separators (regex handles them). */
function normalize(s: string): string {
  return applyLeet(s.toLowerCase());
}

/** Collapse runs of 3+ single-letter tokens ("m e t h" → "meth"). */
function joinSpacedLetters(s: string): string {
  return s.replace(/\b[a-z](?:\s+[a-z]\b){2,}/g, (m) => m.replace(/\s+/g, ""));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Separators tolerated *within* a word ("m.e.t.h"); excludes whitespace so we
// never bridge two separate words (avoids "some thing" → "meth" false matches).
const IN_WORD_SEP = "[._\\-*'`~]*";
// Separators tolerated *between* words of a multi-word term ("pipe-bomb").
const BETWEEN_WORDS = "[\\s._\\-*'`~]+";

/**
 * Build a flexible, boundary-anchored regex for one term. Each letter may repeat
 * and be split by in-word separators; multi-word terms allow space/punct gaps.
 */
function buildTermRegex(term: string): RegExp {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  const wordPattern = (w: string) =>
    Array.from(w)
      .filter((c) => /[a-z0-9]/.test(c)) // drop separators baked into the term
      .map((c) => escapeRegExp(c) + "+")
      .join(IN_WORD_SEP);
  return new RegExp("\\b" + words.map(wordPattern).join(BETWEEN_WORDS) + "\\b", "i");
}

const COMPILED: { category: ModerationCategory; regex: RegExp }[] = (
  Object.entries(BLOCKLIST) as [ModerationCategory, string[]][]
).flatMap(([category, terms]) =>
  terms.map((term) => ({ category, regex: buildTermRegex(term) }))
);

/**
 * Inspect free-text user input (goal + optional constraints) for prohibited
 * content. Returns { allowed: false, ... } with a user-facing reason on a hit.
 */
export function moderateText(...parts: (string | undefined | null)[]): ModerationResult {
  const raw = parts.filter(Boolean).join(" ");
  if (!raw.trim()) return { allowed: true };

  const base = normalize(raw);
  // Test both the normalized text and a variant with spaced-out letters joined.
  const variants = [base, joinSpacedLetters(base)];

  for (const { category, regex } of COMPILED) {
    if (variants.some((v) => regex.test(v))) {
      return {
        allowed: false,
        category,
        reason: `This request was flagged because it appears to involve ${CATEGORY_LABEL[category]}. OTTO only helps with legitimate shopping — please revise your request.`,
      };
    }
  }

  return { allowed: true };
}
