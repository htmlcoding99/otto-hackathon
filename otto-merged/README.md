# OTTO — Autonomous AI Shopping Agent

OTTO is an AI agent that turns a plain-language shopping goal (e.g. *"I want an
iPhone 16 Pro Max"* or *"a matcha gift under $60, delivered before Friday"*) into
a ranked, reasoned purchase recommendation — backed by **live web search**, a
**multi-stage agent pipeline**, and a one-click **Stripe checkout**.

It runs as a single Next.js app: a static front-end at the site root and a set of
serverless API routes that drive the agent pipeline.

🔗 **Live demo:** https://otto-merged.vercel.app

---

## What it does

1. You describe what you want, set a budget, urgency, and priority sliders
   (value / speed / quality).
2. OTTO runs a 6-stage agent pipeline over **real products fetched live from the
   web**, building a preference profile ("Decision Twin") as it goes.
3. It returns a ranked shortlist, a clear winner with a natural-language
   rationale, a confidence score, a savings breakdown, and a radar chart
   comparing the top options.
4. You approve, and it hands off to Stripe checkout.

---

## The agent pipeline

The core is `runOttoPipeline()` in `agents/pipeline/index.ts` — six agents run
sequentially, each consuming the previous stages' output:

| # | Stage | File | Role |
|---|-------|------|------|
| 1 | **Planner** | `planner.agent.ts` | Decomposes the goal into a structured search query + sub-tasks |
| 2 | **Decision Twin** | `decision-twin.agent.ts` | Builds a preference profile from sliders, constraints, and past missions |
| 3 | **Research** | `research.agent.ts` | Live **Exa** web search → candidate products (via `CandidateService`) |
| 4 | **Constraint Analysis** | `constraint-analysis.agent.ts` | Filters candidates against budget / urgency / constraints |
| 5 | **Ranking** | `ranking.agent.ts` | Scores survivors across value, speed, quality, savings |
| 6 | **Savings Optimizer** | `savings-optimizer.agent.ts` | Picks the winner and writes the savings narrative |

Every stage emits a `ReasoningStep` (agent, action, confidence, provider, model,
duration), so the front-end can replay the agent's reasoning chain and the final
confidence is the mean of all step confidences.

Each agent extends `BaseAgent` (`agents/base.agent.ts`), which standardizes
timing, status, step recording, and guarantees no uncaught exceptions — a failed
stage returns a typed `PipelineError` rather than crashing the request.

---

## How "live" search works

`services/candidate.service.ts` turns raw web results into fully-typed,
scoreable candidates in two steps:

1. **`ExaService`** (`services/exa.service.ts`) runs a real [Exa](https://exa.ai)
   neural web search (with a strict query, then an expanded-query fallback).
2. An **LLM "budget" pass** estimates the commerce attributes Exa doesn't expose
   — price, rating, delivery days, review count, key features.

Results are **not hardcoded** — every run hits the live web, so the same query
can return different products over time.

---

## Multi-provider LLM with failover

`lib/llm.ts` provides `callWithFallback()` — one call that tries providers in
order and falls back automatically:

- **AWS Bedrock** (primary for this build — Claude Sonnet 4.6 via a cross-region
  inference profile)
- **Vercel AI Gateway** (OpenAI-compatible, multi-provider)
- **Groq**, **OpenAI**, **Anthropic Claude**

Provider order is driven by `LLM_PROVIDER`; per-role model overrides come from
`MODEL_PLANNER` / `MODEL_RESEARCH` / `MODEL_BUDGET` / `MODEL_DECISION`. Agents
also keep deterministic **rule-based fallbacks**, so the pipeline still produces
a result if every LLM provider is unavailable.

---

## Safety: content moderation

`lib/moderation.ts` blocks prohibited requests (illegal drugs, weapons /
explosives, explicit content, violence-for-hire) **before** they reach the live
search and pipeline. It's enforced server-side on `/api/pipeline/run` and
`/api/budget/estimate`, with a mirrored client-side check in `public/app.js` for
instant feedback.

It's **obfuscation-resistant** — it normalizes input to catch leetspeak
(`m3th`), in-word separators (`m.e.t.h`), spaced-out letters (`m e t h`), and
repeated characters (`methhh`), while word-boundary anchoring avoids false
positives so legitimate products (bath **bomb**, LG **C4** TV, **Assassin's**
Creed, surge **suppressor**, Black **Opium** perfume) are not blocked.

> Note: it's a fast deterministic keyword/normalization filter, not an AI intent
> classifier — it catches the obvious cases but not arbitrary novel slang.

---

## Other features

- **Decision Twin** — a persistent preference profile (budget sensitivity,
  delivery priority, quality focus, risk tolerance, value orientation) that
  updates each mission and personalizes future runs.
- **Mission memory** — past missions persist in **DynamoDB** (`lib/dynamo.ts`,
  `/api/memory`), replacing a local-file store that breaks on serverless hosts.
  Degrades gracefully when AWS creds are absent.
- **Stripe checkout** — `/api/payments/*` and `/api/stripe/*`, with a mock mode
  for local dev (`STRIPE_MOCK_MODE`).
- **Email notify** — `/api/notify` emails the chosen recommendation via Resend.
- **Dynamic re-ranking** — adjust the priority sliders after a result to
  recompute scores live, no new search needed.

---

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Zod** for request validation
- **AWS SDK v3** — Bedrock Runtime + DynamoDB
- **OpenAI / Anthropic / Groq** SDKs (+ Vercel AI Gateway)
- **Exa** for live web search
- **Stripe** for checkout, **Resend** for email
- Vanilla-JS front-end served statically from `public/`
- Deployed on **Vercel**

---

## Project structure

```
otto-merged/
├── app/
│   ├── api/                  # serverless route handlers
│   │   ├── pipeline/run/     # POST — run the full 6-stage pipeline
│   │   ├── budget/estimate/  # POST — live price range for a goal
│   │   ├── memory/           # GET/POST — mission history (DynamoDB)
│   │   ├── notify/           # POST — email a recommendation (Resend)
│   │   ├── payments/ stripe/ # Stripe checkout
│   │   ├── recommendation/ run-task/ agents/execute/
│   │   └── ...
│   ├── page.tsx layout.tsx success/ cancel/
├── agents/
│   ├── base.agent.ts         # abstract agent (timing, steps, error safety)
│   └── pipeline/             # the 6 pipeline agents + index.ts orchestrator
├── services/                 # Exa, candidate enrichment, scoring, Stripe, tasks
├── lib/                      # llm.ts, moderation.ts, dynamo.ts, stripe.ts,
│                             # api-response.ts, validate.ts, errors.ts, logger.ts
├── types/                    # shared TypeScript types
├── public/                   # static front-end (index.html, app.js, styles)
└── scripts/test-pipeline.ts  # pipeline smoke test
```

---

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/pipeline/run` | Run the full 6-stage pipeline (`maxDuration = 60`) |
| POST | `/api/budget/estimate` | Live min/max/avg price range for a goal |
| GET/POST | `/api/memory` | Read / append mission history (DynamoDB) |
| POST | `/api/notify` | Email the chosen recommendation (Resend) |
| POST | `/api/payments/*`, `/api/stripe/*` | Stripe checkout + webhook |

All responses use a consistent envelope (`lib/api-response.ts`): `{ success,
data | error, meta }`.

---

## Running locally

```bash
npm install
cp .env.local.example .env.local   # then fill in keys (see below)
npm run dev                         # http://localhost:3000
```

Useful scripts:

```bash
npm run build         # production build (what Vercel runs)
npm run type-check    # tsc --noEmit
npm run test:pipeline # pipeline smoke test
```

### Environment variables

Provide at least one LLM provider key plus an Exa key. Everything else is
optional and degrades gracefully.

```bash
# LLM provider (tried first; others are fallbacks)
LLM_PROVIDER=bedrock            # bedrock | gateway | groq | openai | claude

# AWS Bedrock + DynamoDB (standard AWS credential chain)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...           # if using temporary STS credentials
DYNAMODB_MISSIONS_TABLE=...

# Per-role model overrides (optional)
MODEL_PLANNER=... MODEL_RESEARCH=... MODEL_BUDGET=... MODEL_DECISION=...

# Other providers (any one is enough)
OPENAI_API_KEY=...  GROQ_API_KEY=...  AI_GATEWAY_API_KEY=...

# Live web search (required for real candidates)
EXA_API_KEY=...

# Stripe (mock mode works without real keys)
STRIPE_MOCK_MODE=true
STRIPE_SECRET_KEY=...  STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...

# Email (optional)
RESEND_API_KEY=...  RESEND_FROM=...
```

---

## Deployment

Deployed on Vercel from this directory:

```bash
vercel --prod
```

The pipeline makes several sequential LLM calls (~25–30s end to end), so
`/api/pipeline/run` sets `export const maxDuration = 60` to stay within the
serverless function limit.

---

## Credits

Built by **Sreetham & Ashwin**.
