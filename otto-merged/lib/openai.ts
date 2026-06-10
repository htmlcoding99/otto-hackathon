// ─────────────────────────────────────────────────────────────────────────────
// lib/openai.ts
// Singleton OpenAI client — lazy-initialised, server-only
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(): { client: OpenAI | null; error: string | null } {
  if (_client) return { client: _client, error: null };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { client: null, error: "[OTTO] OPENAI_API_KEY is not set. Add it to .env.local." };
  }

  try {
    _client = new OpenAI({
      apiKey,
      organization: process.env.OPENAI_ORG_ID,
    });
    return { client: _client, error: null };
  } catch (e) {
    return { client: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Default model used across all agent completions */
export const DEFAULT_MODEL =
  (process.env.OPENAI_DEFAULT_MODEL as string | undefined) ?? "gpt-4o";

/** Lightweight helper to call chat completions with a system + user message */
export async function chatCompletion(
  system: string,
  user: string,
  model: string = DEFAULT_MODEL
): Promise<{ success: boolean; data: string | null; error: string | null }> {
  const { client, error } = getOpenAIClient();
  if (!client) {
    return { success: false, data: null, error };
  }

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content ?? "";
    return { success: true, data: content.trim(), error: null };
  } catch (e) {
    return { success: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
