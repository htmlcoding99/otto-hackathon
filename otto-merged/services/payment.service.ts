// ─────────────────────────────────────────────────────────────────────────────
// services/payment.service.ts
// Stripe checkout session creation & payment record management
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { getStripeClient } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { PaymentError } from "@/lib/errors";
import type {
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  PaymentRecord,
  PaymentStatus,
} from "@/types/payment";

// ── In-process store (swap for DB in production) ──────────────────────────────
const paymentStore = new Map<string, PaymentRecord>();

// ─────────────────────────────────────────────────────────────────────────────

export const PaymentService = {
  /**
   * Create a Stripe checkout session and persist a payment record.
   */
  async createCheckout(req: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    const stripe = getStripeClient();

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: req.lineItems.map((item) => ({
          price_data: {
            currency: "usd",
            unit_amount: item.unitAmount,
            product_data: {
              name: item.name,
              description: item.description,
              ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
            },
          },
          quantity: item.quantity,
        })),
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        customer_email: req.customerEmail,
        metadata: {
          taskId: req.taskId,
          candidateId: req.candidateId,
          ...req.metadata,
        },
      });

      // Persist payment record
      const record: PaymentRecord = {
        id: uuidv4(),
        taskId: req.taskId,
        candidateId: req.candidateId,
        stripeSessionId: session.id,
        status: "pending",
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        customerEmail: req.customerEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      paymentStore.set(session.id, record);

      logger.info("PaymentService", "Checkout session created", {
        sessionId: session.id,
        taskId: req.taskId,
      });

      return {
        sessionId: session.id,
        checkoutUrl: session.url ?? "",
        expiresAt: new Date(session.expires_at * 1000).toISOString(),
      };
    } catch (err) {
      logger.error("PaymentService", "Failed to create checkout session", err);
      throw new PaymentError(
        err instanceof Error ? err.message : "Stripe checkout creation failed."
      );
    }
  },

  /**
   * Update payment status when a webhook fires.
   */
  async updateStatus(
    stripeSessionId: string,
    status: PaymentStatus,
    paymentIntentId?: string
  ): Promise<void> {
    const record = paymentStore.get(stripeSessionId);
    if (!record) {
      logger.warn("PaymentService", "Payment record not found for session", { stripeSessionId });
      return;
    }

    record.status = status;
    record.updatedAt = new Date().toISOString();
    if (paymentIntentId) record.stripePaymentIntentId = paymentIntentId;
    paymentStore.set(stripeSessionId, record);

    logger.info("PaymentService", "Payment status updated", { stripeSessionId, status });
  },

  /**
   * Get payment record by Stripe session ID.
   */
  async findBySession(stripeSessionId: string): Promise<PaymentRecord | null> {
    return paymentStore.get(stripeSessionId) ?? null;
  },
};
