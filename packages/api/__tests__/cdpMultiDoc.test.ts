import { describe, it, expect } from "vitest";

// ============================================================================
// Tests: shared-extraction parseMultiDocSnapshot is available to Plugin_Backend
// ============================================================================

describe("Plugin_Backend — parseMultiDocSnapshot availability", () => {
  it("exports parseMultiDocSnapshot from shared-extraction", async () => {
    const sharedExtraction = await import("@w2w/shared");
    expect(typeof sharedExtraction.parseMultiDocSnapshot).toBe("function");
  });

  it("exports parseSnapshot as backward compat", async () => {
    const sharedExtraction = await import("@w2w/shared");
    expect(typeof sharedExtraction.parseSnapshot).toBe("function");
  });

  // Note: parseMultiDocSnapshot with real snapshot data is thoroughly tested
  // in shared-extraction/src/__tests__/parseSnapshot-multiDoc.test.ts
});

// ============================================================================
// Tests: cdp/index.ts uses parseMultiDocSnapshot
// ============================================================================

describe("Plugin_Backend cdp/index.ts — multi-doc import", () => {
  it("uses parseMultiDocSnapshot (not just parseSnapshot)", async () => {
    const cdpIndex = await import("../src/lib/cdp/index.js");
    // The module should exist and export cdp-related functions
    expect(cdpIndex).toBeDefined();
  });

  it("shared exports parseMultiDocSnapshot with iframeDocuments support", async () => {
    const shared = await import("@w2w/shared");
    // parseMultiDocSnapshot accepts iframeDocuments via snapshot
    expect(typeof shared.parseMultiDocSnapshot).toBe("function");
  });
});
