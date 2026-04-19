import { describe, it, expect } from "vitest";
import { buildMarkerWrapperNode } from "../content-marker";

describe("buildMarkerWrapperNode", () => {
  it("wraps a decimal marker as __w2w-pseudo-marker FRAME + TEXT child", () => {
    const node = buildMarkerWrapperNode({
      markerText: "1.",
      x: 230,
      y: 4932,
      width: 14,
      height: 16,
      font: "400 12px SF Pro Text",
      pseudo: "::marker",
    });

    expect(node).not.toBeNull();
    expect(node!.type).toBe("FRAME");
    expect(node!.tag).toBe("span");
    expect(node!.classList).toContain("__w2w-pseudo-marker");
    expect(node!.children.length).toBe(1);

    const child = node!.children[0];
    expect(child.type).toBe("TEXT");
    if (child.type === "TEXT") {
      expect(child.value).toBe("1.");
      expect(child.font).toBe("400 12px SF Pro Text");
    }
  });

  it("propagates geometry to both wrapper and text child", () => {
    const node = buildMarkerWrapperNode({
      markerText: "2.",
      x: 100,
      y: 200,
      width: 18,
      height: 20,
      font: "400 14px Arial",
      pseudo: "::marker",
    });
    expect(node!.x).toBe(100);
    expect(node!.y).toBe(200);
    expect(node!.width).toBe(18);
    expect(node!.height).toBe(20);
    expect(node!.quad).toEqual([100, 200, 118, 200, 118, 220, 100, 220]);
    const text = node!.children[0];
    expect(text.x).toBe(100);
    expect(text.y).toBe(200);
    expect(text.width).toBe(18);
    expect(text.height).toBe(20);
  });

  it("preserves bullet marker as-is", () => {
    const node = buildMarkerWrapperNode({
      markerText: "•",
      x: 0,
      y: 0,
      width: 8,
      height: 14,
      font: "400 12px SF Pro Text",
      pseudo: "::marker",
    });
    expect(node).not.toBeNull();
    const child = node!.children[0];
    if (child.type === "TEXT") expect(child.value).toBe("•");
  });

  it("returns null for empty marker text (list-style-type: none case)", () => {
    const node = buildMarkerWrapperNode({
      markerText: "",
      x: 0,
      y: 0,
      width: 8,
      height: 14,
      font: "400 12px Arial",
      pseudo: "::marker",
    });
    expect(node).toBeNull();
  });

  it("stores color in styles when provided", () => {
    const node = buildMarkerWrapperNode({
      markerText: "i.",
      x: 0,
      y: 0,
      width: 10,
      height: 14,
      font: "400 12px Arial",
      color: "rgb(128, 128, 128)",
      pseudo: "::marker",
    });
    expect(node!.styles.color).toBe("rgb(128, 128, 128)");
  });

  it("omits color when not provided", () => {
    const node = buildMarkerWrapperNode({
      markerText: "a.",
      x: 0,
      y: 0,
      width: 10,
      height: 14,
      font: "400 12px Arial",
      pseudo: "::marker",
    });
    expect(node!.styles.color).toBeUndefined();
  });

  it("produces valid W2WFrameNode with required fields", () => {
    const node = buildMarkerWrapperNode({
      markerText: "III.",
      x: 50,
      y: 50,
      width: 22,
      height: 16,
      font: "700 13px Georgia",
      pseudo: "::marker",
    });
    expect(node!.type).toBe("FRAME");
    expect(node!.attr).toEqual({});
    expect(Array.isArray(node!.classList)).toBe(true);
    expect(Array.isArray(node!.children)).toBe(true);
  });
});
