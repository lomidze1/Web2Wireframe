/**
 * textOverflow Tests
 *
 * Verifies that text-overflow: ellipsis is detected
 * and mapped to textTruncation: "ENDING" for Figma.
 */

import { describe, it, expect } from "vitest";
import { getTextTruncation } from "../tree-builder";

describe("getTextTruncation", () => {
  it("should return ENDING for text-overflow: ellipsis", () => {
    const result = getTextTruncation({
      "text-overflow": "ellipsis",
    });
    expect(result).toBe("ENDING");
  });

  it("should return undefined for text-overflow: clip", () => {
    const result = getTextTruncation({
      "text-overflow": "clip",
    });
    expect(result).toBeUndefined();
  });

  it("should return undefined when text-overflow is not set", () => {
    const result = getTextTruncation({});
    expect(result).toBeUndefined();
  });

  it("should return undefined for text-overflow: none", () => {
    const result = getTextTruncation({
      "text-overflow": "none",
    });
    expect(result).toBeUndefined();
  });
});
