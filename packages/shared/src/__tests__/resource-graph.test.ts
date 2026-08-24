/**
 * Resource Graph Tests
 *
 * Tests the unified resource graph that replaces duplicate Page.getResourceTree calls
 * in fonts.ts and assets.ts with a single enumeration.
 */

import { describe, it, expect, vi } from "vitest";
import {
  classifyResource,
  buildResourceGraph,
  getResourceText,
  getResourceBase64,
  type ResourceEntry,
} from "../resource-graph";
import type { CDPClientInterface } from "../types";

// ============================================================================
// Mock CDP client
// ============================================================================

function makeMockClient(
  sendImpl?: (method: string, params?: Record<string, unknown>) => Promise<unknown>
): CDPClientInterface {
  return {
    send: vi.fn(sendImpl || (async () => ({}))) as CDPClientInterface["send"],
    enableDomains: vi.fn(async () => {}),
  };
}

// ============================================================================
// classifyResource
// ============================================================================

describe("classifyResource", () => {
  it('classifies text/css as "stylesheet"', () => {
    expect(classifyResource("text/css", "style.css")).toBe("stylesheet");
  });

  it('classifies image/svg+xml as "svg"', () => {
    expect(classifyResource("image/svg+xml", "icon.svg")).toBe("svg");
  });

  it('classifies image/png as "image"', () => {
    expect(classifyResource("image/png", "photo.png")).toBe("image");
  });

  it('classifies image/jpeg as "image"', () => {
    expect(classifyResource("image/jpeg", "photo.jpg")).toBe("image");
  });

  it('classifies image/webp as "image"', () => {
    expect(classifyResource("image/webp", "photo.webp")).toBe("image");
  });

  it('classifies font/woff2 as "font"', () => {
    expect(classifyResource("font/woff2", "font.woff2")).toBe("font");
  });

  it('classifies font/woff as "font"', () => {
    expect(classifyResource("font/woff", "font.woff")).toBe("font");
  });

  it('classifies application/font-woff as "font"', () => {
    expect(classifyResource("application/font-woff", "font.woff")).toBe("font");
  });

  it('classifies application/x-font-woff as "font"', () => {
    expect(classifyResource("application/x-font-woff", "font.woff")).toBe("font");
  });

  it('classifies application/javascript as "script"', () => {
    expect(classifyResource("application/javascript", "app.js")).toBe("script");
  });

  it('classifies text/javascript as "script"', () => {
    expect(classifyResource("text/javascript", "app.js")).toBe("script");
  });

  it('classifies unknown MIME with .css extension as "stylesheet"', () => {
    expect(classifyResource("application/octet-stream", "styles.css")).toBe("stylesheet");
  });

  it('classifies unknown MIME with .woff2 extension as "font"', () => {
    expect(classifyResource("application/octet-stream", "font.woff2")).toBe("font");
  });

  it('classifies unknown MIME with .svg extension as "svg"', () => {
    expect(classifyResource("application/octet-stream", "icon.svg")).toBe("svg");
  });

  it('classifies truly unknown as "other"', () => {
    expect(classifyResource("application/octet-stream", "data.bin")).toBe("other");
  });
});

// ============================================================================
// buildResourceGraph
// ============================================================================

