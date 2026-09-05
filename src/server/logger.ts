import "server-only";

import { env } from "@/server/env";

/**
 * Minimal structured logger.
 *
 * - One JSON line per event in production; a readable line in development.
 * - Level gated by `LOG_LEVEL`.
 * - Sensitive keys are redacted recursively before anything is written.
 *
 * This is a foundation, not an observability platform. A real transport
 * (OpenTelemetry, a log shipper) can be added behind this same interface later.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Substrings (case-insensitive) that mark a key as sensitive. */
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "credential",
  "privatekey",
  "private_key",
  "signature",
  "otp",
];

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value === null || typeof value !== "object") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: env.NODE_ENV === "production" ? undefined : value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

/** Resolve the active threshold, tolerating a missing/invalid LOG_LEVEL. */
function activeThreshold(): number {
  const configured = env.LOG_LEVEL as LogLevel | "silent" | undefined;
  return configured && configured in LEVEL_RANK
    ? LEVEL_RANK[configured]
    : LEVEL_RANK.info;
}

function write(level: LogLevel, message: string, context?: LogContext) {
  if (LEVEL_RANK[level] < activeThreshold()) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as LogContext) : {}),
  };

  const line =
    env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : `${entry.time} ${level.toUpperCase().padEnd(5)} ${message}` +
        (context ? ` ${JSON.stringify(redact(context))}` : "");

  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  sink(line);
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Return a logger that merges `bindings` into every entry (e.g. requestId). */
  child(bindings: LogContext): Logger;
}

function createLogger(base: LogContext = {}): Logger {
  const merge = (context?: LogContext) =>
    Object.keys(base).length || context ? { ...base, ...context } : undefined;
  return {
    debug: (m, c) => write("debug", m, merge(c)),
    info: (m, c) => write("info", m, merge(c)),
    warn: (m, c) => write("warn", m, merge(c)),
    error: (m, c) => write("error", m, merge(c)),
    child: (bindings) => createLogger({ ...base, ...bindings }),
  };
}

export const logger = createLogger();
