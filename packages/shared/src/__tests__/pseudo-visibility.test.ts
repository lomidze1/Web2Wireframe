import { describe, it, expect } from "vitest";
import {
  shouldRenderPseudo,
  type PseudoVisibilityInput,
} from "../pseudo-visibility";

const base: PseudoVisibilityInput = {
  content: '""',
  display: "block",
  visibility: "visible",
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  borderWidth: "0px",
  borderStyle: "none",
  outlineWidth: "0px",
  outlineStyle: "none",
  boxShadow: "none",
  width: "auto",
  height: "auto",
};

describe("shouldRenderPseudo", () => {
  it("renders Apple-style pipe separator (empty content, background, dimensions)", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      backgroundColor: "rgba(0, 0, 0, 0.48)",
      width: "1px",
      height: "10px",
    });
    expect(result.render).toBe(true);
    expect(result.hasText).toBe(false);
    expect(result.textValue).toBe("");
    expect(result.hasVisualPresence).toBe(true);
  });

  it("renders empty content with border only", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      borderWidth: "1px",
      borderStyle: "solid",
    });
    expect(result.render).toBe(true);
    expect(result.hasVisualPresence).toBe(true);
  });

  it("renders empty content with box-shadow only", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      boxShadow: "rgba(0, 0, 0, 0.5) 0px 0px 5px",
    });
    expect(result.render).toBe(true);
  });

  it("renders empty content with background-image gradient (transparent bg-color)", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      backgroundImage: "linear-gradient(red, blue)",
    });
    expect(result.render).toBe(true);
  });

  it("renders empty content with outline only", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      outlineWidth: "2px",
      outlineStyle: "solid",
    });
    expect(result.render).toBe(true);
  });

  it("renders empty content with explicit width only", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      width: "20px",
    });
    expect(result.render).toBe(true);
  });

  it("skips empty content with no visual presence", () => {
    const result = shouldRenderPseudo({ ...base, content: '""' });
    expect(result.render).toBe(false);
    expect(result.hasText).toBe(false);
    expect(result.hasVisualPresence).toBe(false);
  });

  it("renders quoted text content even without visual presence", () => {
    const result = shouldRenderPseudo({ ...base, content: '"hello"' });
    expect(result.render).toBe(true);
    expect(result.hasText).toBe(true);
    expect(result.textValue).toBe("hello");
  });

  it("decodes unicode icon-font escapes (\\f5ae)", () => {
    const result = shouldRenderPseudo({ ...base, content: '"\\f5ae"' });
    expect(result.render).toBe(true);
    expect(result.hasText).toBe(true);
    expect(result.textValue).toBe(String.fromCodePoint(0xf5ae));
  });

  it("decodes unicode escape with trailing space", () => {
    const result = shouldRenderPseudo({ ...base, content: '"\\f5ae "' });
    expect(result.textValue).toBe(String.fromCodePoint(0xf5ae));
  });

  it("skips content: none", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: "none",
      backgroundColor: "red",
      width: "10px",
      height: "10px",
    });
    expect(result.render).toBe(false);
  });

  it("skips content: normal (property never declared)", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: "normal",
      backgroundColor: "red",
    });
    expect(result.render).toBe(false);
  });

  it("skips null content (property absent)", () => {
    const result = shouldRenderPseudo({ ...base, content: null });
    expect(result.render).toBe(false);
  });

  it("skips when display: none regardless of visual presence", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '"hello"',
      display: "none",
      backgroundColor: "red",
      width: "100px",
      height: "100px",
    });
    expect(result.render).toBe(false);
  });

  it("skips when visibility: hidden", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      visibility: "hidden",
      backgroundColor: "red",
      width: "10px",
      height: "10px",
    });
    expect(result.render).toBe(false);
  });

  it("treats transparent backgroundColor as absent", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      backgroundColor: "transparent",
    });
    expect(result.render).toBe(false);
  });

  it("treats border-width 0 as absent even when style is solid", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      borderWidth: "0px",
      borderStyle: "solid",
    });
    expect(result.render).toBe(false);
  });

  it("treats border-style none as absent even when width is nonzero", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '""',
      borderWidth: "1px",
      borderStyle: "none",
    });
    expect(result.render).toBe(false);
  });

  it("combines text + visual presence (text still extracted)", () => {
    const result = shouldRenderPseudo({
      ...base,
      content: '"→"',
      backgroundColor: "red",
      width: "20px",
      height: "20px",
    });
    expect(result.render).toBe(true);
    expect(result.hasText).toBe(true);
    expect(result.textValue).toBe("→");
    expect(result.hasVisualPresence).toBe(true);
  });
});
