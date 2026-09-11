/**
 * Import diagnostics collector.
 *
 * Before this, the only diagnostic an import produced was a bare count of
 * dropped subtrees — no category, no layer to click. These tests pin the
 * contract of the categorised collector:
 *
 *  - every warning carries a category, a message, and (when a node exists)
 *    the node id + layer name;
 *  - `recordDroppedNode` keeps its old `droppedNodes` output AND now emits a
 *    `fatal` warning — extended, not replaced;
 *  - the collector NEVER throws. A warning that crashes the import is worse
 *    than no warning at all.
 */
import { describe, it, expect } from "vitest";
import {
  recordWarning,
  buildRelaunchSummary,
  summarizeWarnings,
  groupWarnings,
  MAX_WARNINGS,
  type ImportWarning,
} from "../rendering/diagnostics";
import { recordDroppedNode } from "../rendering/nodes";
import type { RenderContext } from "../types";

function makeContext(): RenderContext {
  return {
    renderStats: {
      hoverCacheHits: 0,
      hoverCacheMisses: 0,
      emptyPseudoSkipped: 0,
      pseudoErrors: 0,
      droppedNodes: [],
      warnings: [],
    },
  } as unknown as RenderContext;
}

describe("recordWarning", () => {
  it("stores category, message, node id and layer name", () => {
    const ctx = makeContext();
    recordWarning(ctx, {
      category: "typography",
      message: 'Font "Söhne" not available — rendered with Inter',
      nodeId: "12:34",
      layerName: "Heading",
    });

    expect(ctx.renderStats?.warnings).toEqual([
      {
        category: "typography",
        message: 'Font "Söhne" not available — rendered with Inter',
        nodeId: "12:34",
        layerName: "Heading",
      },
    ]);
  });

  it("omits nodeId when no Figma node exists to link to", () => {
    const ctx = makeContext();
    recordWarning(ctx, { category: "image", message: "decode failed", layerName: "Hero" });

    const w = ctx.renderStats!.warnings![0];
    expect(w.nodeId).toBeUndefined();
    expect(w.layerName).toBe("Hero");
  });

  it("creates the warnings array when renderStats has none yet", () => {
    const ctx = { renderStats: {} } as unknown as RenderContext;
    recordWarning(ctx, { category: "svg", message: "Missing or invalid SVG" });
    expect(ctx.renderStats?.warnings).toHaveLength(1);
  });

  it("caps the list and counts the overflow instead of growing unbounded", () => {
    const ctx = makeContext();
    for (let i = 0; i < MAX_WARNINGS + 25; i++) {
      recordWarning(ctx, { category: "other", message: `w${i}` });
    }
    expect(ctx.renderStats!.warnings).toHaveLength(MAX_WARNINGS);
    expect(ctx.renderStats!.warningOverflow).toBe(25);
  });

  describe("never throws", () => {
    it("when renderStats is absent", () => {
      const ctx = {} as RenderContext;
      expect(() => recordWarning(ctx, { category: "other", message: "x" })).not.toThrow();
    });

    it("when the context itself is null", () => {
      expect(() =>
        recordWarning(null as unknown as RenderContext, { category: "other", message: "x" }),
      ).not.toThrow();
    });

    it("when pushing into the warnings array throws", () => {
      const ctx = makeContext();
      Object.defineProperty(ctx.renderStats!, "warnings", {
        get() {
          throw new Error("boom");
        },
      });
      expect(() => recordWarning(ctx, { category: "other", message: "x" })).not.toThrow();
    });
  });
});

describe("recordWarning — per-instance detail", () => {
  it("stores detail separately so the message stays a groupable template", () => {
    const ctx = makeContext();
    recordWarning(ctx, {
      category: "layout",
      message: "Hidden at capture time (opacity: 0) — skipped",
      layerName: "Promo",
      detail: "12 layers · 1440×900px",
    });
    expect(ctx.renderStats.warnings?.[0]).toEqual({
      category: "layout",
      message: "Hidden at capture time (opacity: 0) — skipped",
      layerName: "Promo",
      detail: "12 layers · 1440×900px",
    });
  });

  it("omits detail when none is given", () => {
    const ctx = makeContext();
    recordWarning(ctx, { category: "other", message: "m" });
    expect(ctx.renderStats.warnings?.[0]).not.toHaveProperty("detail");
  });
});

