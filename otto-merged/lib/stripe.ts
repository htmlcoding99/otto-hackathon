// ─────────────────────────────────────────────────────────────────────────────
// lib/stripe.ts
// Singleton Stripe client — server-only
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "[OTTO] STRIPE_SECRET_KEY is not set. Add it to .env.local."
    );
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: "2023-10-16" as any,
    typescript: true,
  });

  return _stripe;
}

/**
 * Verify a Stripe webhook signature and return the parsed event.
 * Throws if the signature is invalid.
 */
export async function constructStripeEvent(
  rawBody: string,
  signature: string
): Promise<Stripe.Event> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("[OTTO] STRIPE_WEBHOOK_SECRET is not set.");
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
