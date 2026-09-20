/** @jsx h */
/**
 * A missing font falls back along its own CSS stack before the plugin font.
 *
 * User import reports (2026-09-16): every missing family on 8 sites was drawn
 * in Montserrat, because the modal's "Use fallback fonts" / Esc path got no
 * CSS chains and mapped everything to the plugin font. The page's own stack
 * (e.g. `Moderat, Helvetica, Arial, sans-serif`) names what the designer
 * intended as the substitute.
 */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import FontFallbackModal from "../ui/components/modalPopup/FontFallbackModal";
import {
  buildDefaultFontMapping,
  collectFontStacks,
  genericFallbackFamily,
  resolveStackFallbacks,
} from "../utils/fontUtils";
import type { WireframeNode } from "../types";

vi.mock("../ui/components/modalPopup/Modal.css", () => ({
  default: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === "string" ? prop : "") }
  ),
}));

function textNode(fontFamily: string, fontFamilyList?: string[], children: WireframeNode[] = []): WireframeNode {
  return { fontFamily, fontFamilyList, children } as unknown as WireframeNode;
}

describe("genericFallbackFamily", () => {
  it("maps CSS generics to installed defaults", () => {
    expect(genericFallbackFamily("sans-serif")).toBe("Inter");
    expect(genericFallbackFamily("system-ui")).toBe("Inter");
    expect(genericFallbackFamily("serif")).toBe("Georgia");
    expect(genericFallbackFamily("monospace")).toBe("Courier");
    expect(genericFallbackFamily("Helvetica")).toBeUndefined();
  });
});

describe("collectFontStacks", () => {
  it("records the first stack seen per family, including styled segments", () => {
    const tree = textNode("Moderat", ["Moderat", "Helvetica", "sans-serif"], [
      textNode("Moderat", ["Moderat", "Arial"]),
      {
        fontFamily: "Inter",
        styledSegments: [{ fontFamily: "Thunder", fontFamilyList: ["Thunder", "Impact", "sans-serif"] }],
        children: [],
      } as unknown as WireframeNode,
    ]);
    const stacks = collectFontStacks([{ tree }]);
    expect(stacks["Moderat"]).toEqual(["Moderat", "Helvetica", "sans-serif"]);
    expect(stacks["Thunder"]).toEqual(["Thunder", "Impact", "sans-serif"]);
  });
});

describe("resolveStackFallbacks", () => {
  const installed = new Set(["Inter", "Helvetica", "Montserrat"]);

  it("takes the first installed family after the missing one", () => {
    const out = resolveStackFallbacks(
      ["Moderat"],
      { Moderat: ["Moderat", "Moderat Fallback", "Helvetica", "sans-serif"] },
      installed,
    );
    expect(out).toEqual({ Moderat: "Helvetica" });
  });

  it("uses the generic default when only a generic follows", () => {
    const out = resolveStackFallbacks(["Diatype"], { Diatype: ["Diatype", "sans-serif"] }, installed);
    expect(out).toEqual({ Diatype: "Inter" });
  });

  it("leaves a font out when its stack offers nothing", () => {
    const out = resolveStackFallbacks(["Thunder"], { Thunder: ["Thunder", "Thunder Med"] }, installed);
    expect(out).toEqual({});
    expect(resolveStackFallbacks(["Nope"], {}, installed)).toEqual({});
  });
});

describe("buildDefaultFontMapping with stack fallbacks", () => {
  it("prefers the stack fallback, then the heuristics, then the plugin font", () => {
    const mapping = buildDefaultFontMapping(
      ["Moderat", "Reckless Serif", "Thunder", "FFIcons"],
      "Montserrat",
      { Moderat: "Helvetica", FFIcons: "Inter" },
    );
    expect(mapping).toEqual({
      Moderat: "Helvetica",
      "Reckless Serif": "Georgia",
      Thunder: "Montserrat",
      FFIcons: "FFIcons",
    });
  });
});

describe("FontFallbackModal close (Esc) uses the default mapping", () => {
  it("closing maps each font like 'Use fallback fonts' does", () => {
    const onChoice = vi.fn();
    const { getByLabelText } = render(
      <FontFallbackModal
        isOpen={true}
        missingFonts={["Moderat", "Thunder"]}
        defaultMapping={{ Moderat: "Helvetica", Thunder: "Montserrat" }}
        pluginFont="Montserrat"
        pluginFontOptions={["Montserrat", "Inter"]}
        onChoice={onChoice}
      />
    );
    fireEvent.click(getByLabelText("Use CSS fallback fonts and close"));
    expect(onChoice).toHaveBeenCalledWith("fallback", { Moderat: "Helvetica", Thunder: "Montserrat" });
  });
});
