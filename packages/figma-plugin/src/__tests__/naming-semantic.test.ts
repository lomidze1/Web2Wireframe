/**
 * Stage 1 semantic layer naming (h2d parity — their `U2` tag→role map,
 * app.js:38220, confirmed against h2d's real stripe.com import).
 *
 * Default naming is now semantic ("Header", "Link - Stripe homepage",
 * "Heading 3 → …"); the old DOM-selector naming (`tag#id` / `tag.class`)
 * lives behind the `htmlLayerNames` option (h2d's "HTML layer names"
 * toggle, default OFF).
 */
import { describe, it, expect } from "vitest";

import { convertW2WToWireframe } from "../rendering/css-converter";
import { getSemanticElementName } from "../rendering/naming";
import type { WireframeNode } from "../types";

type Styles = Record<string, string | number>;
type Attr = Record<string, string | number | boolean | undefined>;

function w2wFrame(
  tag: string,
  opts: {
    styles?: Styles;
    classList?: string[];
    attr?: Attr;
    geo?: { x: number; y: number; width: number; height: number };
    children?: unknown[];
  } = {},
) {
  const geo = opts.geo ?? { x: 0, y: 0, width: 200, height: 100 };
  return {
    type: "FRAME",
    tag,
    classList: opts.classList ?? [],
    attr: opts.attr ?? {},
    ...geo,
    quad: [
      geo.x, geo.y,
      geo.x + geo.width, geo.y,
      geo.x + geo.width, geo.y + geo.height,
      geo.x, geo.y + geo.height,
    ],
    styles: opts.styles ?? {},
    children: opts.children ?? [],
  };
}

function w2wText(
  value: string,
  geo = { x: 0, y: 0, width: 100, height: 20 },
) {
  return {
    type: "TEXT",
    ...geo,
    quad: [
      geo.x, geo.y,
      geo.x + geo.width, geo.y,
      geo.x + geo.width, geo.y + geo.height,
      geo.x, geo.y + geo.height,
    ],
    value,
    font: "16px Arial",
  };
}

function convert(root: unknown, htmlLayerNames = false): WireframeNode {
  return convertW2WToWireframe(root as never, {
    layoutMode: "autoLayout",
    htmlLayerNames,
  });
}

describe("getSemanticElementName — h2d U2 tag map", () => {
  it("maps the ported h2d tags", () => {
    expect(getSemanticElementName("a", {})).toBe("Link");
    expect(getSemanticElementName("li", {})).toBe("Item");
    expect(getSemanticElementName("ul", {})).toBe("List");
    expect(getSemanticElementName("ol", {})).toBe("Ordered List");
    expect(getSemanticElementName("h1", {})).toBe("Heading 1");
    expect(getSemanticElementName("h6", {})).toBe("Heading 6");
    expect(getSemanticElementName("tr", {})).toBe("Row");
    expect(getSemanticElementName("td", {})).toBe("Data");
    expect(getSemanticElementName("th", {})).toBe("Cell");
    expect(getSemanticElementName("thead", {})).toBe("Header");
    expect(getSemanticElementName("tbody", {})).toBe("Body");
    expect(getSemanticElementName("tfoot", {})).toBe("Footer");
    expect(getSemanticElementName("dl", {})).toBe("Descriptions");
    expect(getSemanticElementName("dt", {})).toBe("Term");
    expect(getSemanticElementName("dd", {})).toBe("Details");
    expect(getSemanticElementName("hr", {})).toBe("Separator");
    expect(getSemanticElementName("q", {})).toBe("Quote");
    expect(getSemanticElementName("select", {})).toBe("Options");
    expect(getSemanticElementName("svg", {})).toBe("SVG");
    expect(getSemanticElementName("em", {})).toBe("Emphasis");
    expect(getSemanticElementName("kbd", {})).toBe("Keyboard");
    expect(getSemanticElementName("var", {})).toBe("Variable");
    expect(getSemanticElementName("samp", {})).toBe("Sample");
    expect(getSemanticElementName("s", {})).toBe("Strikethrough");
    expect(getSemanticElementName("sub", {})).toBe("Subscript");
    expect(getSemanticElementName("sup", {})).toBe("Superscript");
    expect(getSemanticElementName("menu", {})).toBe("Menu item");
  });

  it("keeps structural tags' own name, capitalized", () => {
    expect(getSemanticElementName("header", {})).toBe("Header");
    expect(getSemanticElementName("footer", {})).toBe("Footer");
    expect(getSemanticElementName("nav", {})).toBe("Nav");
    expect(getSemanticElementName("main", {})).toBe("Main");
    expect(getSemanticElementName("section", {})).toBe("Section");
    expect(getSemanticElementName("form", {})).toBe("Form");
    expect(getSemanticElementName("table", {})).toBe("Table");
    expect(getSemanticElementName("aside", {})).toBe("Aside");
    expect(getSemanticElementName("article", {})).toBe("Article");
    expect(getSemanticElementName("button", {})).toBe("Button");
    expect(getSemanticElementName("iframe", {})).toBe("Iframe");
  });

  it("role attribute wins over the tag", () => {
    expect(getSemanticElementName("div", { role: "button" })).toBe("Button");
    expect(getSemanticElementName("span", { role: "listitem" })).toBe("Item");
  });

  it("role=presentation / role=none strip the semantic name", () => {
    expect(getSemanticElementName("ul", { role: "presentation" })).toBe("");
    expect(getSemanticElementName("table", { role: "none" })).toBe("");
  });

  it("generic containers get no stage-1 name", () => {
    expect(getSemanticElementName("div", {})).toBe("");
    expect(getSemanticElementName("span", {})).toBe("");
    // p is left for stage 2's all-TEXT-children → "Paragraph" rule
    expect(getSemanticElementName("p", {})).toBe("");
    // media is named by filename / paint in stage 2
    expect(getSemanticElementName("img", {})).toBe("");
    expect(getSemanticElementName("video", {})).toBe("");
  });

  it("custom elements keep their tag verbatim", () => {
    expect(getSemanticElementName("stripe-header", {})).toBe("stripe-header");
    expect(getSemanticElementName("my-widget", { role: "presentation" })).toBe("");
  });

  it("appends aria-label with ' - ', truncated to 40 chars", () => {
    expect(getSemanticElementName("a", { "aria-label": "Stripe homepage" }))
      .toBe("Link - Stripe homepage");
    expect(getSemanticElementName("nav", { "aria-label": "Main" }))
      .toBe("Nav - Main");
    const long = "x".repeat(60);
    const name = getSemanticElementName("a", { "aria-label": long });
    expect(name).toBe(`Link - ${"x".repeat(40)}`);
  });

  it("img with alt becomes 'Image - <alt>'; alone alt-less img stays unnamed", () => {
    expect(getSemanticElementName("img", { alt: "decagon logo" }))
      .toBe("Image - decagon logo");
    expect(getSemanticElementName("img", { alt: "" })).toBe("");
  });

  it("never throws on garbage input", () => {
    expect(getSemanticElementName("", {})).toBe("");
    expect(
      getSemanticElementName("a", { "aria-label": 42 as unknown as string }),
    ).toBe("Link");
  });
});

