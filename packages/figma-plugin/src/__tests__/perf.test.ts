/**
 * Unit tests for the dev-only import profiler (src/utils/perf.ts).
 *
 * Mirrors h2d's `ue(label, fn)` accumulator: every timed span adds to a
 * per-label row, and one `report()` prints the table sorted by cost.
 *
 * The `__W2W_DEV_LOG__ === false` (production) branch is NOT covered here —
 * it is a build-time esbuild define, so vitest compiles it to `true` and the
 * dead branch is unreachable from a test. That path is guarded by the
 * post-build grep gate in scripts/build-prod.mjs instead, exactly like
 * devLogger.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  timed,
  timedSync,
  mark,
  count,
  report,
  reset,
  snapshot,
  handoff,
} from "../utils/perf";

beforeEach(() => {
  reset();
});

// ============================================================================
// timedSync
// ============================================================================

describe("timedSync", () => {
  it("returns the callback's value", () => {
    expect(timedSync("a", () => 42)).toBe(42);
  });

  it("accumulates count across calls to the same label", () => {
    timedSync("a", () => 1);
    timedSync("a", () => 2);
    timedSync("b", () => 3);

    expect(snapshot().a.count).toBe(2);
    expect(snapshot().b.count).toBe(1);
  });

  it("records elapsed milliseconds", () => {
    timedSync("spin", () => {
      const until = Date.now() + 12;
      while (Date.now() < until) {
        /* busy wait */
      }
    });

    expect(snapshot().spin.ms).toBeGreaterThanOrEqual(10);
  });

  it("counts a throw as an error and rethrows it", () => {
    expect(() =>
      timedSync("boom", () => {
        throw new Error("nope");
      })
    ).toThrow("nope");

    expect(snapshot().boom.err).toBe(1);
    expect(snapshot().boom.count).toBe(1);
  });
});

// ============================================================================
// timed (async)
// ============================================================================

