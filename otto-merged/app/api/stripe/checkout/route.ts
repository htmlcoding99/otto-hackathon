// ─────────────────────────────────────────────────────────────────────────────
// app/api/stripe/checkout/route.ts
// POST /api/stripe/checkout — create a real Stripe Checkout Session.
//
// Flow:
//   1. Frontend POSTs { productName, price } (the approved OTTO pick).
//   2. We build a Stripe Checkout Session via StripeService (mock-aware).
//   3. We return { url } and the browser redirects to Stripe-hosted checkout.
//   4. Stripe redirects back to /success (paid) or /cancel.
//   5. Stripe fires the checkout.session.completed webhook → /api/stripe/webhook.
//
// The secret key never leaves the server. Card details are entered on Stripe's
// hosted page, never in our app.
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";
import { StripeService } from "@/services/stripe.service";
import { logger } from "@/lib/logger";

interface CheckoutBody {
  productName?: string;
  price?: number;
  candidateId?: string;
  goal?: string;
}

export async function POST(req: NextRequest) {
  let body: CheckoutBody;
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

  // Absolute base URL for Stripe's redirect targets. Prefer the configured
  // app URL, else derive it from the incoming request (works on localhost).
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  try {
    const { url, sessionId } = await StripeService.createCheckoutSession(
      {
        name: productName,
        price: amount,
        description: goal ? `OTTO pick for: ${goal}` : "OTTO Recommended Purchase",
        id: candidateId || `otto_${Date.now()}`,
      },
      `${base}/success`,
      `${base}/cancel`
    );

    logger.info("POST /api/stripe/checkout", "Checkout session created", { sessionId, amount });
    return NextResponse.json({ url, sessionId });
  } catch (e) {
    logger.error("POST /api/stripe/checkout", "Checkout creation failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe checkout failed." },
      { status: 500 }
    );
  }
}
