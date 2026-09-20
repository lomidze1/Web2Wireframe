/**
 * Desktop-variant asset loss (iwm.org.uk, resourceMapMisses: 8).
 *
 * Multi-viewport capture reloads the page per viewport and used to harvest
 * assets ONCE after the loop — while the page sat on the LAST (mobile)
 * viewport. Page.getResourceTree only lists resources the CURRENT document
 * references, so every srcset variant that only the desktop document loads
 * (`…_desktop_1x…`) was a guaranteed cache miss, and its node fell back to a
 * gray placeholder. Fonts ride the same assets map, so their binaries were
 * lost the same way.
 *
 * The fix: w2wHarvestImageAssets() is callable per viewport, inside the loop,
 * while that viewport's document is still live. The post-loop call remains as
 * a catch-all and supplies the final miss count.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { W2WFrameNode } from "@w2w/shared";
import type { CDPClient } from "../cdp/client";
import { w2wFetchMissingImages, w2wHarvestImageAssets, w2wSniffImageMime } from "./w2w";

function imgFrame(url: string, children: W2WFrameNode[] = []): W2WFrameNode {
  return {
    type: "FRAME",
    tag: "img",
    classList: [],
    attr: {},
    styles: {},
    $url: url,
    children,
    x: 0, y: 0, width: 100, height: 100,
    quad: [0, 0, 100, 0, 100, 100, 0, 100],
  } as unknown as W2WFrameNode;
}

/** CDP stub whose resource tree contains exactly `resources`. */
function mockClient(resources: Array<{ url: string; mimeType: string }>) {
  const send = vi.fn(async (method: string, params?: { url?: string }) => {
    if (method === "Page.getResourceTree") {
      return { frameTree: { frame: { id: "F1", url: "https://x.test/" }, resources } };
    }
    if (method === "Page.getResourceContent") {
      const hit = resources.find((r) => r.url === params?.url);
      if (!hit) throw new Error("No resource with given URL");
      return { content: "QUJD", base64Encoded: true };
    }
    throw new Error(`unexpected CDP method ${method}`);
  });
  return { client: { send } as unknown as CDPClient, send };
}

const DESKTOP_URL = "https://x.test/i/hero_desktop_1x/a.jpg";
const MOBILE_URL = "https://x.test/i/hero_mobile_1x/a.jpg";

describe("w2wHarvestImageAssets", () => {
  it("harvests a URL the current document references", async () => {
    const { client } = mockClient([{ url: DESKTOP_URL, mimeType: "image/jpeg" }]);
    const assets: Record<string, { base64Encoded: boolean; content: string; mimeType: string }> = {};

    const result = await w2wHarvestImageAssets(client, [imgFrame(DESKTOP_URL)], assets);

    expect(result).toEqual({ extracted: 1, missed: 0 });
    expect(assets[DESKTOP_URL]).toEqual({
      base64Encoded: true,
      content: "QUJD",
      mimeType: "image/jpeg",
    });
  });

  it("counts a miss when the resource tree lacks the URL", async () => {
    const { client } = mockClient([]);
    const assets = {};

    const result = await w2wHarvestImageAssets(client, [imgFrame(DESKTOP_URL)], assets);

    expect(result).toEqual({ extracted: 0, missed: 1 });
    expect(assets).toEqual({});
  });

  it("does not re-fetch URLs already harvested", async () => {
    const { client, send } = mockClient([{ url: DESKTOP_URL, mimeType: "image/jpeg" }]);
    const assets = {
      [DESKTOP_URL]: { base64Encoded: true, content: "OLD", mimeType: "image/jpeg" },
    };

    const result = await w2wHarvestImageAssets(client, [imgFrame(DESKTOP_URL)], assets);

    expect(result).toEqual({ extracted: 0, missed: 0 });
    expect(assets[DESKTOP_URL].content).toBe("OLD");
    const contentCalls = send.mock.calls.filter(([m]) => m === "Page.getResourceContent");
    expect(contentCalls).toHaveLength(0);
  });

  it("dedupes a URL referenced by several nodes/frames in one pass", async () => {
    const { client, send } = mockClient([{ url: DESKTOP_URL, mimeType: "image/jpeg" }]);
    const assets = {};

    const result = await w2wHarvestImageAssets(
      client,
      [imgFrame(DESKTOP_URL, [imgFrame(DESKTOP_URL)]), imgFrame(DESKTOP_URL)],
      assets,
    );

    expect(result).toEqual({ extracted: 1, missed: 0 });
    const contentCalls = send.mock.calls.filter(([m]) => m === "Page.getResourceContent");
    expect(contentCalls).toHaveLength(1);
  });

  it("regression: per-viewport passes capture variants the last document no longer references", async () => {
    // Desktop pass: only the desktop variant is in the live document.
    const desktop = mockClient([{ url: DESKTOP_URL, mimeType: "image/jpeg" }]);
    // Mobile pass (after reload): desktop variant is GONE from the tree.
    const mobile = mockClient([{ url: MOBILE_URL, mimeType: "image/jpeg" }]);

    const assets: Record<string, { base64Encoded: boolean; content: string; mimeType: string }> = {};
    const desktopFrame = imgFrame(DESKTOP_URL);
    const mobileFrame = imgFrame(MOBILE_URL);

    // In-loop harvests, one per viewport, each against its own live document.
    await w2wHarvestImageAssets(desktop.client, [desktopFrame], assets);
    await w2wHarvestImageAssets(mobile.client, [mobileFrame], assets);

    // Post-loop catch-all over the union sees everything already harvested.
    const final = await w2wHarvestImageAssets(mobile.client, [desktopFrame, mobileFrame], assets);

    expect(Object.keys(assets).sort()).toEqual([DESKTOP_URL, MOBILE_URL].sort());
    expect(final).toEqual({ extracted: 0, missed: 0 });
  });
});