describe("recordDroppedNode", () => {
  it("still records the legacy droppedNodes entry", () => {
    const ctx = makeContext();
    recordDroppedNode(ctx, "Card", new Error("layoutWrap on VERTICAL"));

    expect(ctx.renderStats!.droppedNodes).toEqual([
      { name: "Card", error: "layoutWrap on VERTICAL" },
    ]);
  });

  it("also emits a fatal warning naming the lost layer", () => {
    const ctx = makeContext();
    recordDroppedNode(ctx, "Card", new Error("layoutWrap on VERTICAL"));

    const warnings = ctx.renderStats!.warnings!;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("fatal");
    expect(warnings[0].layerName).toBe("Card");
    expect(warnings[0].message).toContain("layoutWrap on VERTICAL");
  });

  it("falls back to (unnamed) for a nameless node in both outputs", () => {
    const ctx = makeContext();
    recordDroppedNode(ctx, undefined, "plain string failure");

    expect(ctx.renderStats!.droppedNodes![0].name).toBe("(unnamed)");
    expect(ctx.renderStats!.warnings![0].layerName).toBe("(unnamed)");
    expect(ctx.renderStats!.warnings![0].message).toContain("plain string failure");
  });
});

describe("summarizeWarnings", () => {
  const sample: ImportWarning[] = [
    { category: "typography", message: "a" },
    { category: "typography", message: "b" },
    { category: "typography", message: "c" },
    { category: "image", message: "d" },
    { category: "fatal", message: "e" },
  ];

  it("groups by category in a stable, severity-first order", () => {
    expect(summarizeWarnings(sample)).toEqual([
      { category: "fatal", count: 1 },
      { category: "typography", count: 3 },
      { category: "image", count: 1 },
    ]);
  });

  it("returns an empty list for a clean import", () => {
    expect(summarizeWarnings([])).toEqual([]);
  });
});

describe("buildRelaunchSummary", () => {
  it("renders one human line per category", () => {
    expect(
      buildRelaunchSummary([
        { category: "typography", message: "a" },
        { category: "typography", message: "b" },
        { category: "typography", message: "c" },
        { category: "image", message: "d" },
      ]),
    ).toBe("3 fonts substituted\n1 image skipped");
  });

  it("singularises a lone warning", () => {
    expect(buildRelaunchSummary([{ category: "fatal", message: "a" }])).toBe(
      "1 element could not be rendered",
    );
  });

  it("says so when the import was clean", () => {
    expect(buildRelaunchSummary([])).toBe("Imported with no warnings");
  });
});

describe("groupWarnings", () => {
  const SOEHNE = 'Font "Söhne" not available — rendered with "Inter"';
  const TIEMPOS = 'Font "Tiempos" not available — rendered with "Inter"';
  const DECODE = "Image could not be decoded — replaced with a placeholder";
  const SKIPPED = "Could not be rendered — skipped (x)";
  const sample: ImportWarning[] = [
    { category: "typography", message: SOEHNE, nodeId: "1:1", layerName: "Hero" },
    { category: "image", message: DECODE, nodeId: "1:2", layerName: "Photo" },
    { category: "typography", message: SOEHNE, nodeId: "1:3", layerName: "Subhead" },
    { category: "typography", message: TIEMPOS, layerName: "Quote" },
    { category: "fatal", message: SKIPPED, layerName: "Card" },
  ];

  it("collapses identical (category, message) pairs into one issue", () => {
    const soehne = groupWarnings(sample).find((g) => g.message === SOEHNE);
    expect(soehne?.count).toBe(2);
    expect(soehne?.layers).toEqual([
      { nodeId: "1:1", layerName: "Hero" },
      { nodeId: "1:3", layerName: "Subhead" },
    ]);
  });

  it("keeps different messages apart even within one category", () => {
    const typography = groupWarnings(sample).filter((g) => g.category === "typography");
    expect(typography.map((g) => g.message)).toEqual([SOEHNE, TIEMPOS]);
  });

  it("orders issues severity-first, then by first appearance", () => {
    expect(groupWarnings(sample).map((g) => g.message)).toEqual([
      SKIPPED,
      SOEHNE,
      TIEMPOS,
      DECODE,
    ]);
  });

  it("carries per-layer detail without splitting the issue", () => {
    const groups = groupWarnings([
      { category: "layout", message: "Hidden", layerName: "A", detail: "3 layers" },
      { category: "layout", message: "Hidden", layerName: "B", detail: "9 layers" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].layers).toEqual([
      { layerName: "A", detail: "3 layers" },
      { layerName: "B", detail: "9 layers" },
    ]);
  });

  it("returns an empty list for a clean import", () => {
    expect(groupWarnings([])).toEqual([]);
    expect(groupWarnings(undefined)).toEqual([]);
  });
});
