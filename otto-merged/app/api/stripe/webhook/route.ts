// ─────────────────────────────────────────────────────────────────────────────
// app/api/stripe/webhook/route.ts
// Handles incoming Stripe webhooks safely with idempotency logging
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { StripeService } from "@/services/stripe.service";
import { PaymentService } from "@/services/payment.service";
import { TaskService } from "@/services/task.service";
import { logger } from "@/lib/logger";

// A simple in-memory cache to handle idempotency (deduplication of webhook events)
// In a real database, this would be a table of processed event IDs
const processedEvents = new Set<string>();

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  let event;

  try {
    event = StripeService.constructWebhookEvent(payload, signature, webhookSecret);
  } catch (err) {
    logger.error("Stripe Webhook", `Webhook signature verification failed:`, err);
    return NextResponse.json({ error: "Webhook Error: Invalid Signature" }, { status: 400 });
  }

  // Handle Idempotency: Ignore events we've already processed
  if (processedEvents.has(event.id)) {
    logger.warn("Stripe Webhook", `Event ${event.id} already processed. Skipping.`);
    return NextResponse.json({ received: true });
  }

  try {
    // Process the event based on type
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const { candidateId, taskId } = session.metadata ?? {};

        // Log the successful purchase securely
        logger.info("Stripe Webhook", "Payment successful!", {
          eventId: event.id,
          sessionId: session.id,
          amountTotal: session.amount_total,
          candidateId,
          taskId,
        });

        // 1. Mark the payment record as paid (idempotent — no-op if untracked).
        await PaymentService.updateStatus(
          session.id,
          "succeeded",
          session.payment_intent ?? undefined
        );

        // 2. Advance the originating task to "completed" so the UI can reflect
        //    that OTTO finished the purchase on the user's behalf.
        if (taskId) {
          try {
            await TaskService.updateStatus(taskId, "completed");
          } catch (e) {
            logger.warn("Stripe Webhook", "Could not update task after payment", {
              taskId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as any;
        logger.warn("Stripe Webhook", "Checkout session expired.", { eventId: event.id });
        await PaymentService.updateStatus(session.id, "failed");
        break;
      }

      default:
        logger.debug("Stripe Webhook", `Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    processedEvents.add(event.id);
    
    // Cleanup old events to prevent memory leaks in this MVP setup
    if (processedEvents.size > 1000) {
      const iterator = processedEvents.values();
      processedEvents.delete(iterator.next().value as string);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Stripe Webhook", "Error processing webhook event", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