/**
 * The page-context fetch fallback (FETCH_FONT_DATA reuse) returns raw base64
 * with no MIME type; the asset entry's mimeType drives the plugin's decode
 * path, so a wrong guess misrenders. Sniff magic bytes instead of trusting
 * the URL extension, and refuse to store what we can't identify.
 */
describe("w2wSniffImageMime", () => {
  const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

  it("identifies PNG", () => {
    expect(w2wSniffImageMime(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
  });

  it("identifies JPEG", () => {
    expect(w2wSniffImageMime(b64([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
  });

  it("identifies GIF", () => {
    expect(w2wSniffImageMime(b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBe("image/gif");
  });

  it("identifies WebP (RIFF….WEBP)", () => {
    expect(
      w2wSniffImageMime(b64([0x52, 0x49, 0x46, 0x46, 0x11, 0x22, 0x33, 0x44, 0x57, 0x45, 0x42, 0x50])),
    ).toBe("image/webp");
  });

  it("identifies SVG text", () => {
    expect(w2wSniffImageMime(btoa('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe("image/svg+xml");
    expect(w2wSniffImageMime(btoa('<?xml version="1.0"?><svg>'))).toBe("image/svg+xml");
  });

  it("returns null for unknown bytes and invalid base64", () => {
    expect(w2wSniffImageMime(b64([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]))).toBeNull();
    expect(w2wSniffImageMime("!!!not-base64!!!")).toBeNull();
  });
});

/**
 * chroniclehq.com: 20 logo and icon SVGs came back as placeholders.
 *
 * All twenty had loaded in the browser — their nodes carry the right
 * naturalWidth — but `Page.getResourceTree` never listed them, and the
 * page-context fetch fallback could not reach them either: they live on
 * `cms.chroniclehq.com`, which sends no `Access-Control-Allow-Origin`, so a
 * fetch issued from the page's own origin is refused outright. (Verified
 * against the live site: the same fetch fails for a URL the resource tree DID
 * list, so CORS — not the file — is what blocks it.)
 *
 * The service worker has `host_permissions: ["<all_urls>"]`, and an MV3
 * worker's fetch to a permitted host is not subject to CORS, so it can read
 * what the page cannot. That makes it the right last resort.
 */
describe("w2wFetchMissingImages — service-worker last resort", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const CROSS_ORIGIN = "https://cms.example.com/logo.svg";

  function stubFetch(
    impl: (url: string) => { ok: boolean; body?: string } | Promise<never>,
  ) {
    const spy = vi.fn(async (url: string) => {
      const res = await impl(url);
      return {
        ok: res.ok,
        arrayBuffer: async () =>
          Uint8Array.from(res.body ?? "", (c) => c.charCodeAt(0)).buffer,
      };
    });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("recovers an image the page context was refused", async () => {
    stubFetch(() => ({ ok: true, body: SVG }));
    const assets: Record<string, { base64Encoded: boolean; content: string; mimeType?: string }> = {};

    const recovered = await w2wFetchMissingImages([CROSS_ORIGIN], assets);

    expect(recovered).toBe(1);
    expect(assets[CROSS_ORIGIN].mimeType).toBe("image/svg+xml");
    expect(atob(assets[CROSS_ORIGIN].content)).toBe(SVG);
  });

  it("leaves a URL alone when the bytes cannot be identified", async () => {
    stubFetch(() => ({ ok: true, body: "\x00\x01\x02\x03\x04\x05\x06\x07" }));
    const assets = {};

    expect(await w2wFetchMissingImages([CROSS_ORIGIN], assets)).toBe(0);
    expect(assets).toEqual({});
  });

  it("skips a response the server refused", async () => {
    stubFetch(() => ({ ok: false }));
    const assets = {};

    expect(await w2wFetchMissingImages([CROSS_ORIGIN], assets)).toBe(0);
    expect(assets).toEqual({});
  });

  it("survives a network failure without throwing", async () => {
    stubFetch(() => Promise.reject(new Error("net::ERR_FAILED")));
    const assets = {};

    await expect(w2wFetchMissingImages([CROSS_ORIGIN], assets)).resolves.toBe(0);
    expect(assets).toEqual({});
  });

  it("never re-fetches or overwrites what earlier passes already captured", async () => {
    const spy = stubFetch(() => ({ ok: true, body: SVG }));
    const assets = {
      [CROSS_ORIGIN]: { base64Encoded: true, content: "kept", mimeType: "image/png" },
    };

    expect(await w2wFetchMissingImages([CROSS_ORIGIN], assets)).toBe(0);
    expect(assets[CROSS_ORIGIN].content).toBe("kept");
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps going after one URL fails", async () => {
    const good = "https://cms.example.com/ok.svg";
    stubFetch((url) => (url === CROSS_ORIGIN ? { ok: false } : { ok: true, body: SVG }));
    const assets = {};

    expect(await w2wFetchMissingImages([CROSS_ORIGIN, good], assets)).toBe(1);
    expect(Object.keys(assets)).toEqual([good]);
  });
});
