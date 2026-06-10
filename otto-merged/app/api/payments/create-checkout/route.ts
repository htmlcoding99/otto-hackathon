// ─────────────────────────────────────────────────────────────────────────────
// app/api/payments/create-checkout/route.ts
// POST /api/payments/create-checkout — create a Stripe checkout session
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, toApiError } from "@/lib/api-response";
import { validateBody } from "@/lib/validate";
import { OttoError } from "@/lib/errors";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";
import { HTTP_STATUS } from "@/types/api";

const lineItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unitAmount: z.number().int().positive("unitAmount must be a positive integer (cents)."),
  quantity: z.number().int().min(1).default(1),
  imageUrl: z.string().url().optional(),
});

const createCheckoutSchema = z.object({
  taskId: z.string().uuid("taskId must be a valid UUID."),
  candidateId: z.string().min(1, "candidateId is required."),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required."),
  successUrl: z.string().url("successUrl must be a valid URL."),
  cancelUrl: z.string().url("cancelUrl must be a valid URL."),
  customerEmail: z.string().email().optional(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const start = Date.now();

  const validation = await validateBody(request, createCheckoutSchema);
  if (!validation.success) {
    return err(validation.error, { status: HTTP_STATUS.UNPROCESSABLE });
  }

  try {
    const session = await PaymentService.createCheckout(validation.data as any);
    logger.info("POST /api/payments/create-checkout", "Checkout session created", {
      sessionId: session.sessionId,
      taskId: validation.data.taskId,
    });

    return ok(session, { status: HTTP_STATUS.CREATED, durationMs: Date.now() - start });
  } catch (e) {
    logger.error("POST /api/payments/create-checkout", "Checkout failed", e);
    if (e instanceof OttoError) {
      return err({ code: e.code, message: e.message }, { status: e.statusCode as typeof HTTP_STATUS[keyof typeof HTTP_STATUS] });
    }
    return err(toApiError(e), { status: HTTP_STATUS.SERVER_ERROR, durationMs: Date.now() - start });
  }
}
