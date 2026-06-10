// ─────────────────────────────────────────────────────────────────────────────
// app/api/stripe/embedded/route.ts
// POST /api/stripe/embedded — create an EMBEDDED Stripe Checkout Session.
//
// Unlike /checkout (which returns a hosted URL to redirect to), this returns a
// client_secret the frontend mounts in-app via Stripe.js — the user never
// leaves OTTO. The publishable key is safe to expose, so we return it too
// (the static frontend isn't built by Next, so it can't read NEXT_PUBLIC_* env).
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";
import { StripeService } from "@/services/stripe.service";
import { logger } from "@/lib/logger";

interface EmbeddedBody {
  productName?: string;
  price?: number;
  candidateId?: string;
  goal?: string;
}

export async function POST(req: NextRequest) {
  let body: EmbeddedBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { productName, price, candidateId, goal } = body;

  if (!productName || typeof productName !== "string") {
    return NextResponse.json({ error: "productName is required." }, { status: 400 });
  }
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount < 0.5) {
    return NextResponse.json({ error: "price must be a number ≥ 0.50 (USD)." }, { status: 400 });
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  if (!publishableKey) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.local." },
      { status: 500 }
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  try {
    const { clientSecret, sessionId } = await StripeService.createEmbeddedSession(
      {
        name: productName,
        price: amount,
        description: goal ? `OTTO pick for: ${goal}` : "OTTO Recommended Purchase",
        id: candidateId || `otto_${Date.now()}`,
      },
      `${base}/success?session_id={CHECKOUT_SESSION_ID}`
    );

    logger.info("POST /api/stripe/embedded", "Embedded session created", { sessionId, amount });
    return NextResponse.json({ clientSecret, sessionId, publishableKey });
  } catch (e) {
    logger.error("POST /api/stripe/embedded", "Embedded session creation failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe embedded checkout failed." },
      { status: 500 }
    );
  }
}
