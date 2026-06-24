import { describe, it, expect } from "vitest";
import { looksLikeBlockPage } from "../ui/shared/blockPageDetection";

// Minimal W2W tree builders (mirror the shape import-url returns:
// each frame has `.tree`; TEXT nodes hold their string in `.value`).
const text = (value: string) => ({ type: "TEXT", value });
const frame = (children: unknown[]) => ({ type: "FRAME", children });
const framesFrom = (tree: unknown) => [{ tree }];

describe("looksLikeBlockPage", () => {
  it("flags an Akamai 'Access Denied' page (few nodes + block phrase)", () => {
    const tree = frame([
      text("Access Denied"),
      text(
        'You don\'t have permission to access "http://www.tesla.com/" on this server.',
      ),
      text("Reference #18.abcd1234.1700000000.deadbeef"),
    ]);
    expect(looksLikeBlockPage(framesFrom(tree))).toBe(true);
  });

  it("flags a Cloudflare interstitial", () => {
    const tree = frame([
      text("Just a moment..."),
      text("Checking your browser before accessing the site."),
    ]);
    expect(looksLikeBlockPage(framesFrom(tree))).toBe(true);
  });

  it("walks nested frames to find the block text", () => {
    const tree = frame([frame([frame([text("Pardon Our Interruption...")])])]);
    expect(looksLikeBlockPage(framesFrom(tree))).toBe(true);
  });

  it("does NOT flag a normal content-heavy page", () => {
    const children = Array.from({ length: 60 }, (_, i) =>
      text(`Real content paragraph ${i}`),
    );
    expect(looksLikeBlockPage(framesFrom(frame(children)))).toBe(false);
  });

  it("does NOT flag a large page that merely mentions 'access denied'", () => {
    const children = [
      text("Access Denied"),
      ...Array.from({ length: 60 }, (_, i) => text(`Article body line ${i}`)),
    ];
    expect(looksLikeBlockPage(framesFrom(frame(children)))).toBe(false);
  });

  it("returns false for empty / missing / treeless input", () => {
    expect(looksLikeBlockPage([])).toBe(false);
    expect(looksLikeBlockPage(undefined)).toBe(false);
    expect(looksLikeBlockPage([{}])).toBe(false);
  });
});
