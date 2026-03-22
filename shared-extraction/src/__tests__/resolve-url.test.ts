/**
 * resolveUrl() Unit Tests
 *
 * Tests for resolving relative URLs against a base document URL.
 * Written BEFORE implementation (TDD).
 */

import { describe, it, expect } from "vitest";
import { resolveUrl } from "../utils";

describe("resolveUrl", () => {
  // ── Empty / undefined inputs ──────────────────────────────────────────

  it('empty string → undefined', () => {
    expect(resolveUrl("", "https://example.com")).toBeUndefined();
  });

  it('undefined → undefined', () => {
    expect(resolveUrl(undefined, "https://example.com")).toBeUndefined();
  });

  // ── Already-absolute URLs (pass-through) ──────────────────────────────

  it('absolute https → pass-through', () => {
    expect(resolveUrl("https://cdn.example.com/img.jpg", "https://example.com"))
      .toBe("https://cdn.example.com/img.jpg");
  });

  it('absolute http → pass-through', () => {
    expect(resolveUrl("http://cdn.example.com/img.jpg", "https://example.com"))
      .toBe("http://cdn.example.com/img.jpg");
  });

  it('protocol-relative // → pass-through', () => {
    expect(resolveUrl("//cdn.example.com/img.jpg", "https://example.com"))
      .toBe("//cdn.example.com/img.jpg");
  });

  it('data: URI → pass-through', () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    expect(resolveUrl(dataUri, "https://example.com")).toBe(dataUri);
  });

  it('blob: URI → pass-through', () => {
    const blobUri = "blob:https://example.com/abc-123";
    expect(resolveUrl(blobUri, "https://example.com")).toBe(blobUri);
  });

  // ── Relative URL resolution ───────────────────────────────────────────

  it('root-relative /images/hero.jpg + base → resolved', () => {
    expect(resolveUrl("/images/hero.jpg", "https://example.com/page/about"))
      .toBe("https://example.com/images/hero.jpg");
  });

  it('path-relative images/hero.jpg + base → resolved', () => {
    expect(resolveUrl("images/hero.jpg", "https://example.com/page/about"))
      .toBe("https://example.com/page/images/hero.jpg");
  });

  it('parent-relative ../photo.png + base → resolved', () => {
    expect(resolveUrl("../photo.png", "https://example.com/a/b/page"))
      .toBe("https://example.com/a/photo.png");
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('no base URL → returns url as-is', () => {
    expect(resolveUrl("/images/hero.jpg", undefined))
      .toBe("/images/hero.jpg");
  });

  it('no base URL (empty string) → returns url as-is', () => {
    expect(resolveUrl("/images/hero.jpg", ""))
      .toBe("/images/hero.jpg");
  });

  it('invalid base URL → returns url as-is', () => {
    expect(resolveUrl("/images/hero.jpg", "not-a-url"))
      .toBe("/images/hero.jpg");
  });
});
