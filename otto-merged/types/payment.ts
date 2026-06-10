// ─────────────────────────────────────────────────────────────────────────────
// types/payment.ts
// Stripe checkout & payment types
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";

export interface CheckoutLineItem {
  name: string;
  description?: string;
  unitAmount: number; // in cents
  quantity: number;
  imageUrl?: string;
}

export interface CreateCheckoutRequest {
  taskId: string;
  candidateId: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutResponse {
  sessionId: string;
  checkoutUrl: string;
  expiresAt: string;
}

export interface PaymentRecord {
  id: string;
  taskId: string;
  candidateId: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string;
  status: PaymentStatus;
  amountTotal: number; // in cents
  currency: string;
  customerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Stripe Webhook ────────────────────────────────────────────────────────────
export type StripeWebhookEvent =
  | "checkout.session.completed"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "charge.refunded";
