/**
 * Tests for css-converter.ts: alpha channel handling in fills
 *
 * Bug: 8-char hex colors (#RRGGBBAA) had alpha double-counted.
 * parseCSSColor returns { r, g, b, a: 0.12 }, and the fill was created with
 * opacity: color.a AND color: { ...color, a: 0.12 } (not separated).
 * Then fills.ts multiplied: fill.opacity * fill.color.a = 0.12 * 0.12 = 0.0144
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// Helper: minimal W2W frame node
function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: 'div',
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Alpha separation in fills
// ---------------------------------------------------------------------------

describe("css-converter: alpha channel in fills", () => {
  it("8-char hex (#3b82f61f) fill separates alpha: opacity=0.12, color.a=1", () => {
    const node = makeFrame({
      styles: { backgroundColor: '#3b82f61f' },
    });
    const result = convertW2WToWireframe(node as any);

    expect(result.fills).toBeDefined();
    expect(result.fills!.length).toBe(1);

    const fill = result.fills![0];
    expect(fill.type).toBe("SOLID");
    // Alpha should be separated into opacity, not in color.a
    expect(fill.opacity).toBeCloseTo(0.1216, 3); // 0x1f / 255
    expect(fill.color!.a).toBe(1); // alpha separated from color
  });

  it("rgba() fill separates alpha: opacity=0.5, color.a=1", () => {
    const node = makeFrame({
      styles: { backgroundColor: 'rgba(59, 130, 246, 0.5)' },
    });
    const result = convertW2WToWireframe(node as any);

    expect(result.fills).toBeDefined();
    expect(result.fills!.length).toBe(1);

    const fill = result.fills![0];
    expect(fill.opacity).toBeCloseTo(0.5, 2);
    expect(fill.color!.a).toBe(1);
  });

  it("6-char hex (#3b82f6) has full opacity", () => {
    const node = makeFrame({
      styles: { backgroundColor: '#3b82f6' },
    });
    const result = convertW2WToWireframe(node as any);

    expect(result.fills).toBeDefined();
    const fill = result.fills![0];
    expect(fill.opacity).toBe(1);
    expect(fill.color!.a).toBe(1);
  });

  it("transparent backgroundColor produces no fills", () => {
    const node = makeFrame({
      styles: { backgroundColor: 'rgba(0, 0, 0, 0)' },
    });
    const result = convertW2WToWireframe(node as any);

    // fills should be undefined or empty
    expect(result.fills?.length ?? 0).toBe(0);
  });

  it("no backgroundColor produces no fills", () => {
    const node = makeFrame({ styles: {} });
    const result = convertW2WToWireframe(node as any);
    expect(result.fills?.length ?? 0).toBe(0);
  });
});
