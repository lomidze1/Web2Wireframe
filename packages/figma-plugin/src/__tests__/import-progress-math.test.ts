import { describe, it, expect } from "vitest";
import {
  CAPTURE_CAP,
  RENDER_START,
  DEFAULT_CAPTURE_MS,
  NODE_BAND_START,
  NODE_BAND_END,
  capturePercent,
  mapRenderPercent,
  renderPhase,
  nodeProgressPercent,
  mergeDisplay,
  medianEstimate,
} from "../utils/importProgress";

/**
 * The progress model behind the import loader.
 *
 * The capture phase (the API round-trip — 44s of stripe.com's 51.5s) has no
 * signal to report, so it is *estimated*: an exponential curve that decelerates
 * on its own and never reaches the segment cap. The render phase is real —
 * driven by the node counter — and lands on the other side of the same scale.
 * These are the pure pieces; the component only draws them.
 */
describe("capturePercent", () => {
  it("starts at zero", () => {
    expect(capturePercent(0, 20_000)).toBe(0);
  });

  it("never reaches the capture cap, however long the wait", () => {
    expect(capturePercent(10 * 60_000, 20_000)).toBeLessThan(CAPTURE_CAP);
    expect(capturePercent(Number.MAX_SAFE_INTEGER, 20_000)).toBeLessThan(CAPTURE_CAP);
  });

  it("rises monotonically", () => {
    let prev = -1;
    for (let t = 0; t <= 120_000; t += 500) {
      const p = capturePercent(t, 20_000);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("sits around four fifths of the segment when the estimate is met", () => {
    const p = capturePercent(20_000, 20_000);
    expect(p).toBeGreaterThan(CAPTURE_CAP * 0.75);
    expect(p).toBeLessThan(CAPTURE_CAP * 0.85);
  });

  it("decelerates — the second half of the estimate adds less than the first", () => {
    const first = capturePercent(10_000, 20_000);
    const second = capturePercent(20_000, 20_000) - first;
    expect(second).toBeLessThan(first);
  });

  it("falls back to the default estimate when handed a useless one", () => {
    expect(capturePercent(5_000, 0)).toBe(capturePercent(5_000, DEFAULT_CAPTURE_MS));
    expect(capturePercent(5_000, -1)).toBe(capturePercent(5_000, DEFAULT_CAPTURE_MS));
  });
});

describe("mapRenderPercent", () => {
  it("places the sandbox scale above the capture segment", () => {
    expect(mapRenderPercent(0)).toBe(RENDER_START);
    expect(mapRenderPercent(100)).toBe(100);
  });

  it("is monotonic and never dips below the capture cap", () => {
    for (let p = 0; p <= 100; p += 1) {
      expect(mapRenderPercent(p)).toBeGreaterThanOrEqual(CAPTURE_CAP);
    }
    expect(mapRenderPercent(40)).toBeGreaterThan(mapRenderPercent(20));
  });

  it("clamps out-of-range input", () => {
    expect(mapRenderPercent(-10)).toBe(RENDER_START);
    expect(mapRenderPercent(150)).toBe(100);
  });
});

describe("renderPhase", () => {
  it("names the phase from the sandbox percent", () => {
    expect(renderPhase(5)).toBe("styles");
    expect(renderPhase(18)).toBe("styles");
    expect(renderPhase(25)).toBe("building");
    expect(renderPhase(84)).toBe("building");
    expect(renderPhase(90)).toBe("finalizing");
    expect(renderPhase(100)).toBe("finalizing");
  });
});

describe("nodeProgressPercent", () => {
  it("spans the frame-render band", () => {
    expect(nodeProgressPercent(0, 1000)).toBe(NODE_BAND_START);
    expect(nodeProgressPercent(1000, 1000)).toBe(NODE_BAND_END);
  });

  it("never passes the band even when the renderer emits more nodes than the tree held", () => {
    // Wrapper frames (margin collapse, pseudo spans) push `rendered` past the
    // counted tree — the bar must not run into the next milestone.
    expect(nodeProgressPercent(4000, 1000)).toBe(NODE_BAND_END);
  });

  it("is monotonic", () => {
    let prev = -1;
    for (let n = 0; n <= 1000; n += 10) {
      const p = nodeProgressPercent(n, 1000);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("degrades to the band start when the total is unknown", () => {
    expect(nodeProgressPercent(50, 0)).toBe(NODE_BAND_START);
    expect(nodeProgressPercent(50, -1)).toBe(NODE_BAND_START);
  });
});

describe("mergeDisplay", () => {
  it("never moves backwards", () => {
    expect(mergeDisplay(70, 40)).toBe(70);
    expect(mergeDisplay(70, 80)).toBe(80);
  });

  it("ignores non-finite input", () => {
    expect(mergeDisplay(70, Number.NaN)).toBe(70);
    expect(mergeDisplay(70, Number.POSITIVE_INFINITY)).toBe(70);
  });

  it("clamps to 100", () => {
    expect(mergeDisplay(99, 140)).toBe(100);
  });
});

describe("medianEstimate", () => {
  it("falls back to the default with no history", () => {
    expect(medianEstimate([])).toBe(DEFAULT_CAPTURE_MS);
  });

  it("takes the median, so one freak import cannot skew the next", () => {
    expect(medianEstimate([10_000, 12_000, 200_000])).toBe(12_000);
    expect(medianEstimate([10_000, 20_000])).toBe(15_000);
  });

  it("drops junk samples", () => {
    expect(medianEstimate([Number.NaN, -5, 0, 8_000])).toBe(8_000);
    expect(medianEstimate([Number.NaN, -5])).toBe(DEFAULT_CAPTURE_MS);
  });
});
