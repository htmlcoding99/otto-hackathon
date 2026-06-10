// ─────────────────────────────────────────────────────────────────────────────
// lib/moderation.ts
// Lightweight content moderation for user-supplied goals / constraints.
//
// OTTO is a legitimate shopping assistant. This blocks requests that clearly
// involve illegal or prohibited items (drugs, weapons/explosives, explicit
// content, violence-for-hire) before they ever reach the live search + LLM
// pipeline.
//
// Design notes:
//  - Deterministic word-boundary matching — fast, no extra API call/latency.
//  - \b boundaries avoid the "Scunthorpe problem": "meth" does NOT match
//    "method"/"methodology", "ass" does NOT match "class", etc.
//  - We deliberately skip ambiguous words ("gun" → nerf/glue/heat gun,
//    "coke" → Coca-Cola) to avoid false positives on legitimate gifts.
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

// Each entry is a list of terms/phrases. Single words are matched with word
// boundaries; multi-word phrases are matched as-is (also boundary-wrapped).
const BLOCKLIST: Record<ModerationCategory, string[]> = {
  "illegal-drugs": [
    "meth",
    "methamphetamine",
    "crystal meth",
    "cocaine",
    "crack cocaine",
    "heroin",
    "fentanyl",
    "mdma",
    "ecstasy",
    "lsd",
    "pcp",
    "opium",
    "magic mushrooms",
    "illegal drugs",
  ],
  "weapons-explosives": [
    "firearm",
    "firearms",
    "handgun",
    "handguns",
    "pistol",
    "rifle",
    "shotgun",
    "ammunition",
    "ammo",
    "assault rifle",
    "machine gun",
    "ghost gun",
    "ar-15",
    "ak-47",
    "silencer",
    "suppressor",
    "grenade",
    "explosive",
    "explosives",
    "dynamite",
    "tnt",
    "c4",
    "pipe bomb",
    "bomb",
    "anthrax",
    "sarin",
    "ricin",
  ],
  "explicit-content": [
    "porn",
    "pornography",
    "child porn",
    "csam",
    "escort service",
    "prostitute",
    "prostitution",
  ],
  violence: [
    "hitman",
    "hit man",
    "assassin",
    "assassinate",
    "kill someone",
    "human trafficking",
  ],
};

const CATEGORY_LABEL: Record<ModerationCategory, string> = {
  "illegal-drugs": "illegal drugs",
  "weapons-explosives": "weapons or explosives",
  "explicit-content": "explicit content",
  violence: "violence or other illegal activity",
};

// Pre-compile one case-insensitive regex per category. Each term is escaped and
// wrapped in word boundaries so we match whole words/phrases only.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPILED: { category: ModerationCategory; regex: RegExp }[] = (
  Object.entries(BLOCKLIST) as [ModerationCategory, string[]][]
).map(([category, terms]) => ({
  category,
  regex: new RegExp(`\\b(?:${terms.map(escapeRegExp).join("|")})\\b`, "i"),
}));

/**
 * Inspect free-text user input (goal + optional constraints) for prohibited
 * content. Returns { allowed: false, ... } with a user-facing reason on a hit.
 */
export function moderateText(...parts: (string | undefined | null)[]): ModerationResult {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return { allowed: true };

  for (const { category, regex } of COMPILED) {
    if (regex.test(text)) {
      return {
        allowed: false,
        category,
        reason: `This request was flagged because it appears to involve ${CATEGORY_LABEL[category]}. OTTO only helps with legitimate shopping — please revise your request.`,
      };
    }
  }

  return { allowed: true };
}