describe("buildResourceGraph", () => {
  it("calls Page.getResourceTree exactly once", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main-frame", url: "https://example.com" },
            resources: [],
          },
        };
      }
      return {};
    });

    await buildResourceGraph(client);

    const calls = (client.send as ReturnType<typeof vi.fn>).mock.calls;
    const resourceTreeCalls = calls.filter(
      (c: unknown[]) => c[0] === "Page.getResourceTree"
    );
    expect(resourceTreeCalls).toHaveLength(1);
  });

  it("flattens child frames recursively", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://example.com/style.css", type: "Stylesheet", mimeType: "text/css" },
            ],
            childFrames: [
              {
                frameResourceTree: {
                  frame: { id: "iframe-1", url: "https://example.com/iframe" },
                  resources: [
                    { url: "https://example.com/iframe-style.css", type: "Stylesheet", mimeType: "text/css" },
                    { url: "https://example.com/iframe-img.png", type: "Image", mimeType: "image/png" },
                  ],
                  childFrames: [
                    {
                      frameResourceTree: {
                        frame: { id: "nested-iframe", url: "https://example.com/nested" },
                        resources: [
                          { url: "https://example.com/nested-font.woff2", type: "Font", mimeType: "font/woff2" },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);

    expect(graph.entries.size).toBe(4);
    expect(graph.stylesheets).toHaveLength(2);
    expect(graph.images).toHaveLength(1);
    expect(graph.fonts).toHaveLength(1);
    expect(graph.frameId).toBe("main");
  });

  it("categorizes resources into stylesheets, images, fonts, svgs", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://example.com/style.css", type: "Stylesheet", mimeType: "text/css" },
              { url: "https://example.com/photo.jpg", type: "Image", mimeType: "image/jpeg" },
              { url: "https://example.com/icon.svg", type: "Image", mimeType: "image/svg+xml" },
              { url: "https://example.com/font.woff2", type: "Font", mimeType: "font/woff2" },
              { url: "https://example.com/bg.png", type: "Image", mimeType: "image/png" },
              { url: "https://example.com/app.js", type: "Script", mimeType: "application/javascript" },
            ],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);

    expect(graph.stylesheets).toHaveLength(1);
    expect(graph.stylesheets[0].url).toBe("https://example.com/style.css");

    expect(graph.images).toHaveLength(2); // jpg + png (SVG is separate)
    expect(graph.images.map((e) => e.url)).toContain("https://example.com/photo.jpg");
    expect(graph.images.map((e) => e.url)).toContain("https://example.com/bg.png");

    expect(graph.svgs).toHaveLength(1);
    expect(graph.svgs[0].url).toBe("https://example.com/icon.svg");

    expect(graph.fonts).toHaveLength(1);
    expect(graph.fonts[0].url).toBe("https://example.com/font.woff2");
  });

  it("deduplicates resources by URL", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://example.com/style.css", type: "Stylesheet", mimeType: "text/css" },
            ],
            childFrames: [
              {
                frameResourceTree: {
                  frame: { id: "iframe-1", url: "https://example.com/iframe" },
                  resources: [
                    // Same URL as parent frame
                    { url: "https://example.com/style.css", type: "Stylesheet", mimeType: "text/css" },
                  ],
                },
              },
            ],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);
    expect(graph.entries.size).toBe(1);
    expect(graph.stylesheets).toHaveLength(1);
  });

  it("returns empty graph on Page.getResourceTree failure", async () => {
    const client = makeMockClient(async () => {
      throw new Error("CDP error");
    });

    const graph = await buildResourceGraph(client);
    expect(graph.entries.size).toBe(0);
    expect(graph.stylesheets).toHaveLength(0);
    expect(graph.images).toHaveLength(0);
    expect(graph.fonts).toHaveLength(0);
    expect(graph.svgs).toHaveLength(0);
  });

  it("flattens triple-nested iframes (3 levels) with correct frameIds", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://example.com/main.css", type: "Stylesheet", mimeType: "text/css" },
            ],
            childFrames: [
              {
                frameResourceTree: {
                  frame: { id: "L1", url: "https://example.com/l1" },
                  resources: [
                    { url: "https://example.com/l1.css", type: "Stylesheet", mimeType: "text/css" },
                  ],
                  childFrames: [
                    {
                      frameResourceTree: {
                        frame: { id: "L2", url: "https://example.com/l2" },
                        resources: [
                          { url: "https://example.com/l2.woff2", type: "Font", mimeType: "font/woff2" },
                        ],
                        childFrames: [
                          {
                            frameResourceTree: {
                              frame: { id: "L3", url: "https://example.com/l3" },
                              resources: [
                                { url: "https://example.com/l3.png", type: "Image", mimeType: "image/png" },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);

    expect(graph.entries.size).toBe(4);
    expect(graph.entries.get("https://example.com/main.css")!.frameId).toBe("main");
    expect(graph.entries.get("https://example.com/l1.css")!.frameId).toBe("L1");
    expect(graph.entries.get("https://example.com/l2.woff2")!.frameId).toBe("L2");
    expect(graph.entries.get("https://example.com/l3.png")!.frameId).toBe("L3");
  });

  it("cross-frame same-URL dedupe preserves first-seen frameId", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://cdn.example.com/shared.css", type: "Stylesheet", mimeType: "text/css" },
            ],
            childFrames: [
              {
                frameResourceTree: {
                  frame: { id: "iframe-1", url: "https://example.com/iframe" },
                  resources: [
                    { url: "https://cdn.example.com/shared.css", type: "Stylesheet", mimeType: "text/css" },
                  ],
                },
              },
            ],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);
    expect(graph.entries.size).toBe(1);
    expect(graph.entries.get("https://cdn.example.com/shared.css")!.frameId).toBe("main");
  });

  it("handles application/octet-stream with .css/.woff2/.svg extensions via URL fallback", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://example.com/style.css", type: "Other", mimeType: "application/octet-stream" },
              { url: "https://example.com/font.woff2", type: "Other", mimeType: "application/octet-stream" },
              { url: "https://example.com/icon.svg", type: "Other", mimeType: "application/octet-stream" },
            ],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);
    expect(graph.stylesheets).toHaveLength(1);
    expect(graph.fonts).toHaveLength(1);
    expect(graph.svgs).toHaveLength(1);
  });

  it("handles URL with query params + fragments in classifyResource", () => {
    expect(classifyResource("application/octet-stream", "font.woff2?v=4.7.0#iefix")).toBe("font");
    expect(classifyResource("application/octet-stream", "style.css?cache=123")).toBe("stylesheet");
  });

  it("handles empty childFrames array (not undefined)", async () => {
    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources: [
              { url: "https://example.com/img.png", type: "Image", mimeType: "image/png" },
            ],
            childFrames: [],
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);
    expect(graph.entries.size).toBe(1);
    expect(graph.images).toHaveLength(1);
  });

  it("handles large resource set (500+ entries) with dedup", async () => {
    const resources: Array<{ url: string; type: string; mimeType: string }> = [];
    for (let i = 0; i < 300; i++) {
      resources.push({ url: `https://example.com/img-${i}.png`, type: "Image", mimeType: "image/png" });
    }
    for (let i = 0; i < 200; i++) {
      resources.push({ url: `https://example.com/font-${i}.woff2`, type: "Font", mimeType: "font/woff2" });
    }
    // Add 50 duplicates of first images
    for (let i = 0; i < 50; i++) {
      resources.push({ url: `https://example.com/img-${i}.png`, type: "Image", mimeType: "image/png" });
    }

    const client = makeMockClient(async (method) => {
      if (method === "Page.getResourceTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
            resources,
          },
        };
      }
      return {};
    });

    const graph = await buildResourceGraph(client);
    expect(graph.entries.size).toBe(500); // 300 img + 200 fonts, dupes ignored
    expect(graph.images).toHaveLength(300);
    expect(graph.fonts).toHaveLength(200);
  });
});

