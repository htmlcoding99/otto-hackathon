// ─────────────────────────────────────────────────────────────────────────────
// lib/llm.ts
// Multi-LLM provider client with automatic failover for OTTO 2.0
// Supports: OpenAI · Anthropic Claude · Groq
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export type ProviderName = 'openai' | 'claude' | 'groq' | 'bedrock' | 'gateway';

export interface LLMResult {
  text: string;
  provider: ProviderName;
  model: string;
  durationMs: number;
}

// ── Lazy-initialised clients ──────────────────────────────────────────────────
let _openai: OpenAI | null = null;
let _claude: Anthropic | null = null;
let _groq: Groq | null = null;
let _bedrock: BedrockRuntimeClient | null = null;
let _gateway: OpenAI | null = null;

// Vercel AI Gateway: one OpenAI-compatible endpoint that fans out to many model
// providers with unified billing + observability. We reuse the OpenAI SDK and
// just point baseURL at the gateway. Model ids use "creator/model" slugs.
function getGateway(): { client: OpenAI | null; error: string | null } {
  if (!process.env.AI_GATEWAY_API_KEY) return { client: null, error: 'AI_GATEWAY_API_KEY not set' };
  try {
    _gateway ??= new OpenAI({
      apiKey: process.env.AI_GATEWAY_API_KEY,
      baseURL: process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
    });
    return { client: _gateway, error: null };
  } catch (e) {
    return { client: null, error: String(e) };
  }
}

// Amazon Bedrock uses the standard AWS credential chain (AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN) — there is no single API key.
function getBedrock(): { client: BedrockRuntimeClient | null; error: string | null } {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { client: null, error: 'AWS credentials not set (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)' };
  }
  try {
    _bedrock ??= new BedrockRuntimeClient({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2',
    });
    return { client: _bedrock, error: null };
  } catch (e) {
    return { client: null, error: String(e) };
  }
}

function getOpenAI(): { client: OpenAI | null; error: string | null } {
  if (!process.env.OPENAI_API_KEY) return { client: null, error: 'OPENAI_API_KEY not set' };
  try {
    _openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, organization: process.env.OPENAI_ORG_ID });
    return { client: _openai, error: null };
  } catch (e) {
    return { client: null, error: String(e) };
  }
}

function getClaude(): { client: Anthropic | null; error: string | null } {
  if (!process.env.ANTHROPIC_API_KEY) return { client: null, error: 'ANTHROPIC_API_KEY not set' };
  try {
    _claude ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return { client: _claude, error: null };
  } catch (e) {
    return { client: null, error: String(e) };
  }
}

function getGroq(): { client: Groq | null; error: string | null } {
  if (!process.env.GROQ_API_KEY) return { client: null, error: 'GROQ_API_KEY not set' };
  try {
    _groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
    return { client: _groq, error: null };
  } catch (e) {
    return { client: null, error: String(e) };
  }
}

// ── Provider order ────────────────────────────────────────────────────────────
// Primary comes from LLM_PROVIDER env; others are fallbacks.
export function getProviderOrder(): ProviderName[] {
  const primary = (process.env.LLM_PROVIDER || 'groq').toLowerCase() as ProviderName;
  const all: ProviderName[] = ['bedrock', 'gateway', 'groq', 'openai', 'claude'];
  return [primary, ...all.filter(p => p !== primary)];
}

// ── Model name lookup ─────────────────────────────────────────────────────────
// Bedrock model ids are cross-region inference profiles ("us." prefix). For this
// AWS event only claude-sonnet-4-6 is enabled, so every role maps to it; override
// per role with MODEL_<ROLE> env vars if more models get unlocked.
const DEFAULT_MODELS: Record<ProviderName, Record<string, string>> = {
  openai:  { planner: 'gpt-4o-mini', research: 'gpt-4o-mini', budget: 'gpt-4o-mini', decision: 'gpt-4o' },
  claude:  { planner: 'claude-3-haiku-20240307', research: 'claude-3-haiku-20240307', budget: 'claude-3-haiku-20240307', decision: 'claude-3-5-sonnet-20241022' },
  groq:    { planner: 'llama-3.1-8b-instant',    research: 'llama-3.1-8b-instant',    budget: 'llama-3.1-8b-instant',    decision: 'llama-3.3-70b-versatile' },
  bedrock: { planner: 'us.anthropic.claude-sonnet-4-6', research: 'us.anthropic.claude-sonnet-4-6', budget: 'us.anthropic.claude-sonnet-4-6', decision: 'us.anthropic.claude-sonnet-4-6' },
  // AI Gateway model slugs are "creator/model". Override per role via MODEL_<ROLE>.
  gateway: { planner: 'openai/gpt-4o-mini', research: 'openai/gpt-4o-mini', budget: 'openai/gpt-4o-mini', decision: 'anthropic/claude-sonnet-4.5' },
};

