import { describe, expect, it } from "vitest";
import { MIN_GAP, clampHandle, nearestHandleIndex } from "./CompareSlider";

describe("nearestHandleIndex", () => {
  it("picks the handle on the side the pointer is closest to", () => {
    expect(nearestHandleIndex([33, 67], 10)).toBe(0);
    expect(nearestHandleIndex([33, 67], 90)).toBe(1);
  });

  it("prefers the left handle when the pointer is exactly between them", () => {
    expect(nearestHandleIndex([33, 67], 50)).toBe(0);
    expect(nearestHandleIndex([33, 67], 51)).toBe(1);
  });

  it("always returns the only handle in a two-panel slider", () => {
    expect(nearestHandleIndex([50], 0)).toBe(0);
    expect(nearestHandleIndex([50], 100)).toBe(0);
  });
});

describe("clampHandle", () => {
  it("keeps a handle inside the frame", () => {
    expect(clampHandle([33, 67], 0, -10)).toBe(0);
    expect(clampHandle([33, 67], 1, 120)).toBe(100);
  });

  it("leaves a handle alone when it is already within bounds", () => {
    expect(clampHandle([33, 67], 0, 50)).toBe(50);
    expect(clampHandle([33, 67], 1, 50)).toBe(50);
  });

  it("stops each handle a MIN_GAP short of its neighbour", () => {
    expect(clampHandle([33, 67], 0, 80)).toBe(67 - MIN_GAP);
    expect(clampHandle([33, 67], 1, 10)).toBe(33 + MIN_GAP);
  });

  it("never lets the handles cross", () => {
    const positions = [40, 45];
    expect(clampHandle(positions, 0, 100)).toBeLessThan(positions[1]);
    expect(clampHandle(positions, 1, 0)).toBeGreaterThan(positions[0]);
  });

  it("clamps a lone handle to the full range, as the two-panel slider did", () => {
    expect(clampHandle([50], 0, -5)).toBe(0);
    expect(clampHandle([50], 0, 105)).toBe(100);
    expect(clampHandle([50], 0, 72)).toBe(72);
  });
});
