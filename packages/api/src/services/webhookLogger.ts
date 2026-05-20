import { randomBytes } from "node:crypto";

/**
 * Lightweight structured logger for the Flitt webhook handler.
 *
 * Each webhook invocation gets a unique `requestId`, which is included in
 * every log line so a single delivery's history can be traced through a log
 * aggregator (Datadog, Loki, etc.). Output is JSON-per-line (NDJSON) on
 * stdout — production-friendly without pulling in a logger dependency.
 *
 * Sensitive fields are stripped before serialization. The webhook handler
 * already verifies the SHA1 signature, so `signature` and Flitt's debug
 * echo `response_signature_string` have no business in logs — they're long,
 * noisy, and could enable a replay if logs leak.
 */

export interface WebhookLogger {
  requestId: string;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
}

const SENSITIVE_KEYS = new Set([
  "signature",
  "response_signature_string",
  "secret_key",
  "secretKey",
]);

/** Drop sensitive fields from context. Top-level only — webhook payloads are flat. */
export function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function emit(
  level: "info" | "warn" | "error",
  requestId: string,
  msg: string,
  context: Record<string, unknown> | undefined,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    component: "flitt-webhook",
    requestId,
    msg,
    ...sanitizeContext(context),
  };
  // stdout for info, stderr for warn/error — keeps `kubectl logs --tail` clean
  // and lets log aggregators separate severity by stream.
  const serialized = JSON.stringify(line);
  if (level === "info") {
    console.log(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.error(serialized);
  }
}

export function createWebhookLogger(): WebhookLogger {
  const requestId = randomBytes(6).toString("hex");
  return {
    requestId,
    info(msg, context) {
      emit("info", requestId, msg, context);
    },
    warn(msg, context) {
      emit("warn", requestId, msg, context);
    },
    error(msg, context) {
      emit("error", requestId, msg, context);
    },
  };
}
