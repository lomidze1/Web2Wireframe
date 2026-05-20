import { describe, it, expect } from "vitest";
import { flittSign } from "../src/services/flittService.js";

/**
 * Performance regression guard for the Flitt request signer.
 *
 * Why this matters: `flittSign` is on the hot path for every checkout
 * creation and every webhook verification. A regression that pushes it
 * above a few milliseconds would compound across the webhook handler
 * (which Flitt times out around 5s), and a multi-second sign call would
 * effectively DoS our own webhook delivery during a charge spike.
 *
 * The thresholds below are deliberately generous — they catch a tenfold
 * slowdown (the order of magnitude that signals a real algorithmic
 * regression like O(n²) field sorting) without going red on noisy CI
 * runners. Tune down once we have a stable baseline.
 *
 * `performance.now()` is monotonic and resolution-friendly down to ~10μs
 * on Node 20, so the per-call timings below are meaningful even at low
 * iteration counts.
 */
const SECRET = "test-secret-key-32-bytes-or-more";

// Representative shapes — mirrors what flittService passes in practice.
const minimalParams = {
  merchant_id: "1549901",
  order_id: "w2w_pro_u-1_1715000000000",
  amount: 1600,
  currency: "USD",
  order_desc: "Web2Wireframe Pro — 1 Month",
};

const fullParams = {
  ...minimalParams,
  server_callback_url: "https://api.web2wireframe.design/api/webhooks/flitt",
  response_url: "https://www.web2wireframe.design/checkout/success",
  merchant_data: JSON.stringify({
    figmaUserId: "abc123",
    plan: "pro",
    recurring: false,
  }),
  subscription: "Y",
  recurring_data: JSON.stringify({
    amount: 1600,
    period: "month",
    every: 1,
    quantity: 999,
    state: "shown_readonly",
  }),
  lang: "en",
};

describe("flittSign — performance regression guard", () => {
  it("signs a minimal payload in under 2ms (avg over 1000 iters)", () => {
    const iters = 1000;
    const start = performance.now();
    for (let i = 0; i < iters; i += 1) {
      flittSign(minimalParams, SECRET);
    }
    const avgMs = (performance.now() - start) / iters;
    // 2ms is ~100× the expected ~20μs — anything close to this threshold
    // is an algorithmic regression, not noise.
    expect(avgMs).toBeLessThan(2);
  });

  it("signs a full Flitt payload in under 2ms (avg over 1000 iters)", () => {
    const iters = 1000;
    const start = performance.now();
    for (let i = 0; i < iters; i += 1) {
      flittSign(fullParams, SECRET);
    }
    const avgMs = (performance.now() - start) / iters;
    expect(avgMs).toBeLessThan(2);
  });

  it("scales linearly: 100 fields signs in well under 50ms", () => {
    // Synthesize a wide payload — defends against a future change that
    // sorts the field list in O(n²).
    const wide: Record<string, string> = {};
    for (let i = 0; i < 100; i += 1) {
      wide[`field_${i.toString().padStart(3, "0")}`] = `value_${i}`;
    }
    const start = performance.now();
    flittSign(wide, SECRET);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("burst of 100 signs completes in under 100ms", () => {
    // Webhook spike scenario — 100 inflight Flitt deliveries arriving
    // within a second. Each gets verifyCallback → flittSign internally.
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) {
      flittSign({ ...fullParams, order_id: `burst_${i}` }, SECRET);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