describe("timed", () => {
  it("resolves to the callback's value", async () => {
    await expect(timed("a", async () => "ok")).resolves.toBe("ok");
  });

  it("measures the full await, not just the synchronous part", async () => {
    await timed("wait", () => new Promise((r) => setTimeout(r, 20)));

    expect(snapshot().wait.ms).toBeGreaterThanOrEqual(15);
  });

  it("counts a rejection as an error and rethrows it", async () => {
    await expect(
      timed("boom", async () => {
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");

    expect(snapshot().boom.err).toBe(1);
  });

  it("accumulates concurrent spans on the same label", async () => {
    await Promise.all([
      timed("par", () => new Promise((r) => setTimeout(r, 10))),
      timed("par", () => new Promise((r) => setTimeout(r, 10))),
    ]);

    expect(snapshot().par.count).toBe(2);
  });
});

// ============================================================================
// mark / count — pre-measured spans and volume metrics
// ============================================================================

describe("mark", () => {
  it("adds a pre-measured span as a normal row", () => {
    mark("ui.bridge", 250);

    expect(snapshot()["ui.bridge"]).toEqual({ ms: 250, count: 1, err: 0 });
  });

  it("merges repeated marks into one row", () => {
    mark("ui.fetch", 100);
    mark("ui.fetch", 50);

    expect(snapshot()["ui.fetch"].ms).toBe(150);
    expect(snapshot()["ui.fetch"].count).toBe(2);
  });

  it("ignores a negative duration (clock skew between realms)", () => {
    mark("ui.bridge", -5);

    expect(snapshot()["ui.bridge"]).toBeUndefined();
  });

  it("merges a whole UI table handed over from the iframe", () => {
    mark("ui.fetch", 1000);
    // The sandbox replays the UI's rows into its own table.
    const fromUi = { "ui.fetch": 500, "ui.parseJson": 200 };
    for (const [label, ms] of Object.entries(fromUi)) mark(label, ms);

    expect(snapshot()["ui.fetch"].ms).toBe(1500);
    expect(snapshot()["ui.parseJson"].ms).toBe(200);
  });
});

describe("count", () => {
  it("records a volume metric with no time", () => {
    count("nodes", 1200);

    expect(snapshot().nodes).toEqual({ ms: 0, count: 1200, err: 0 });
  });

  it("adds up repeated counts", () => {
    count("frames", 2);
    count("frames", 3);

    expect(snapshot().frames.count).toBe(5);
  });
});

// ============================================================================
// handoff — UI iframe → sandbox
// ============================================================================

describe("handoff", () => {
  it("returns label → ms for timings only, dropping volume counters", () => {
    mark("ui.fetch", 800);
    mark("ui.parseJson", 120);
    count("nodes", 1200);

    expect(handoff()).toEqual({ "ui.fetch": 800, "ui.parseJson": 120 });
  });

  it("clears the table it handed over", () => {
    mark("ui.fetch", 800);
    handoff();

    expect(snapshot()).toEqual({});
  });

  it("round-trips into the other realm's table through mark()", () => {
    mark("ui.fetch", 800);
    const shipped = handoff();

    // …sandbox side: fresh table, replay the UI's rows.
    mark("createWireframeFrame", 200);
    for (const [label, ms] of Object.entries(shipped)) mark(label, ms);

    expect(snapshot()["ui.fetch"].ms).toBe(800);
    expect(snapshot()["createWireframeFrame"].ms).toBe(200);
  });
});

// ============================================================================
// report
// ============================================================================

describe("report", () => {
  it("sorts rows by elapsed time, most expensive first", () => {
    mark("cheap", 10);
    mark("expensive", 900);
    mark("middling", 100);

    const lines = report()
      .split("\n")
      .filter((l) => /cheap|expensive|middling/.test(l));

    expect(lines[0]).toContain("expensive");
    expect(lines[1]).toContain("middling");
    expect(lines[2]).toContain("cheap");
  });

  it("shows each row's share of the total", () => {
    mark("half", 500);
    mark("other", 500);

    expect(report()).toMatch(/half\s.*50\.0%/);
  });

  it("lists volume metrics separately from timings", () => {
    mark("createWireframeFrame", 900);
    count("nodes", 1200);

    const out = report();
    expect(out).toContain("nodes");
    expect(out).toContain("1200");
    // A zero-time counter must not pollute the timing percentages.
    expect(out).toMatch(/createWireframeFrame\s.*100\.0%/);
  });

  it("flags rows that threw", () => {
    expect(() =>
      timedSync("risky", () => {
        throw new Error("x");
      })
    ).toThrow();

    const out = report();
    expect(out).toContain("risky");
    expect(out).toContain("1 err");
  });

  it("clears the table so the next import starts clean", () => {
    mark("a", 100);
    report();

    expect(snapshot()).toEqual({});
    expect(report()).toContain("no data");
  });
});

// ============================================================================
// nested labels — a leaf measured inside another measured leaf
// ============================================================================

describe("nested labels", () => {
  it("keeps a nested row out of the total and the percentages", () => {
    timedSync("node.text", () => {
      timedSync("node.font", () => {}, true);
    });
    mark("node.text", 900);
    mark("node.font", 400, true);

    const out = report();
    // Only node.text counts toward the total, so it owns 100% of it.
    expect(out).toMatch(/node\.text\s.*100\.0%/);
    // The nested row carries no percentage at all.
    expect(out).not.toMatch(/node\.font\s.*%/);
  });

  it("prints nested rows in their own section", () => {
    mark("node.text", 900);
    mark("node.font", 400, true);

    const out = report();
    const lines = out.split("\n");
    const header = lines.findIndex((l) => l.includes("nested"));
    const parent = lines.findIndex((l) => l.includes("node.text"));
    const child = lines.findIndex((l) => l.includes("node.font"));

    expect(header).toBeGreaterThan(-1);
    expect(parent).toBeLessThan(header);
    expect(child).toBeGreaterThan(header);
  });

  it("shows avg ms per call for nested rows", () => {
    mark("node.font", 300, true);
    mark("node.font", 300, true);
    mark("node.font", 300, true);

    // 900ms over 3 calls → 300ms average, the number that says whether the
    // cost is per-call or just call volume.
    expect(report()).toMatch(/node\.font\s.*900ms.*×3.*300(\.0)?ms avg/);
  });

  it("leaves two-argument calls in the main section", () => {
    timedSync("plain", () => 1);
    mark("alsoPlain", 50);

    const out = report();
    expect(out).toMatch(/plain\s.*%/);
    expect(out).toMatch(/alsoPlain\s.*%/);
    expect(out).not.toContain("nested");
  });

  it("keeps a label nested once it has been marked nested", () => {
    mark("node.font", 100, true);
    mark("node.font", 100);

    // A stray two-arg call must not silently promote the row back into the
    // total — that would double-count it against its parent.
    expect(report()).not.toMatch(/node\.font\s.*%/);
  });
});
