import { describe, it, expect } from "vitest";
import { getLayoutMode } from "../utils";

describe("getLayoutMode", () => {
  it("flex row → HORIZONTAL", () => {
    expect(getLayoutMode({ display: "flex", "flex-direction": "row" })).toBe("HORIZONTAL");
  });

  it("flex column → VERTICAL", () => {
    expect(getLayoutMode({ display: "flex", "flex-direction": "column" })).toBe("VERTICAL");
  });

  it("inline-flex row → HORIZONTAL", () => {
    expect(getLayoutMode({ display: "inline-flex", "flex-direction": "row" })).toBe("HORIZONTAL");
  });

  it("grid → GRID", () => {
    expect(getLayoutMode({ display: "grid" })).toBe("GRID");
  });

  it("inline → HORIZONTAL", () => {
    expect(getLayoutMode({ display: "inline" })).toBe("HORIZONTAL");
  });

  it("inline-block → HORIZONTAL", () => {
    expect(getLayoutMode({ display: "inline-block" })).toBe("HORIZONTAL");
  });

  it("ul tag → VERTICAL", () => {
    expect(getLayoutMode({ display: "block" }, "ul")).toBe("VERTICAL");
  });

  it("ol tag → VERTICAL", () => {
    expect(getLayoutMode({ display: "block" }, "ol")).toBe("VERTICAL");
  });

  it("display: list-item → VERTICAL (block-level flow with marker on the side)", () => {
    expect(getLayoutMode({ display: "list-item" })).toBe("VERTICAL");
  });

  it("display: list-item with li tag → VERTICAL", () => {
    expect(getLayoutMode({ display: "list-item" }, "li")).toBe("VERTICAL");
  });

  it("display: block (no tag) → NONE", () => {
    expect(getLayoutMode({ display: "block" })).toBe("NONE");
  });

  it("display: block li → NONE (not list-item, so no auto-layout)", () => {
    expect(getLayoutMode({ display: "block" }, "li")).toBe("NONE");
  });

  it("display: flex li → respects flex-direction, not forced HORIZONTAL", () => {
    expect(getLayoutMode({ display: "flex", "flex-direction": "column" }, "li")).toBe("VERTICAL");
    expect(getLayoutMode({ display: "flex", "flex-direction": "row" }, "li")).toBe("HORIZONTAL");
  });

  it("display: contents → NONE", () => {
    expect(getLayoutMode({ display: "contents" })).toBe("NONE");
  });
});
