/**
 * Lightweight in-memory metrics collector for the Flitt + license flows.
 *
 * Goals:
 *   - Zero dependencies (no prom-client). Keeps the production bundle thin
 *     and avoids a transitive library that historically has had its own
 *     CVEs.
 *   - Output strictly in Prometheus text exposition format so any scraper
 *     (Datadog, Grafana Agent, vanilla Prometheus) consumes it natively.
 *   - Reset is process-local — counters reset on container restart, which
 *     Prometheus understands via its `rate()` "counter reset" detection.
 *
 * What we measure (the 80/20 of "is payment infra healthy?"):
 *   - flitt_webhook_total{order_status, result}           (counter)
 *   - flitt_signature_failures_total                       (counter)
 *   - flitt_checkout_creations_total{result}               (counter)
 *   - email_send_total{template, result}                   (counter)
 *
 * Labels stay tiny (≤2 dimensions × ~5 values) so cardinality is bounded
 * and the scrape stays under 1 KB.
 */

interface Counter {
  /** Maps a serialized label string ("a=1,b=2") → numeric value. */
  values: Map<string, number>;
  /** Human-readable HELP line for Prometheus. */
  help: string;
}

const counters = new Map<string, Counter>();

function serializeLabels(labels?: Record<string, string>): string {
  if (!labels) return "";
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(",");
}

/**
 * Per the Prometheus text exposition format spec, label values need three
 * escapes: `\` → `\\`, newline → `\n`, `"` → `\"`. Order matters — backslash
 * MUST run first so the escape sequences we add aren't re-escaped on the
 * subsequent passes.
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function ensureCounter(name: string, help: string): Counter {
  let c = counters.get(name);
  if (!c) {
    c = { values: new Map(), help };
    counters.set(name, c);
  }
  return c;
}

/** Increment a counter (by `delta`, default 1). Labels are optional. */
export function incrementCounter(
  name: string,
  help: string,
  labels?: Record<string, string>,
  delta = 1,
): void {
  const counter = ensureCounter(name, help);
  const key = serializeLabels(labels);
  counter.values.set(key, (counter.values.get(key) ?? 0) + delta);
}

/** Render every registered counter in Prometheus text format. */
export function renderMetrics(): string {
  const out: string[] = [];
  for (const [name, counter] of counters) {
    out.push(`# HELP ${name} ${counter.help}`);
    out.push(`# TYPE ${name} counter`);
    if (counter.values.size === 0) {
      out.push(`${name} 0`);
      continue;
    }
    for (const [key, value] of counter.values) {
      out.push(key ? `${name}{${key}} ${value}` : `${name} ${value}`);
    }
  }
  return out.join("\n") + "\n";
}

/** Convenience wrappers — strongly typed call sites > stringly typed sprinkled metrics calls. */
export const metrics = {
  webhook(orderStatus: string, result: "processed" | "deduped"): void {
    incrementCounter(
      "flitt_webhook_total",
      "Flitt webhook deliveries received and dispatched.",
      { order_status: orderStatus, result },
    );
  },
  signatureFailure(): void {
    incrementCounter(
      "flitt_signature_failures_total",
      "Webhook deliveries rejected because signature verification failed.",
    );
  },
  checkoutCreate(result: "success" | "fail"): void {
    incrementCounter(
      "flitt_checkout_creations_total",
      "POST /api/checkout/create outcomes.",
      { result },
    );
  },
  email(template: string, result: "ok" | "fail"): void {
    incrementCounter(
      "email_send_total",
      "Resend email send outcomes by template.",
      { template, result },
    );
  },
};

/** Test hook — clears all counters between test runs. */
export function __resetMetricsForTests(): void {
  counters.clear();
}
