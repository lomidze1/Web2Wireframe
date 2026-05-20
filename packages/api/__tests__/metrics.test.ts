import { describe, it, expect, beforeEach } from "vitest";
import {
  metrics,
  renderMetrics,
  incrementCounter,
  __resetMetricsForTests,
} from "../src/services/metrics.js";

beforeEach(() => {
  __resetMetricsForTests();
});

describe("metrics — Prometheus text format", () => {
  it("emits HELP and TYPE lines for every registered counter", () => {
    metrics.webhook("approved", "processed");
    const out = renderMetrics();
    expect(out).toContain("# HELP flitt_webhook_total");
    expect(out).toContain("# TYPE flitt_webhook_total counter");
  });

  it("renders a counter with labels in `name{a=\"v\"} N` form", () => {
    metrics.webhook("approved", "processed");
    metrics.webhook("approved", "processed");
    const out = renderMetrics();
    expect(out).toMatch(
      /flitt_webhook_total\{order_status="approved",result="processed"\} 2/,
    );
  });

  it("separately tallies different label combinations", () => {
    metrics.webhook("approved", "processed");
    metrics.webhook("declined", "processed");
    metrics.webhook("approved", "deduped");
    const out = renderMetrics();
    expect(out).toMatch(
      /flitt_webhook_total\{order_status="approved",result="processed"\} 1/,
    );
    expect(out).toMatch(
      /flitt_webhook_total\{order_status="declined",result="processed"\} 1/,
    );
    expect(out).toMatch(
      /flitt_webhook_total\{order_status="approved",result="deduped"\} 1/,
    );
  });

  it("emits a zero-value line for a registered-but-unincremented counter", () => {
    // Register without incrementing — Prometheus needs `0` to detect the
    // first non-zero increment after a process restart.
    incrementCounter("test_counter_total", "Test counter.", undefined, 0);
    const out = renderMetrics();
    expect(out).toMatch(/test_counter_total 0/);
  });

  it("signature failures counter (no labels) renders as `name N`", () => {
    metrics.signatureFailure();
    metrics.signatureFailure();
    metrics.signatureFailure();
    const out = renderMetrics();
    expect(out).toMatch(/^flitt_signature_failures_total 3$/m);
  });

  it("email counter tracks template + result labels", () => {
    metrics.email("receipt", "ok");
    metrics.email("receipt", "fail");
    metrics.email("refund", "ok");
    const out = renderMetrics();
    expect(out).toMatch(/email_send_total\{result="ok",template="receipt"\} 1/);
    expect(out).toMatch(
      /email_send_total\{result="fail",template="receipt"\} 1/,
    );
    expect(out).toMatch(/email_send_total\{result="ok",template="refund"\} 1/);
  });

  it("checkout creation success vs fail are isolated", () => {
    metrics.checkoutCreate("success");
    metrics.checkoutCreate("success");
    metrics.checkoutCreate("fail");
    const out = renderMetrics();
    expect(out).toMatch(/flitt_checkout_creations_total\{result="success"\} 2/);
    expect(out).toMatch(/flitt_checkout_creations_total\{result="fail"\} 1/);
  });

  it("escapes special chars in label values (defense-in-depth)", () => {
    incrementCounter("evil_total", "Evil counter.", {
      input: 'a"b\nc',
    });
    const out = renderMetrics();
    // The serialized label must keep the metric well-formed even with
    // hostile content — Prometheus parsing breaks if quotes aren't escaped.
    expect(out).toMatch(/evil_total\{input="a\\"b\\nc"\}/);
  });

  it("ends output with a trailing newline (Prometheus requires it)", () => {
    metrics.webhook("approved", "processed");
    const out = renderMetrics();
    expect(out.endsWith("\n")).toBe(true);
  });
});
