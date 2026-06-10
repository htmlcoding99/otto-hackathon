// ─────────────────────────────────────────────────────────────────────────────
// lib/errors.ts
// Custom application error classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base OTTO application error.
 * Carries an HTTP status code and a machine-readable error code.
 */
export class OttoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "OttoError";
  }
}

export class ValidationError extends OttoError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends OttoError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found.`, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends OttoError {
  constructor(message = "Unauthorized.") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class AgentError extends OttoError {
  constructor(message: string, details?: unknown) {
    super("AGENT_ERROR", message, 500, details);
    this.name = "AgentError";
  }
}

export class PaymentError extends OttoError {
  constructor(message: string, details?: unknown) {
    super("PAYMENT_ERROR", message, 400, details);
    this.name = "PaymentError";
  }
}
