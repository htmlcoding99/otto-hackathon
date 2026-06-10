// ─────────────────────────────────────────────────────────────────────────────
// types/api.ts
// Shared API envelope & error types
// ─────────────────────────────────────────────────────────────────────────────

/** Standard JSON API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ResponseMeta {
  requestId: string;
  durationMs: number;
  timestamp: string;
}

/** HTTP error codes used across route handlers */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
