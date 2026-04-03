/**
 * Pre-Capture Style Injection Tests
 *
 * Verifies that captureSnapshot injects styles before capture
 * (pause animations, hide scrollbars, disable transitions)
 * and removes them after.
 */

import { describe, it, expect, vi } from "vitest";
import { captureSnapshot } from "../snapshot";

function createMockClient() {
  const calls: { method: string; params?: unknown }[] = [];

  return {
    client: {
      send: vi.fn(async (method: string, params?: unknown) => {
        calls.push({ method, params });

        if (method === "DOMSnapshot.captureSnapshot") {
          return {
            documents: [
              {
                documentURL: { index: 0 },
                title: { index: 1 },
                baseURL: { index: 0 },
                nodes: {
                  parentIndex: [],
                  nodeType: [],
                  shadowRootType: { index: [] },
                  nodeName: [],
                  nodeValue: [],
                  backendNodeId: [],
                  attributes: [],
                  textValue: { index: [], value: [] },
                  inputValue: { index: [], value: [] },
                  currentSourceURL: { index: [], value: [] },
                  pseudoType: { index: [], value: [] },
                  isClickable: { index: [] },
                  contentDocumentIndex: { index: [], value: [] },
                },
                layout: {
                  nodeIndex: [],
                  bounds: [],
                  text: [],
                  styles: { properties: [], entries: [] },
                  paintOrders: [],
                  offsetRects: [],
                  clientRects: [],
                  blendedBackgroundColors: [],
                  textColorOpacities: [],
                },
                textBoxes: { layoutIndex: [], bounds: [] },
              },
            ],
            strings: ["https://example.com", "Example"],
          };
        }

        return {};
      }),
      enableDomain: vi.fn(),
      enableDomains: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      detach: vi.fn(),
    },
    calls,
  };
}

describe("captureSnapshot — pre-capture style injection", () => {
  it("should inject styles before snapshot and remove after", async () => {
    const { client, calls } = createMockClient();

    await captureSnapshot(client as any);

    // Should have 3 calls: inject → snapshot → remove
    expect(calls.length).toBe(3);

    // First call: Runtime.evaluate to inject styles
    expect(calls[0].method).toBe("Runtime.evaluate");
    const injectExpr = (calls[0].params as any).expression as string;
    expect(injectExpr).toContain("__w2w_pre_capture__");
    expect(injectExpr).toContain("animation-play-state");
    expect(injectExpr).toContain("paused");
    expect(injectExpr).toContain("transition-duration");
    expect(injectExpr).toContain("scrollbar");
    expect(injectExpr).toContain("caret-color");

    // Second call: DOMSnapshot.captureSnapshot
    expect(calls[1].method).toBe("DOMSnapshot.captureSnapshot");

    // Third call: Runtime.evaluate to remove styles
    expect(calls[2].method).toBe("Runtime.evaluate");
    const removeExpr = (calls[2].params as any).expression as string;
    expect(removeExpr).toContain("__w2w_pre_capture__");
    expect(removeExpr).toContain("remove");
  });

  it("should still return snapshot result", async () => {
    const { client } = createMockClient();

    const result = await captureSnapshot(client as any);

    expect(result).toBeDefined();
    expect(result.documents).toBeDefined();
    expect(result.documents.length).toBe(1);
  });
});
