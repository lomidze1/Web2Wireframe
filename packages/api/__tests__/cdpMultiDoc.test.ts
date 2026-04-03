import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
// Tests: cdp/index.js imports parseMultiDocSnapshot
// ============================================================================

describe("Plugin_Backend cdp/index.js — multi-doc import", () => {
  it("uses parseMultiDocSnapshot (not just parseSnapshot)", () => {
    const cdpIndexPath = join(__dirname, "..", "lib", "cdp", "index.ts");
    const source = readFileSync(cdpIndexPath, "utf-8");

    // After our change, the file should import and use parseMultiDocSnapshot
    expect(source).toContain("parseMultiDocSnapshot");
  });

  it("passes iframeDocuments to buildElementTree", () => {
    const cdpIndexPath = join(__dirname, "..", "lib", "cdp", "index.ts");
    const source = readFileSync(cdpIndexPath, "utf-8");

    expect(source).toContain("iframeDocuments");
  });
});