export function resolveModel(agentRole: string, provider: ProviderName): string {
  const envKey = `MODEL_${agentRole.toUpperCase()}`;
  return process.env[envKey] || DEFAULT_MODELS[provider]?.[agentRole] || 'gpt-4o-mini';
}

// ── Core call — one provider ──────────────────────────────────────────────────
async function callProvider(provider: ProviderName, model: string, systemPrompt: string, userPrompt: string): Promise<{ success: boolean; data: LLMResult | null; error: string | null }> {
  const t0 = Date.now();

  try {
    if (provider === 'openai') {
      const { client, error } = getOpenAI();
      if (!client) return { success: false, data: null, error };
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.3,
        max_tokens: 1024,
      });
      return { success: true, data: { text: res.choices[0].message.content?.trim() || '', provider, model, durationMs: Date.now() - t0 }, error: null };
    }

    if (provider === 'claude') {
      const { client, error } = getClaude();
      if (!client) return { success: false, data: null, error };
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const content = res.content[0];
      return { success: true, data: { 
        text: content.type === 'text' ? content.text.trim() : '', 
        provider, 
        model, 
        durationMs: Date.now() - t0 
      }, error: null };
    }

    if (provider === 'groq') {
      const { client, error } = getGroq();
      if (!client) return { success: false, data: null, error };
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.3,
        max_tokens: 1024,
      });
      return { success: true, data: { text: res.choices[0].message.content?.trim() || '', provider, model, durationMs: Date.now() - t0 }, error: null };
    }

    if (provider === 'gateway') {
      const { client, error } = getGateway();
      if (!client) return { success: false, data: null, error };
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.3,
        max_tokens: 1024,
      });
      return { success: true, data: { text: res.choices[0].message.content?.trim() || '', provider, model, durationMs: Date.now() - t0 }, error: null };
    }

    if (provider === 'bedrock') {
      const { client, error } = getBedrock();
      if (!client) return { success: false, data: null, error };
      const res = await client.send(new ConverseCommand({
        modelId: model,
        system: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: [{ text: userPrompt }] }],
        inferenceConfig: { maxTokens: 1024, temperature: 0.3 },
      }));
      const text = res.output?.message?.content?.[0]?.text?.trim() || '';
      return { success: true, data: { text, provider, model, durationMs: Date.now() - t0 }, error: null };
    }

    return { success: false, data: null, error: `Unknown provider: ${provider}` };
  } catch (e) {
    return { success: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Public API: callWithFallback ──────────────────────────────────────────────
export async function callWithFallback(agentRole: string, systemPrompt: string, userPrompt: string): Promise<{ success: boolean; data: LLMResult | null; error: string | null }> {
  const providers = getProviderOrder();
  const errors: string[] = [];

  for (const provider of providers) {
    const keyMap = { openai: 'OPENAI_API_KEY', claude: 'ANTHROPIC_API_KEY', groq: 'GROQ_API_KEY', bedrock: 'AWS_ACCESS_KEY_ID', gateway: 'AI_GATEWAY_API_KEY' };
    if (!process.env[keyMap[provider]]) {
      errors.push(`${provider}: no API key`);
      continue;
    }

    const model = resolveModel(agentRole, provider);
    console.log(`[LLM] ${agentRole} → ${provider}/${model}`);
    const res = await callProvider(provider, model, systemPrompt, userPrompt);
    
    if (res.success && res.data) {
      return res;
    } else {
      const msg = `${provider}: ${res.error}`;
      console.warn(`[LLM] Failover — ${msg}`);
      errors.push(msg);
    }
  }

  const finalError = `All LLM providers failed: ${errors.join(' | ')}`;
  console.warn('[LLM]', finalError);
  return { success: false, data: null, error: finalError };
}