describe("semantic naming through convertW2WToWireframe (default)", () => {
  it("names a header>nav>a tree like h2d's document outline", () => {
    const tree = w2wFrame("header", {
      styles: { display: "flex" },
      children: [
        w2wFrame("nav", {
          styles: { display: "flex" },
          children: [
            w2wFrame("a", {
              attr: { "aria-label": "Stripe homepage" },
              geo: { x: 0, y: 0, width: 80, height: 40 },
            }),
          ],
        }),
      ],
    });
    const out = convert(tree);
    expect(out.name).toBe("Header");
    expect(out.children[0].name).toBe("Nav");
    expect(out.children[0].children[0].name).toBe("Link - Stripe homepage");
  });

  it("does NOT emit DOM selectors for divs with ids/classes", () => {
    const out = convert(
      w2wFrame("div", { classList: ["sc-bdVaJa"], attr: { id: "root" } }),
    );
    expect(out.name).not.toContain("div");
    expect(out.name).not.toContain("sc-bdVaJa");
    expect(out.name).not.toContain("#root");
    expect(out.name.length).toBeGreaterThan(0);
  });

  it("names a coalesced heading 'Heading 3 → <content>'", () => {
    const tree = w2wFrame("h3", {
      geo: { x: 0, y: 0, width: 300, height: 24 },
      styles: { fontSize: "20px", fontFamily: "Arial" },
      children: [w2wText("Create a card issuing program")],
    });
    const out = convert(tree);
    expect(out.type).toBe("text");
    expect(out.name).toBe("Heading 3 → Create a card issuing program");
  });

  it("names a coalesced link 'Link - <content>' (h2d: 'Link - Sign in')", () => {
    const tree = w2wFrame("a", {
      geo: { x: 0, y: 0, width: 60, height: 20 },
      styles: { fontSize: "14px", fontFamily: "Arial" },
      children: [w2wText("Sign in", { x: 0, y: 0, width: 60, height: 20 })],
    });
    const out = convert(tree);
    expect(out.type).toBe("text");
    expect(out.name).toBe("Link - Sign in");
  });

  it("coalesced text with an unmapped wrapper keeps content-only name", () => {
    const tree = w2wFrame("span", {
      geo: { x: 0, y: 0, width: 100, height: 20 },
      styles: { fontSize: "14px", fontFamily: "Arial" },
      children: [w2wText("Just some text")],
    });
    const out = convert(tree);
    expect(out.type).toBe("text");
    expect(out.name).toBe("Just some text");
  });
});

describe("htmlLayerNames: true — legacy DOM naming preserved exactly", () => {
  it("tag#id wins, then tag.firstClass, then bare tag", () => {
    expect(
      convert(w2wFrame("div", { attr: { id: "hero" }, classList: ["a", "b"] }), true).name,
    ).toBe("div#hero");
    expect(
      convert(w2wFrame("div", { classList: ["Header__nav-item--2fJk"] }), true).name,
    ).toBe("div.Header__nav-item--2fJk");
    expect(convert(w2wFrame("div"), true).name).toBe("div");
  });

  it("keeps the Font Awesome icon-class special case", () => {
    expect(
      convert(
        w2wFrame("i", { classList: ["fa-solid", "fa-pen-ruler"] }),
        true,
      ).name,
    ).toBe("fa-pen-ruler");
  });
});
