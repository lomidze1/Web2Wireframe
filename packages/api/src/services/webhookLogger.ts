import { randomBytes } from "node:crypto";

/**
 * Lightweight structured request logger.
 *
 * Each request invocation gets a unique `requestId`, which is included in
 * every log line so a single request's history can be traced through a log
 * aggregator (Datadog, Loki, etc.). Output is JSON-per-line (NDJSON) on
 * stdout — production-friendly without pulling in a logger dependency.
 *
 * Sensitive fields are stripped before serialization. SHA1 signatures and
 * any obvious secret-like keys are dropped, so `signature` and Flitt's debug
 * echo `response_signature_string` never reach the log stream — they're
 * long, noisy, and could enable a replay if logs leak.
 *
 * Component names:
 *   - "flitt-webhook"          — webhook handler
 *   - "checkout-create"        — POST /api/checkout/create
 *   - "license"                — /api/license/* routes
 */

export interface RequestLogger {
  requestId: string;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
}

/** Back-compat alias — the webhook handler still calls createWebhookLogger. */
export type WebhookLogger = RequestLogger;

const SENSITIVE_KEYS = new Set([
  // Signature material — already verified, no business in logs.
  "signature",
  "response_signature_string",
  "secret_key",
  "secretKey",
  // PII surfaces. `figmaUserId` is intentionally NOT in this set — it's
  // the join key with MongoDB License + WebhookEvent rows, and is already
  // persisted there, so logging it doesn't expand the regulated-data
  // surface. Email + Flitt's payment_id ARE PII / quasi-PII; they belong
  // in MongoDB (where retention + erasure is auditable), not in NDJSON
  // streams that downstream aggregators (Loki, Datadog) cache freely.
  "email",
  "sender_email",
  "payment_id",
  // rectoken would be PCI-scope if Flitt ever returned it; we don't
  // request it today, but pre-scrub in case the field is ever added.
  "rectoken",
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
  component: string,
  level: "info" | "warn" | "error",
  requestId: string,
  msg: string,
  context: Record<string, unknown> | undefined,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    component,
    requestId,
    msg,
    ...sanitizeContext(context),
  };
  // stdout for info, stderr for warn/error — keeps `kubectl logs --tail` clean
  // and lets log aggregators separate severity by stream.
  const serialized = JSON.stringify(line);
  if (level === "info") {
    // Structured info-level webhook log — stdout is the intended stream.
    // eslint-disable-next-line no-console
    console.log(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.error(serialized);
  }
}

/** Build a logger bound to the given component name. */
export function createLogger(component: string): RequestLogger {
  const requestId = randomBytes(6).toString("hex");
  return {
    requestId,
    info(msg, context) {
      emit(component, "info", requestId, msg, context);
    },
    warn(msg, context) {
      emit(component, "warn", requestId, msg, context);
    },
    error(msg, context) {
      emit(component, "error", requestId, msg, context);
    },
  };
}

/** Back-compat — equivalent to `createLogger("flitt-webhook")`. */
export function createWebhookLogger(): RequestLogger {
  return createLogger("flitt-webhook");
}
