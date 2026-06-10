// ─────────────────────────────────────────────────────────────────────────────
// lib/api-response.ts
// Factory helpers for consistent JSON API responses
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { ApiResponse, ApiError, HttpStatus } from "@/types/api";

interface BuildOptions {
  status?: HttpStatus;
  durationMs?: number;
}

/**
 * Wrap a successful payload in the standard API envelope.
 */
export function ok<T>(
  data: T,
  opts: BuildOptions = {}
): NextResponse<ApiResponse<T>> {
  const { status = 200, durationMs = 0 } = opts;
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        requestId: uuidv4(),
        durationMs,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

/**
 * Wrap an error in the standard API envelope.
 */
export function err(
  error: ApiError,
  opts: BuildOptions = {}
): NextResponse<ApiResponse<never>> {
  const { status = 500, durationMs = 0 } = opts;
  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        requestId: uuidv4(),
        durationMs,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

/**
 * Convert any caught error into a standard API error shape.
 */
export function toApiError(e: unknown, fallbackCode = "INTERNAL_ERROR"): ApiError {
  if (e instanceof Error) {
    return { code: fallbackCode, message: e.message };
  }
  return { code: fallbackCode, message: "An unexpected error occurred." };
}
