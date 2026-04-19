/**
 * Fetch inline SVG markup for a list of URLs.
 * Pure async, no globals — fetchFn is injected for testability.
 *
 * Used by browser-extension content script to inline `<img src="*.svg">` and
 * `background-image: url(*.svg)` as vector markup before posting tree to backend.
 */

import { isSvgMarkup } from "./svg-detect";

export interface FetchSvgOpts {
  concurrency?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchSvgMarkupForUrls(
  urls: string[],
  fetchFn: FetchFn,
  opts: FetchSvgOpts = {}
): Promise<Record<string, string>> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (unique.length === 0) return {};

  const result: Record<string, string> = {};
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const url = unique[cursor++];
      const markup = await fetchOne(url, fetchFn, timeoutMs, maxBytes);
      if (markup !== null) result[url] = markup;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

async function fetchOne(
  url: string,
  fetchFn: FetchFn,
  timeoutMs: number,
  maxBytes: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) return null;

    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > maxBytes) return null;

    const text = await res.text();
    if (text.length > maxBytes) return null;
    if (!isSvgMarkup(text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