// ============================================================================
// getResourceText
// ============================================================================

describe("getResourceText", () => {
  const entry: ResourceEntry = {
    url: "https://example.com/style.css",
    frameId: "main",
    mimeType: "text/css",
    type: "stylesheet",
  };

  it("returns text content for non-base64 response", async () => {
    const client = makeMockClient(async () => ({
      content: "body { color: red; }",
      base64Encoded: false,
    }));

    const text = await getResourceText(client, entry);
    expect(text).toBe("body { color: red; }");
  });

  it("decodes base64 content to text", async () => {
    const original = "body { color: blue; }";
    const b64 = Buffer.from(original).toString("base64");
    const client = makeMockClient(async () => ({
      content: b64,
      base64Encoded: true,
    }));

    const text = await getResourceText(client, entry);
    expect(text).toBe(original);
  });

  it("returns null on error", async () => {
    const client = makeMockClient(async () => {
      throw new Error("Not found");
    });

    const text = await getResourceText(client, entry);
    expect(text).toBeNull();
  });

  it("decodes UTF-8 multi-byte base64 content correctly", async () => {
    const original = "/* コメント: 日本語フォント */\n@font-face { font-family: 'Noto Sans JP'; }";
    const b64 = Buffer.from(original, "utf-8").toString("base64");
    const client = makeMockClient(async () => ({
      content: b64,
      base64Encoded: true,
    }));

    const text = await getResourceText(client, entry);
    expect(text).toBe(original);
  });

  it("passes correct frameId from entry to Page.getResourceContent", async () => {
    const iframeEntry: ResourceEntry = {
      url: "https://example.com/iframe-style.css",
      frameId: "iframe-42",
      mimeType: "text/css",
      type: "stylesheet",
    };

    const client = makeMockClient(async () => ({
      content: "body {}",
      base64Encoded: false,
    }));

    await getResourceText(client, iframeEntry);

    const calls = (client.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("Page.getResourceContent");
    expect(calls[0][1]).toEqual({ frameId: "iframe-42", url: "https://example.com/iframe-style.css" });
  });

  it("returns raw CSS with relative url() preserved", async () => {
    const cssContent = `@font-face { src: url(../fonts/custom.woff2); }`;
    const client = makeMockClient(async () => ({
      content: cssContent,
      base64Encoded: false,
    }));

    const text = await getResourceText(client, entry);
    expect(text).toBe(cssContent);
    expect(text).toContain("url(../fonts/custom.woff2)");
  });
});

// ============================================================================
// getResourceBase64
// ============================================================================

describe("getResourceBase64", () => {
  const entry: ResourceEntry = {
    url: "https://example.com/image.png",
    frameId: "main",
    mimeType: "image/png",
    type: "image",
  };

  it("returns base64 directly for base64-encoded response", async () => {
    const client = makeMockClient(async () => ({
      content: "iVBORw0KGgoAAAANSUhEUg==",
      base64Encoded: true,
    }));

    const b64 = await getResourceBase64(client, entry);
    expect(b64).toBe("iVBORw0KGgoAAAANSUhEUg==");
  });

  it("encodes text content to base64", async () => {
    const svgEntry: ResourceEntry = {
      url: "https://example.com/icon.svg",
      frameId: "main",
      mimeType: "image/svg+xml",
      type: "svg",
    };
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
    const client = makeMockClient(async () => ({
      content: svgContent,
      base64Encoded: false,
    }));

    const b64 = await getResourceBase64(client, svgEntry);
    expect(b64).toBeTruthy();
    // Verify roundtrip
    const decoded = Buffer.from(b64!, "base64").toString("utf-8");
    expect(decoded).toBe(svgContent);
  });

  it("returns null on error", async () => {
    const client = makeMockClient(async () => {
      throw new Error("Not found");
    });

    const b64 = await getResourceBase64(client, entry);
    expect(b64).toBeNull();
  });

  it("handles partial failure — returns null for bad entry, data for good", async () => {
    const goodEntry: ResourceEntry = {
      url: "https://example.com/good.png",
      frameId: "main",
      mimeType: "image/png",
      type: "image",
    };
    const badEntry: ResourceEntry = {
      url: "https://example.com/gone.png",
      frameId: "main",
      mimeType: "image/png",
      type: "image",
    };

    const client = makeMockClient(async (_method, params) => {
      const p = params as Record<string, unknown>;
      if (p?.url === "https://example.com/gone.png") {
        throw new Error("Resource not found");
      }
      return { content: "iVBORw0KGgo=", base64Encoded: true };
    });

    const good = await getResourceBase64(client, goodEntry);
    const bad = await getResourceBase64(client, badEntry);

    expect(good).toBe("iVBORw0KGgo=");
    expect(bad).toBeNull();
  });
});

// ============================================================================
// REAL CDP SHAPE — regression
// ============================================================================

/**
 * `Page.getResourceTree` შვილ frame-ებს **პირდაპირ** აბრუნებს
 * (`childFrames: FrameResourceTree[]`), და არა `{ frameResourceTree }`
 * შესაფუთში. ზემოთა mock-ები არასწორ ფორმას იყენებდნენ, ამიტომ ტესტები
 * მწვანე იყო, პროდაქშენი კი ვარდებოდა:
 *
 *   [W2W] Failed to get resource tree:
 *   TypeError: Cannot read properties of undefined (reading 'frame')
 *
 * გაზომილი stripe.com-ზე (childFrames: 1, keys: ['frame','resources']).
 * ამოქმედდებოდა ნებისმიერ გვერდზე, რომელსაც თუნდაც ერთი iframe აქვს.
 */
describe("buildResourceGraph — რეალური CDP ფორმა", () => {
  const realShapeTree = {
    frameTree: {
      frame: { id: "main", url: "https://example.com" },
      resources: [
        { url: "https://example.com/main.css", type: "Stylesheet", mimeType: "text/css" },
      ],
      // ⬇️ არა `{ frameResourceTree: … }` — ზუსტად ისე, როგორც CDP აბრუნებს
      childFrames: [
        {
          frame: { id: "iframe-1", url: "https://example.com/iframe" },
          resources: [
            { url: "https://example.com/iframe-img.png", type: "Image", mimeType: "image/png" },
          ],
          childFrames: [
            {
              frame: { id: "nested", url: "https://example.com/nested" },
              resources: [
                { url: "https://example.com/nested-font.woff2", type: "Font", mimeType: "font/woff2" },
              ],
            },
          ],
        },
      ],
    },
  };

  it("iframe-ის რესურსებს კრებს და არ ვარდება", async () => {
    const client = makeMockClient(async (method) =>
      method === "Page.getResourceTree" ? realShapeTree : {},
    );

    const graph = await buildResourceGraph(client);

    expect(graph.stylesheets.map((s) => s.url)).toContain("https://example.com/main.css");
    expect(graph.images.map((i) => i.url)).toContain("https://example.com/iframe-img.png");
    expect(graph.fonts.map((f) => f.url)).toContain("https://example.com/nested-font.woff2");
  });

  it("ჩადგმული frame-ის frameId სწორად ენიჭება", async () => {
    const client = makeMockClient(async (method) =>
      method === "Page.getResourceTree" ? realShapeTree : {},
    );

    const graph = await buildResourceGraph(client);

    const nested = graph.fonts.find((f) => f.url.endsWith("nested-font.woff2"));
    expect(nested?.frameId).toBe("nested");
  });
});
