// ─────────────────────────────────────────────────────────────────────────────
// lib/logger.ts
// Structured, levelled logger — wraps console in production-friendly format
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  service: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

function log(level: LogLevel, service: string, message: string, data?: unknown) {
  const payload: LogPayload = {
    level,
    service,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(payload);

  switch (level) {
    case "debug":
      if (process.env.NODE_ENV !== "production") console.debug(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  debug: (service: string, message: string, data?: unknown) =>
    log("debug", service, message, data),
  info: (service: string, message: string, data?: unknown) =>
    log("info", service, message, data),
  warn: (service: string, message: string, data?: unknown) =>
    log("warn", service, message, data),
  error: (service: string, message: string, data?: unknown) =>
    log("error", service, message, data),
};
