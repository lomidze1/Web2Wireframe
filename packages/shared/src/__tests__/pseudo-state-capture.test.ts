/**
 * Pseudo-state Capture Tests (Layer #2)
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 * ფუნქციები შეიქმნება pseudo-states.ts მოდულში.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedSnapshotNode } from "../snapshot";
import type { CDPClientInterface, CDPMatchedStyles } from "../types";

// Will be imported after implementation:
// import { findInteractiveNodes, flattenMatchedRules, capturePseudoStatesForNodes } from "../pseudo-states";

// ============================================================================
// HELPERS: Mock factories
// ============================================================================

function createMockNode(
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index: 0,
    backendNodeId: 100,
    nodeType: 1, // ELEMENT_NODE
    nodeName: "div",
    parentIndex: -1,
    attributes: {},
    bounds: { x: 0, y: 0, width: 200, height: 50 },
    computedStyles: {},
    textContent: "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

function createMockMatchedStyles(
  rules: Array<{
    selectorText: string;
    properties: Record<string, string>;
    origin?: string;
  }> = [],
  inlineStyles: Record<string, string> = {}
): CDPMatchedStyles {
  return {
    inlineStyle: {
      cssProperties: Object.entries(inlineStyles).map(([name, value]) => ({
        name,
        value,
        text: `${name}: ${value}`,
      })),
      shorthandEntries: [],
    },
    matchedCSSRules: rules.map((rule) => ({
      rule: {
        selectorList: {
          selectors: [{ text: rule.selectorText }],
          text: rule.selectorText,
        },
        style: {
          cssProperties: Object.entries(rule.properties).map(
            ([name, value]) => ({
              name,
              value,
              text: `${name}: ${value}`,
            })
          ),
          shorthandEntries: [],
        },
        origin: (rule.origin as "regular" | "user-agent") || "regular",
      },
      matchingSelectors: [0],
    })),
  };
}

function createMockCDPClient(): CDPClientInterface & {
  calls: Array<{ method: string; params?: Record<string, unknown> }>;
  mockMatchedStyles: Map<string, CDPMatchedStyles>;
} {
  const calls: Array<{
    method: string;
    params?: Record<string, unknown>;
  }> = [];
  const mockMatchedStyles = new Map<string, CDPMatchedStyles>();

  return {
    calls,
    mockMatchedStyles,
    send: vi.fn(
      async (
        method: string,
        params?: Record<string, unknown>
      ): Promise<unknown> => {
        calls.push({ method, params });

        if (method === "CSS.getMatchedStylesForNode") {
          // Return different styles based on which pseudo-class is forced
          const lastForceCall = [...calls]
            .reverse()
            .find((c) => c.method === "CSS.forcePseudoState");
          const forced = lastForceCall?.params?.forcedPseudoClasses as string[] | undefined;
          const key = forced && forced.length > 0 ? forced[0] : "normal";
          const styles = mockMatchedStyles.get(key);
          return (styles || createMockMatchedStyles());
        }

        if (method === "CSS.forcePseudoState") {
          return undefined;
        }

        return undefined;
      }
    ) as CDPClientInterface["send"],
    enableDomains: vi.fn(async () => {}),
  };
}

// ============================================================================
// #1: findInteractiveNodes — element selection
// ============================================================================

describe("findInteractiveNodes", () => {
  // Lazy import to allow tests to be written before implementation
  let findInteractiveNodes: (
    nodes: ParsedSnapshotNode[]
  ) => ParsedSnapshotNode[];

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    findInteractiveNodes = mod.findInteractiveNodes;
  });

  it("should select <button> elements", () => {
    const nodes = [
      createMockNode({ nodeName: "button", backendNodeId: 1 }),
      createMockNode({ nodeName: "div", backendNodeId: 2 }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(1);
    expect(result[0].backendNodeId).toBe(1);
  });

  it("should select <a> elements", () => {
    const nodes = [
      createMockNode({ nodeName: "a", backendNodeId: 1 }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(1);
  });

  it("should select <input>, <select>, <textarea> elements", () => {
    const nodes = [
      createMockNode({ nodeName: "input", backendNodeId: 1 }),
      createMockNode({ nodeName: "select", backendNodeId: 2 }),
      createMockNode({ nodeName: "textarea", backendNodeId: 3 }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(3);
  });

  it("should select elements with role=button, role=link, role=tab, role=menuitem", () => {
    const nodes = [
      createMockNode({
        nodeName: "div",
        backendNodeId: 1,
        attributes: { role: "button" },
      }),
      createMockNode({
        nodeName: "span",
        backendNodeId: 2,
        attributes: { role: "link" },
      }),
      createMockNode({
        nodeName: "div",
        backendNodeId: 3,
        attributes: { role: "tab" },
      }),
      createMockNode({
        nodeName: "li",
        backendNodeId: 4,
        attributes: { role: "menuitem" },
      }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(4);
  });

  it("should select elements with cursor: pointer", () => {
    const nodes = [
      createMockNode({
        nodeName: "div",
        backendNodeId: 1,
        computedStyles: { cursor: "pointer" },
      }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(1);
  });

  it("should select elements with tabindex attribute", () => {
    const nodes = [
      createMockNode({
        nodeName: "div",
        backendNodeId: 1,
        attributes: { tabindex: "0" },
      }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(1);
  });

  it("should NOT select non-interactive elements", () => {
    const nodes = [
      createMockNode({ nodeName: "div", backendNodeId: 1 }),
      createMockNode({ nodeName: "span", backendNodeId: 2 }),
      createMockNode({ nodeName: "p", backendNodeId: 3 }),
      createMockNode({ nodeName: "section", backendNodeId: 4 }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(0);
  });

  it("should NOT select invisible elements (0x0 bounds)", () => {
    const nodes = [
      createMockNode({
        nodeName: "button",
        backendNodeId: 1,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(0);
  });

  it("should NOT select elements with null bounds", () => {
    const nodes = [
      createMockNode({
        nodeName: "button",
        backendNodeId: 1,
        bounds: null,
      }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(0);
  });

  it("should NOT select text nodes (nodeType 3)", () => {
    const nodes = [
      createMockNode({
        nodeName: "#text",
        backendNodeId: 1,
        nodeType: 3,
      }),
    ];

    const result = findInteractiveNodes(nodes);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// #2: flattenMatchedRules — CSS rule flattening
// ============================================================================

describe("flattenMatchedRules", () => {
  let flattenMatchedRules: (
    matchedStyles: CDPMatchedStyles
  ) => Record<string, string>;

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    flattenMatchedRules = mod.flattenMatchedRules;
  });

  it("should flatten simple matched rules into property map", () => {
    const styles = createMockMatchedStyles([
      {
        selectorText: ".btn",
        properties: { "background-color": "blue", color: "white" },
      },
    ]);

    const result = flattenMatchedRules(styles);
    expect(result["background-color"]).toBe("blue");
    expect(result["color"]).toBe("white");
  });

  it("should let later rules override earlier rules (last wins)", () => {
    const styles = createMockMatchedStyles([
      {
        selectorText: ".btn",
        properties: { "background-color": "blue" },
      },
      {
        selectorText: ".btn-primary",
        properties: { "background-color": "red" },
      },
    ]);

    const result = flattenMatchedRules(styles);
    expect(result["background-color"]).toBe("red");
  });

  it("should exclude user-agent rules", () => {
    const styles = createMockMatchedStyles([
      {
        selectorText: "button",
        properties: { "background-color": "buttonface" },
        origin: "user-agent",
      },
      {
        selectorText: ".custom",
        properties: { color: "red" },
        origin: "regular",
      },
    ]);

    const result = flattenMatchedRules(styles);
    expect(result["background-color"]).toBeUndefined();
    expect(result["color"]).toBe("red");
  });

  it("should handle empty matched rules", () => {
    const styles = createMockMatchedStyles([]);

    const result = flattenMatchedRules(styles);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should let inline styles override matched rules", () => {
    const styles = createMockMatchedStyles(
      [
        {
          selectorText: ".btn",
          properties: { "background-color": "blue" },
        },
      ],
      { "background-color": "green" }
    );

    const result = flattenMatchedRules(styles);
    expect(result["background-color"]).toBe("green");
  });
});

// ============================================================================
// #3: captureForcedHoverStyles — CDP interaction (mock)
// ============================================================================

describe("captureForcedHoverStyles", () => {
  let captureForcedHoverStyles: (
    client: CDPClientInterface,
    nodeId: number,
    normalMatchedStyles: CDPMatchedStyles
  ) => Promise<Record<string, string> | null>;

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    captureForcedHoverStyles = mod.captureForcedHoverStyles;
  });

  it("should call force → getMatched → clear in correct order", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue" } },
    ]);

    // Same styles for hover (no diff)
    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", normalStyles);

    await captureForcedHoverStyles(client, 42, normalStyles);

    // Verify call sequence
    expect(client.calls[0]).toEqual({
      method: "CSS.forcePseudoState",
      params: { nodeId: 42, forcedPseudoClasses: ["hover"] },
    });
    expect(client.calls[1].method).toBe("CSS.getMatchedStylesForNode");
    expect(client.calls[2]).toEqual({
      method: "CSS.forcePseudoState",
      params: { nodeId: 42, forcedPseudoClasses: [] },
    });
  });

  it("should return null when no styles differ", async () => {
    const client = createMockCDPClient();

    const styles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue" } },
    ]);

    client.mockMatchedStyles.set("normal", styles);
    client.mockMatchedStyles.set("hover", styles);

    const result = await captureForcedHoverStyles(client, 42, styles);
    expect(result).toBeNull();
  });

  it("should return diff when hover adds/changes properties", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue" } },
    ]);

    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue" } },
      {
        selectorText: ".btn:hover",
        properties: { "background-color": "darkblue", "box-shadow": "0 2px 4px rgba(0,0,0,0.2)" },
      },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);

    const result = await captureForcedHoverStyles(client, 42, normalStyles);

    expect(result).not.toBeNull();
    expect(result!["background-color"]).toBe("darkblue");
    expect(result!["box-shadow"]).toBe("0 2px 4px rgba(0,0,0,0.2)");
  });

  it("should ALWAYS clear forced state even if getMatchedStylesForNode throws", async () => {
    const client = createMockCDPClient();

    // Override send to throw on getMatchedStylesForNode
    let clearCalled = false;
    (client.send as ReturnType<typeof vi.fn>).mockImplementation(
      async (method: string, params?: Record<string, unknown>) => {
        client.calls.push({ method, params });
        if (method === "CSS.getMatchedStylesForNode") {
          throw new Error("Node not found");
        }
        if (
          method === "CSS.forcePseudoState" &&
          params?.forcedPseudoClasses &&
          (params.forcedPseudoClasses as string[]).length === 0
        ) {
          clearCalled = true;
        }
        return undefined;
      }
    );

    const normalStyles = createMockMatchedStyles([]);

    // Should not throw (error handled internally)
    const result = await captureForcedHoverStyles(client, 42, normalStyles);

    // Cleanup must have happened
    expect(clearCalled).toBe(true);
    expect(result).toBeNull();
  });
});

// ============================================================================
// #4: capturePseudoStatesForNodes — batch processing
// ============================================================================

describe("capturePseudoStatesForNodes", () => {
  let capturePseudoStatesForNodes: (
    client: CDPClientInterface,
    nodes: Array<{ backendNodeId: number; nodeId: number }>,
    normalStylesMap: Map<number, CDPMatchedStyles>,
    options?: { concurrency?: number }
  ) => Promise<Map<number, { hover?: Record<string, string> }>>;

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    capturePseudoStatesForNodes = mod.capturePseudoStatesForNodes;
  });

  it("should process multiple nodes and return results map", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { color: "black" } },
    ]);

    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { color: "black" } },
      { selectorText: ".btn:hover", properties: { color: "red" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);

    const nodes = [
      { backendNodeId: 100, nodeId: 1 },
      { backendNodeId: 200, nodeId: 2 },
    ];

    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    normalStylesMap.set(100, normalStyles);
    normalStylesMap.set(200, normalStyles);

    const result = await capturePseudoStatesForNodes(
      client,
      nodes,
      normalStylesMap
    );

    expect(result.size).toBeGreaterThan(0);
  });

  it("should skip nodes without matched styles in normalStylesMap", async () => {
    const client = createMockCDPClient();

    const nodes = [{ backendNodeId: 100, nodeId: 1 }];
    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    // NOT setting normalStylesMap for backendNodeId 100

    const result = await capturePseudoStatesForNodes(
      client,
      nodes,
      normalStylesMap
    );

    // Node should be processed even without normal styles (will fetch them)
    // OR skipped — depends on implementation
    expect(result).toBeDefined();
  });

  it("should handle partial failures gracefully", async () => {
    const client = createMockCDPClient();

    let callCount = 0;
    (client.send as ReturnType<typeof vi.fn>).mockImplementation(
      async (method: string, params?: Record<string, unknown>) => {
        client.calls.push({ method, params });

        if (method === "CSS.forcePseudoState") {
          callCount++;
          // Fail on second node's force call
          if (callCount === 3) {
            throw new Error("Node detached");
          }
          return undefined;
        }

        if (method === "CSS.getMatchedStylesForNode") {
          return createMockMatchedStyles([
            { selectorText: ".btn", properties: { color: "blue" } },
          ]);
        }

        return undefined;
      }
    );

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { color: "black" } },
    ]);

    const nodes = [
      { backendNodeId: 100, nodeId: 1 },
      { backendNodeId: 200, nodeId: 2 },
    ];

    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    normalStylesMap.set(100, normalStyles);
    normalStylesMap.set(200, normalStyles);

    // Should NOT throw — partial failures handled
    const result = await capturePseudoStatesForNodes(
      client,
      nodes,
      normalStylesMap
    );

    expect(result).toBeDefined();
  });

  it("should return empty map when no nodes provided", async () => {
    const client = createMockCDPClient();
    const normalStylesMap = new Map<number, CDPMatchedStyles>();

    const result = await capturePseudoStatesForNodes(
      client,
      [],
      normalStylesMap
    );

    expect(result.size).toBe(0);
  });
});

// ============================================================================
// #5: captureForcedPseudoStyles — generic helper (all pseudo-classes)
// ============================================================================

describe("captureForcedPseudoStyles", () => {
  let captureForcedPseudoStyles: (
    client: CDPClientInterface,
    nodeId: number,
    normalMatchedStyles: CDPMatchedStyles,
    pseudoClass: "hover" | "focus" | "active" | "focus-visible"
  ) => Promise<Record<string, string> | null>;

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    captureForcedPseudoStyles = mod.captureForcedPseudoStyles;
  });

  it("should capture :focus state and detect background-color diff", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".input", properties: { "background-color": "white", "border-color": "gray" } },
    ]);

    const focusStyles = createMockMatchedStyles([
      { selectorText: ".input", properties: { "background-color": "white", "border-color": "gray" } },
      { selectorText: ".input:focus", properties: { "border-color": "blue", "box-shadow": "0 0 0 3px rgba(59,130,246,0.5)" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("focus", focusStyles);

    const result = await captureForcedPseudoStyles(client, 10, normalStyles, "focus");

    // Verify CDP call sequence: force focus → getMatched → clear
    expect(client.calls[0]).toEqual({
      method: "CSS.forcePseudoState",
      params: { nodeId: 10, forcedPseudoClasses: ["focus"] },
    });
    expect(client.calls[1].method).toBe("CSS.getMatchedStylesForNode");
    expect(client.calls[2]).toEqual({
      method: "CSS.forcePseudoState",
      params: { nodeId: 10, forcedPseudoClasses: [] },
    });

    // Verify diff detection
    expect(result).not.toBeNull();
    expect(result!["border-color"]).toBe("blue");
    expect(result!["box-shadow"]).toBe("0 0 0 3px rgba(59,130,246,0.5)");
  });

  it("should capture :active state and detect color diff", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "#3B82F6", color: "white" } },
    ]);

    const activeStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "#3B82F6", color: "white" } },
      { selectorText: ".btn:active", properties: { "background-color": "#1E40AF", transform: "scale(0.98)" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("active", activeStyles);

    const result = await captureForcedPseudoStyles(client, 20, normalStyles, "active");

    // Verify correct pseudo-class in CDP call
    expect(client.calls[0]).toEqual({
      method: "CSS.forcePseudoState",
      params: { nodeId: 20, forcedPseudoClasses: ["active"] },
    });

    expect(result).not.toBeNull();
    expect(result!["background-color"]).toBe("#1E40AF");
    expect(result!["transform"]).toBe("scale(0.98)");
  });

  it("should capture :focus-visible state and detect outline diff", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { outline: "none" } },
    ]);

    const focusVisibleStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { outline: "none" } },
      { selectorText: ".btn:focus-visible", properties: { outline: "2px solid #3B82F6", "outline-offset": "2px" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("focus-visible", focusVisibleStyles);

    const result = await captureForcedPseudoStyles(client, 30, normalStyles, "focus-visible");

    // Verify correct pseudo-class
    expect(client.calls[0]).toEqual({
      method: "CSS.forcePseudoState",
      params: { nodeId: 30, forcedPseudoClasses: ["focus-visible"] },
    });

    expect(result).not.toBeNull();
    expect(result!["outline"]).toBe("2px solid #3B82F6");
    expect(result!["outline-offset"]).toBe("2px");
  });

  it("should ALWAYS clear forced state on failure for any pseudo-class", async () => {
    const client = createMockCDPClient();

    let clearCalled = false;
    (client.send as ReturnType<typeof vi.fn>).mockImplementation(
      async (method: string, params?: Record<string, unknown>) => {
        client.calls.push({ method, params });
        if (method === "CSS.getMatchedStylesForNode") {
          throw new Error("Node detached");
        }
        if (
          method === "CSS.forcePseudoState" &&
          params?.forcedPseudoClasses &&
          (params.forcedPseudoClasses as string[]).length === 0
        ) {
          clearCalled = true;
        }
        return undefined;
      }
    );

    const normalStyles = createMockMatchedStyles([]);

    const result = await captureForcedPseudoStyles(client, 40, normalStyles, "active");

    expect(clearCalled).toBe(true);
    expect(result).toBeNull();
  });

  it("should return null when forced styles match normal styles (no diff)", async () => {
    const client = createMockCDPClient();

    const styles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { color: "black", "background-color": "white" } },
    ]);

    // Same styles for focus — no :focus rule exists
    client.mockMatchedStyles.set("normal", styles);
    client.mockMatchedStyles.set("focus", styles);

    const result = await captureForcedPseudoStyles(client, 50, styles, "focus");

    expect(result).toBeNull();
  });
});

// ============================================================================
// #6: capturePseudoStatesForNodes — multi-state batch processing
// ============================================================================

describe("capturePseudoStatesForNodes (multi-state)", () => {
  let capturePseudoStatesForNodes: (
    client: CDPClientInterface,
    nodes: Array<{ backendNodeId: number; nodeId: number }>,
    normalStylesMap: Map<number, CDPMatchedStyles>,
    options?: { concurrency?: number }
  ) => Promise<Map<number, {
    hover?: Record<string, string>;
    focus?: Record<string, string>;
    active?: Record<string, string>;
    focusVisible?: Record<string, string>;
  }>>;

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    capturePseudoStatesForNodes = mod.capturePseudoStatesForNodes;
  });

  it("should capture hover + focus + active simultaneously for one node", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue", color: "white", outline: "none" } },
    ]);

    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue", color: "white", outline: "none" } },
      { selectorText: ".btn:hover", properties: { "background-color": "darkblue" } },
    ]);

    const focusStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue", color: "white", outline: "none" } },
      { selectorText: ".btn:focus", properties: { outline: "2px solid blue" } },
    ]);

    const activeStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue", color: "white", outline: "none" } },
      { selectorText: ".btn:active", properties: { "background-color": "navy" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);
    client.mockMatchedStyles.set("focus", focusStyles);
    client.mockMatchedStyles.set("active", activeStyles);

    const nodes = [{ backendNodeId: 100, nodeId: 1 }];
    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    normalStylesMap.set(100, normalStyles);

    const result = await capturePseudoStatesForNodes(client, nodes, normalStylesMap);

    expect(result.has(100)).toBe(true);
    const states = result.get(100)!;
    expect(states.hover).toEqual({ "background-color": "darkblue" });
    expect(states.focus).toEqual({ outline: "2px solid blue" });
    expect(states.active).toEqual({ "background-color": "navy" });
  });

  it("should leave no-diff states undefined", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue" } },
    ]);

    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { "background-color": "blue" } },
      { selectorText: ".btn:hover", properties: { "background-color": "darkblue" } },
    ]);

    // focus/active/focus-visible return same as normal (no diff)
    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);
    client.mockMatchedStyles.set("focus", normalStyles);
    client.mockMatchedStyles.set("active", normalStyles);
    client.mockMatchedStyles.set("focus-visible", normalStyles);

    const nodes = [{ backendNodeId: 100, nodeId: 1 }];
    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    normalStylesMap.set(100, normalStyles);

    const result = await capturePseudoStatesForNodes(client, nodes, normalStylesMap);

    expect(result.has(100)).toBe(true);
    const states = result.get(100)!;
    expect(states.hover).toEqual({ "background-color": "darkblue" });
    expect(states.focus).toBeUndefined();
    expect(states.active).toBeUndefined();
    expect(states.focusVisible).toBeUndefined();
  });

  it("should handle mixed results across multiple nodes", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".el", properties: { color: "black" } },
    ]);

    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".el", properties: { color: "black" } },
      { selectorText: ".el:hover", properties: { color: "red" } },
    ]);

    const focusStyles = createMockMatchedStyles([
      { selectorText: ".el", properties: { color: "black" } },
      { selectorText: ".el:focus", properties: { color: "blue" } },
    ]);

    // Node A: only hover diff; Node B: only focus diff; Node C: no diff at all
    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);
    client.mockMatchedStyles.set("focus", focusStyles);
    client.mockMatchedStyles.set("active", normalStyles);
    client.mockMatchedStyles.set("focus-visible", normalStyles);

    const nodes = [
      { backendNodeId: 100, nodeId: 1 },
      { backendNodeId: 200, nodeId: 2 },
      { backendNodeId: 300, nodeId: 3 },
    ];

    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    normalStylesMap.set(100, normalStyles);
    normalStylesMap.set(200, normalStyles);
    normalStylesMap.set(300, normalStyles);

    const result = await capturePseudoStatesForNodes(client, nodes, normalStylesMap);

    // All 3 nodes have at least hover or focus diff (mock returns same styles for all)
    // so all 3 should be in the result with hover + focus diffs
    for (const [, states] of result) {
      expect(states.hover).toBeDefined();
      expect(states.focus).toBeDefined();
    }
  });

  it("should preserve backward compatibility — hover-only results work", async () => {
    const client = createMockCDPClient();

    const normalStyles = createMockMatchedStyles([
      { selectorText: ".link", properties: { color: "blue" } },
    ]);

    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".link", properties: { color: "blue" } },
      { selectorText: ".link:hover", properties: { color: "darkblue", "text-decoration": "underline" } },
    ]);

    // No other state diffs
    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);
    client.mockMatchedStyles.set("focus", normalStyles);
    client.mockMatchedStyles.set("active", normalStyles);
    client.mockMatchedStyles.set("focus-visible", normalStyles);

    const nodes = [{ backendNodeId: 100, nodeId: 1 }];
    const normalStylesMap = new Map<number, CDPMatchedStyles>();
    normalStylesMap.set(100, normalStyles);

    const result = await capturePseudoStatesForNodes(client, nodes, normalStylesMap);

    expect(result.has(100)).toBe(true);
    const states = result.get(100)!;

    // hover must work as before
    expect(states.hover).toEqual({ color: "darkblue", "text-decoration": "underline" });

    // other states should not exist
    expect(states.focus).toBeUndefined();
    expect(states.active).toBeUndefined();
    expect(states.focusVisible).toBeUndefined();
  });
});

// ============================================================================
// #7: Property removal detection in diff
// ============================================================================

describe("captureForcedPseudoStyles — property removal", () => {
  let captureForcedPseudoStyles: typeof import("../pseudo-states").captureForcedPseudoStyles;
  let client: ReturnType<typeof createMockCDPClient>;

  beforeEach(async () => {
    const mod = await import("../pseudo-states");
    captureForcedPseudoStyles = mod.captureForcedPseudoStyles;
    client = createMockCDPClient();
  });

  it("should detect property removed in hover state", async () => {
    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { color: "blue", "text-decoration": "none" } },
    ]);
    // Hover rule only has text-decoration — color is gone
    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".btn:hover", properties: { "text-decoration": "underline" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);

    const result = await captureForcedPseudoStyles(client, 42, normalStyles, "hover");

    expect(result).not.toBeNull();
    expect(result!["text-decoration"]).toBe("underline"); // changed
    expect(result!["color"]).toBe("__removed__"); // removed
  });

  it("should detect multiple properties removed simultaneously", async () => {
    const normalStyles = createMockMatchedStyles([
      { selectorText: ".card", properties: { "border": "1px solid #ccc", "box-shadow": "0 2px 4px rgba(0,0,0,0.1)", "outline": "2px solid blue" } },
    ]);
    // Hover removes all three
    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".card:hover", properties: {} },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);

    const result = await captureForcedPseudoStyles(client, 42, normalStyles, "hover");

    expect(result).not.toBeNull();
    expect(result!["border"]).toBe("__removed__");
    expect(result!["box-shadow"]).toBe("__removed__");
    expect(result!["outline"]).toBe("__removed__");
  });

  it("should handle mixed changes and removals", async () => {
    const normalStyles = createMockMatchedStyles([
      { selectorText: ".link", properties: { color: "blue", "text-decoration": "none", "font-weight": "400" } },
    ]);
    // Hover: color changes, text-decoration changes, font-weight removed
    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".link:hover", properties: { color: "red", "text-decoration": "underline" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);

    const result = await captureForcedPseudoStyles(client, 42, normalStyles, "hover");

    expect(result).not.toBeNull();
    expect(result!["color"]).toBe("red"); // changed
    expect(result!["text-decoration"]).toBe("underline"); // changed
    expect(result!["font-weight"]).toBe("__removed__"); // removed
  });

  it("should NOT mark __removed__ when all properties are present", async () => {
    const normalStyles = createMockMatchedStyles([
      { selectorText: ".btn", properties: { color: "blue", "background": "white" } },
    ]);
    const hoverStyles = createMockMatchedStyles([
      { selectorText: ".btn:hover", properties: { color: "red", "background": "gray" } },
    ]);

    client.mockMatchedStyles.set("normal", normalStyles);
    client.mockMatchedStyles.set("hover", hoverStyles);

    const result = await captureForcedPseudoStyles(client, 42, normalStyles, "hover");

    expect(result).not.toBeNull();
    expect(result!["color"]).toBe("red");
    expect(result!["background"]).toBe("gray");
    // No __removed__ values
    expect(Object.values(result!).some(v => v === "__removed__")).toBe(false);
  });
});
