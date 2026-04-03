/**
 * Platform Font Resolution Tests
 *
 * Tests that buildElementTree correctly uses platformFontMap
 * (from CSS.getPlatformFontsForNode) to resolve actual rendered font names
 * instead of PostScript abbreviations or CSS variable values.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { PlatformFontInfo, CDPMatchedStyles } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

const baseStyles: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  "background-color": "rgba(255, 255, 255, 1)",
  color: "rgba(0, 0, 0, 1)",
  "font-family": "Inter",
  "font-size": "16",
  "font-weight": "400",
  "line-height": "normal",
  "letter-spacing": "0",
  "text-align": "left",
  position: "static",
};

function makeBodyNode(overrides: Partial<ParsedSnapshotNode> = {}): ParsedSnapshotNode {
  return {
    index: 0,
    parentIndex: -1,
    backendNodeId: 100,
    nodeType: 1,
    nodeName: "body",
    textContent: "",
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    computedStyles: {
      ...baseStyles,
      ...overrides.computedStyles,
    },
    ...overrides,
  };
}

function makeTextNode(
  index: number,
  backendNodeId: number,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex: 0,
    backendNodeId,
    nodeType: 1,
    nodeName: "p",
    textContent: "Hello World",
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: { x: 0, y: 0, width: 200, height: 24 },
    computedStyles: {
      ...baseStyles,
      "background-color": "rgba(0, 0, 0, 0)",
      "font-family": "PSA, sans-serif",
      "line-height": "24px",
      ...overrides.computedStyles,
    },
    ...overrides,
  };
}

function makePlatformFont(
  familyName: string,
  postScriptName: string,
  isCustomFont: boolean,
  glyphCount: number
): PlatformFontInfo {
  return { familyName, postScriptName, isCustomFont, glyphCount };
}

// ============================================================================
// TESTS
// ============================================================================

describe("Platform Font Resolution in buildElementTree", () => {
  it("uses platform font familyName instead of computed PostScript name", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200);
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(200, [
      makePlatformFont("PP Fragment Glare Medium", "PPFragmentGlare-Medium", true, 42),
    ]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    // Find the text node child
    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.fontFamily).toBe("PP Fragment Glare Medium");
  });

  it("picks font with highest glyphCount when multiple platform fonts exist", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200);
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(200, [
      makePlatformFont("Noto Sans CJK", "NotoSansCJK-Regular", false, 3),
      makePlatformFont("Averta Std Bold", "AvertaStd-Bold", true, 39),
    ]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.fontFamily).toBe("Averta Std Bold");
  });

  it("falls back to computed styles when platformFontMap has no entry for node", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200, {
      computedStyles: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgba(0, 0, 0, 1)",
        "font-family": "Arial, sans-serif",
        "font-size": "16",
        "font-weight": "400",
        "line-height": "24px",
        "letter-spacing": "0",
        "text-align": "left",
        position: "static",
      },
    });
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    // Empty platformFontMap — no entry for backendNodeId 200
    const platformFontMap = new Map<number, PlatformFontInfo[]>();

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.fontFamily).toBe("Arial");
  });

  it("works without platformFontMap (backward compatibility)", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200, {
      computedStyles: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgba(0, 0, 0, 1)",
        "font-family": "Roboto, sans-serif",
        "font-size": "16",
        "font-weight": "400",
        "line-height": "24px",
        "letter-spacing": "0",
        "text-align": "left",
        position: "static",
      },
    });
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    // No platformFontMap at all
    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440 }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.fontFamily).toBe("Roboto");
  });

  it("uses derived weight from variable font postScriptName", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200, {
      computedStyles: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgba(0, 0, 0, 1)",
        "font-family": "Source Sans 3",
        "font-size": "16",
        "font-weight": "400",  // computed says 400
        "line-height": "24px",
        "letter-spacing": "0",
        "text-align": "left",
        position: "static",
      },
    });
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(200, [
      // Variable font with Bold keyword in familyName
      makePlatformFont("Source Sans 3 Bold", "SourceSans3VF-Bold", true, 50),
    ]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    // Should derive 700 from "Bold" keyword, not use computed 400
    expect(child.fontWeight).toBe(700);
  });

  it("sets platformFontFamily when platform font is used", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200);
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(200, [
      makePlatformFont("PP Fragment Glare Medium", "PPFragmentGlare-Medium", true, 42),
    ]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.platformFontFamily).toBe("PP Fragment Glare Medium");
  });

  it("does not set platformFontFamily when no platform font data exists", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200, {
      computedStyles: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgba(0, 0, 0, 1)",
        "font-family": "Arial, sans-serif",
        "font-size": "16",
        "font-weight": "400",
        "line-height": "24px",
        "letter-spacing": "0",
        "text-align": "left",
        position: "static",
      },
    });
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440 }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.platformFontFamily).toBeUndefined();
  });

  it("does not set platformFontFamily for obfuscated fonts", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200, {
      computedStyles: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgba(0, 0, 0, 1)",
        "font-family": "Roboto, sans-serif",
        "font-size": "16",
        "font-weight": "400",
        "line-height": "24px",
        "letter-spacing": "0",
        "text-align": "left",
        position: "static",
      },
    });
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(200, [
      makePlatformFont(".\x7F", "font000000002f7045b0", true, 42),
    ]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    expect(child.platformFontFamily).toBeUndefined();
    expect(child.fontFamily).toBe("Roboto");
  });

  it("falls back to computed styles for obfuscated platform font", () => {
    const body = makeBodyNode();
    const textNode = makeTextNode(1, 200, {
      computedStyles: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgba(0, 0, 0, 1)",
        "font-family": "Roboto, sans-serif",
        "font-size": "16",
        "font-weight": "400",
        "line-height": "24px",
        "letter-spacing": "0",
        "text-align": "left",
        position: "static",
      },
    });
    const nodes = [body, textNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(200, [
      // Obfuscated font: non-printable familyName + hex postScriptName
      makePlatformFont(".\x7F", "font000000002f7045b0", true, 42),
    ]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      { viewportWidth: 1440, platformFontMap }
    );

    const child = tree.children[0];
    expect(child).toBeDefined();
    // Should NOT use the obfuscated ".\x7F" — should fall back to computed "Roboto"
    expect(child.fontFamily).toBe("Roboto");
  });
});
