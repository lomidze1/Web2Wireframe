/**
 * Tests for pseudo-state styles pipeline
 * Verifies that pseudoStateStyles flow through
 * convertToWireframeNode() and prepareFramesForRendering()
 */
import { describe, it, expect } from "vitest";
import {
  convertToWireframeNode,
  prepareFramesForRendering,
} from "../ui/shared/absoluteModeRenderer";

// Minimal ExtractedElement factory
function makeElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-1",
    type: "frame",
    tag: "button",
    name: "Button",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: "#3B82F6",
    backgroundGradient: null,
    textColor: "#FFFFFF",
    borderColor: null,
    borderWidth: 0,
    borderRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
    boxShadow: null,
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: 600,
    lineHeight: "normal",
    letterSpacing: 0,
    textAlign: "center",
    textContent: "Click me",
    opacity: 1,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

const pluginColors = { text: "#11151a", surface: "#afc6dc" };

describe("hover-pipeline: convertToWireframeNode", () => {
  it("copies pseudoStateStyles.hover through pipeline", () => {
    const element = makeElement({
      pseudoStateStyles: {
        hover: { "background-color": "#2563EB", color: "#FFFFFF" },
      },
    });
    const result = convertToWireframeNode(element as never, pluginColors);

    expect(result.pseudoStateStyles?.hover).toEqual({
      "background-color": "#2563EB",
      color: "#FFFFFF",
    });
  });

  it("returns undefined pseudoStateStyles when no hover data exists", () => {
    const element = makeElement();
    const result = convertToWireframeNode(element as never, pluginColors);

    expect(result.pseudoStateStyles).toBeUndefined();
  });

  it("preserves pseudoStateStyles.hover in recursive children", () => {
    const child = makeElement({
      id: "child-link",
      tag: "a",
      name: "Link",
      pseudoStateStyles: {
        hover: { color: "#1E40AF", "text-decoration": "underline" },
      },
    });
    const parent = makeElement({
      id: "parent-nav",
      tag: "nav",
      name: "Navigation",
      children: [child],
    });
    const result = convertToWireframeNode(parent as never, pluginColors);

    expect(result.children[0].pseudoStateStyles?.hover).toEqual({
      color: "#1E40AF",
      "text-decoration": "underline",
    });
  });

  it("handles empty pseudoStateStyles object", () => {
    const element = makeElement({
      pseudoStateStyles: {},
    });
    const result = convertToWireframeNode(element as never, pluginColors);

    expect(result.pseudoStateStyles).toBeDefined();
  });
});

describe("hover-pipeline: prepareFramesForRendering", () => {
  it("hover data survives full pipeline", () => {
    const element = makeElement({
      pseudoStateStyles: {
        hover: { "background-color": "#2563EB" },
      },
    });
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        tree: element,
      },
    ];

    const result = prepareFramesForRendering(frames as never[], pluginColors);

    expect(result[0].tree.pseudoStateStyles?.hover).toEqual({
      "background-color": "#2563EB",
    });
  });

  it("pseudoStateStyles.hover survives full pipeline", () => {
    const element = makeElement({
      pseudoStateStyles: {
        hover: { opacity: "0.8" },
      },
    });
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        tree: element,
      },
    ];

    const result = prepareFramesForRendering(frames as never[], pluginColors);

    expect(result[0].tree.pseudoStateStyles?.hover).toEqual({ opacity: "0.8" });
  });

  it("no hover data in pipeline when absent", () => {
    const element = makeElement();
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        tree: element,
      },
    ];

    const result = prepareFramesForRendering(frames as never[], pluginColors);

    expect(result[0].tree.pseudoStateStyles).toBeUndefined();
  });
});

describe("hover-pipeline: pseudoStateStyles full propagation", () => {
  it("copies full pseudoStateStyles object through convertToWireframeNode", () => {
    const element = makeElement({
      pseudoStateStyles: {
        hover: { "background-color": "#1D4ED8" },
        focus: { "border-color": "blue", "box-shadow": "0 0 0 3px rgba(59,130,246,0.5)" },
        active: { "background-color": "#1E40AF", transform: "scale(0.98)" },
        focusVisible: { outline: "2px solid #3B82F6", "outline-offset": "2px" },
      },
    });
    const result = convertToWireframeNode(element as never, pluginColors);

    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover).toEqual({ "background-color": "#1D4ED8" });
    expect(result.pseudoStateStyles!.focus).toEqual({
      "border-color": "blue",
      "box-shadow": "0 0 0 3px rgba(59,130,246,0.5)",
    });
    expect(result.pseudoStateStyles!.active).toEqual({
      "background-color": "#1E40AF",
      transform: "scale(0.98)",
    });
    expect(result.pseudoStateStyles!.focusVisible).toEqual({
      outline: "2px solid #3B82F6",
      "outline-offset": "2px",
    });
  });

  it("pseudoStateStyles.focus survives prepareFramesForRendering pipeline", () => {
    const element = makeElement({
      pseudoStateStyles: {
        focus: { "border-color": "blue", "box-shadow": "0 0 0 3px rgba(59,130,246,0.5)" },
      },
    });
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        tree: element,
      },
    ];

    const result = prepareFramesForRendering(frames as never[], pluginColors);

    expect(result[0].tree.pseudoStateStyles).toBeDefined();
    expect(result[0].tree.pseudoStateStyles!.focus).toEqual({
      "border-color": "blue",
      "box-shadow": "0 0 0 3px rgba(59,130,246,0.5)",
    });
  });

  it("preserves pseudoStateStyles in recursive children", () => {
    const child = makeElement({
      id: "child-input",
      tag: "input",
      name: "Input",
      pseudoStateStyles: {
        active: { "background-color": "#F3F4F6" },
        focusVisible: { outline: "2px solid #3B82F6" },
      },
    });
    const parent = makeElement({
      id: "parent-form",
      tag: "form",
      name: "Form",
      children: [child],
      pseudoStateStyles: {
        hover: { "background-color": "#F9FAFB" },
      },
    });

    const result = convertToWireframeNode(parent as never, pluginColors);

    expect(result.pseudoStateStyles?.hover).toEqual({ "background-color": "#F9FAFB" });
    expect(result.children[0].pseudoStateStyles?.active).toEqual({ "background-color": "#F3F4F6" });
    expect(result.children[0].pseudoStateStyles?.focusVisible).toEqual({ outline: "2px solid #3B82F6" });
  });

  it("only hover populated — other states remain undefined", () => {
    const element = makeElement({
      pseudoStateStyles: {
        hover: { color: "red" },
      },
    });
    const result = convertToWireframeNode(element as never, pluginColors);

    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover).toEqual({ color: "red" });
    expect(result.pseudoStateStyles!.focus).toBeUndefined();
    expect(result.pseudoStateStyles!.active).toBeUndefined();
    expect(result.pseudoStateStyles!.focusVisible).toBeUndefined();
  });
});
