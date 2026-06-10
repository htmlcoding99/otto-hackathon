// ─────────────────────────────────────────────────────────────────────────────
// app/api/payments/create-checkout-session/route.ts
// Initiates a Stripe Checkout flow
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { StripeService } from "@/services/stripe.service";
import { logger } from "@/lib/logger";
import { z } from "zod";

const checkoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().min(0.5), // Minimum 50 cents
  description: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const product = checkoutSchema.parse(body);

    // Ensure we have a domain to redirect back to
    const origin = req.headers.get("origin") || "http://localhost:3000";

    const { url, sessionId } = await StripeService.createCheckoutSession(
      product,
      `${origin}/success`, // Ensure these pages exist on your frontend later
      `${origin}/cancel`
    );

    logger.info("Checkout API", "Successfully created session", { sessionId });

    return NextResponse.json({ url, sessionId });
  } catch (error) {
    logger.error("Checkout API", "Failed to create checkout session", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid product payload", details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
