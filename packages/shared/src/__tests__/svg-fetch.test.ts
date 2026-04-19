/**
 * svg-fetch utilities — unit tests
 * Written BEFORE implementation (TDD).
 */

import { describe, it, expect, vi } from "vitest";
import { fetchSvgMarkupForUrls } from "../svg-fetch";

const SVG_BODY = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';

function mockResponse(
  body: string,
  opts: { ok?: boolean; contentType?: string; contentLength?: number } = {}
): Response {
  const ok = opts.ok !== false;
  const headers = new Map<string, string>();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  if (opts.contentLength !== undefined) headers.set("content-length", String(opts.contentLength));

  return {
    ok,
    status: ok ? 200 : 404,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null } as unknown as Headers,
    text: async () => body,
  } as unknown as Response;
}

describe("fetchSvgMarkupForUrls", () => {
  it("resolves a single SVG URL to markup", async () => {
    const fetchFn = vi.fn(async () => mockResponse(SVG_BODY, { contentType: "image/svg+xml" }));

    const result = await fetchSvgMarkupForUrls(["/logo.svg"], fetchFn);

    expect(result["/logo.svg"]).toBe(SVG_BODY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("resolves multiple URLs in parallel (respecting concurrency cap)", async () => {
    const inFlight: { n: number; max: number } = { n: 0, max: 0 };
    const fetchFn = vi.fn(async () => {
      inFlight.n++;
      inFlight.max = Math.max(inFlight.max, inFlight.n);
      await new Promise((r) => setTimeout(r, 10));
      inFlight.n--;
      return mockResponse(SVG_BODY, { contentType: "image/svg+xml" });
    });

    const urls = Array.from({ length: 20 }, (_, i) => `/svg${i}.svg`);
    const result = await fetchSvgMarkupForUrls(urls, fetchFn, { concurrency: 4 });

    expect(Object.keys(result)).toHaveLength(20);
    expect(inFlight.max).toBeLessThanOrEqual(4);
  });

  it("fail-open on HTTP error — URL omitted", async () => {
    const fetchFn = vi.fn(async () => mockResponse("Not Found", { ok: false }));

    const result = await fetchSvgMarkupForUrls(["/missing.svg"], fetchFn);

    expect(result["/missing.svg"]).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("fail-open on network error — URL omitted", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network error");
    });

    const result = await fetchSvgMarkupForUrls(["/a.svg", "/b.svg"], fetchFn);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips responses with non-SVG markup", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse("<html><body>hi</body></html>", { contentType: "text/html" })
    );

    const result = await fetchSvgMarkupForUrls(["/trick.svg"], fetchFn);

    expect(result["/trick.svg"]).toBeUndefined();
  });

  it("skips responses exceeding size limit", async () => {
    const huge = "<svg>" + "x".repeat(3 * 1024 * 1024) + "</svg>";
    const fetchFn = vi.fn(async () => mockResponse(huge, { contentType: "image/svg+xml" }));

    const result = await fetchSvgMarkupForUrls(["/huge.svg"], fetchFn, {
      maxBytes: 2 * 1024 * 1024,
    });

    expect(result["/huge.svg"]).toBeUndefined();
  });

  it("aborts slow requests via timeout", async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError"))
            );
          }
        })
    );

    const result = await fetchSvgMarkupForUrls(["/slow.svg"], fetchFn, {
      timeoutMs: 30,
    });

    expect(result["/slow.svg"]).toBeUndefined();
  });

  it("handles empty URL list", async () => {
    const fetchFn = vi.fn();
    const result = await fetchSvgMarkupForUrls([], fetchFn);
    expect(result).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("deduplicates repeated URLs", async () => {
    const fetchFn = vi.fn(async () => mockResponse(SVG_BODY, { contentType: "image/svg+xml" }));

    await fetchSvgMarkupForUrls(["/same.svg", "/same.svg", "/same.svg"], fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
