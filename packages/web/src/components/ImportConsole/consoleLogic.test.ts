import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONSOLE_STATE,
  PALETTES,
  FRAMES,
  SOURCE_HINTS,
  getPalette,
  getPaletteLabel,
  getCopy,
  getFontStack,
  deriveLayers,
  deriveLayerNote,
  deriveSummary,
} from "./consoleLogic";

describe("defaults", () => {
  it("matches the design's initial state", () => {
    expect(DEFAULT_CONSOLE_STATE).toEqual({
      source: "url",
      viewport: "1440",
      layout: "auto",
      text: "semantic",
      assets: "placeholder",
      colors: "plugin",
      fonts: "plugin",
      vars: "direct",
    });
  });
});

describe("palette", () => {
  it("plugin palette has the five wireframe roles", () => {
    expect(PALETTES.plugin).toEqual({
      text: "#1f2124",
      bg: "#ffffff",
      secondary: "#d6d4d1",
      surface: "#f2f1ef",
      accent: "#54524e",
    });
  });

  it("website palette is the detected Northwind blue set", () => {
    expect(PALETTES.website).toEqual({
      text: "#0f1729",
      bg: "#ffffff",
      secondary: "#c9d3e0",
      surface: "#eef2f8",
      accent: "#2f5fd8",
    });
  });

  it("getPalette follows the colors setting", () => {
    expect(getPalette("plugin")).toBe(PALETTES.plugin);
    expect(getPalette("website")).toBe(PALETTES.website);
  });

  it("caption switches between editable defaults and detected", () => {
    expect(getPaletteLabel("plugin")).toBe("plugin defaults, editable");
    expect(getPaletteLabel("website")).toBe("detected on the source page");
  });
});

describe("copy sets", () => {
  it("semantic uses neutral structural labels", () => {
    const copy = getCopy("semantic");
    expect(copy.h1).toBe("Heading 1");
    expect(copy.cta).toBe("Button");
    expect(copy.nav1).toBe("Link");
    expect(copy.cards).toHaveLength(3);
    expect(copy.cards[0]).toEqual({ title: "Heading 3", body: "Paragraph" });
  });

  it("lorem is latin at comparable lengths", () => {
    const copy = getCopy("lorem");
    expect(copy.h1).toBe("Lorem ipsum dolor sit amet");
    expect(copy.nav1).toBe("Lorem");
    expect(copy.cards[2].title).toBe("Magna aliqua");
  });

  it("website is the invented Northwind source site", () => {
    const copy = getCopy("website");
    expect(copy.h1).toBe("Close the books before the board asks");
    expect(copy.cta).toBe("Start free trial");
    expect(copy.nav1).toBe("Product");
    expect(copy.cards.map((c) => c.title)).toEqual([
      "Ledger sync",
      "Variance notes",
      "Board export",
    ]);
  });
});

describe("frame metrics", () => {
  it("1440 renders the widest frame with three card columns", () => {
    expect(FRAMES["1440"].w).toBe("620px");
    expect(FRAMES["1440"].label).toBe("Landing — 1440 × 3120");
    expect(FRAMES["1440"].cardCols).toBe("1fr 1fr 1fr");
  });

  it("768 narrows to two card columns", () => {
    expect(FRAMES["768"].w).toBe("400px");
    expect(FRAMES["768"].label).toBe("Landing — 768 × 3860");
    expect(FRAMES["768"].cardCols).toBe("1fr 1fr");
  });

  it("375 is single-column", () => {
    expect(FRAMES["375"].w).toBe("260px");
    expect(FRAMES["375"].label).toBe("Landing — 375 × 5240");
    expect(FRAMES["375"].cardCols).toBe("1fr");
  });
});

describe("source hints", () => {
  it("covers the three sources with the design copy (Screenshot import is gone)", () => {
    expect(Object.keys(SOURCE_HINTS).sort()).toEqual(["area", "html", "url"]);
    expect(SOURCE_HINTS.url).toBe(
      "https://northwind.example/pricing — public pages, fetched and parsed live.",
    );
    expect(SOURCE_HINTS.html).toBe(
      "Paste markup and styles straight from devtools, or a saved page.",
    );
    expect(SOURCE_HINTS.area).toBe(
      "Draw a rectangle on the page in the browser extension; only that region imports.",
    );
  });
});

describe("font stack", () => {
  it("plugin fonts import as Inter", () => {
    expect(getFontStack("plugin")).toBe("Inter, system-ui, sans-serif");
  });

  it("site fonts keep the source serif", () => {
    expect(getFontStack("website")).toBe("Georgia, 'Times New Roman', serif");
  });
});

describe("layers", () => {
  it("derives the eight design layers in order", () => {
    const layers = deriveLayers(DEFAULT_CONSOLE_STATE);
    expect(layers.map((l) => l.name)).toEqual([
      "Landing — 1440",
      "nav",
      "hero",
      "heading",
      "paragraph",
      "button",
      "media",
      "cards",
    ]);
    expect(layers[0].tag).toBe("frame");
  });

  it("tags structural frames with the layout mode", () => {
    const auto = deriveLayers(DEFAULT_CONSOLE_STATE);
    expect(auto[1].tag).toBe("auto layout");
    expect(auto[7].tag).toBe("auto layout · 3");

    const absolute = deriveLayers({ ...DEFAULT_CONSOLE_STATE, layout: "absolute" });
    expect(absolute[2].tag).toBe("absolute");
    expect(absolute[7].tag).toBe("absolute · 3");
  });

  it("heading is text · h1 only with real copy", () => {
    expect(deriveLayers(DEFAULT_CONSOLE_STATE)[3].tag).toBe("text");
    expect(
      deriveLayers({ ...DEFAULT_CONSOLE_STATE, text: "website" })[3].tag,
    ).toBe("text · h1");
  });

  it("media tag follows the assets mode", () => {
    expect(deriveLayers(DEFAULT_CONSOLE_STATE)[6].tag).toBe("placeholder");
    expect(
      deriveLayers({ ...DEFAULT_CONSOLE_STATE, assets: "real" })[6].tag,
    ).toBe("image · fill");
  });

  it("button tag shows the accent as hex with direct values", () => {
    expect(deriveLayers(DEFAULT_CONSOLE_STATE)[5].tag).toBe("#54524E");
    expect(
      deriveLayers({ ...DEFAULT_CONSOLE_STATE, colors: "website" })[5].tag,
    ).toBe("#2F5FD8");
  });

  it("button tag shows a variable name with figma variables", () => {
    expect(
      deriveLayers({ ...DEFAULT_CONSOLE_STATE, vars: "figma" })[5].tag,
    ).toBe("color/accent");
    expect(
      deriveLayers({
        ...DEFAULT_CONSOLE_STATE,
        vars: "figma",
        colors: "website",
      })[5].tag,
    ).toBe("--color-primary");
  });

  it("frame layer name follows the viewport", () => {
    expect(
      deriveLayers({ ...DEFAULT_CONSOLE_STATE, viewport: "375" })[0].name,
    ).toBe("Landing — 375");
  });
});

describe("layer note", () => {
  it("switches on layout mode", () => {
    expect(deriveLayerNote("auto")).toBe(
      "Sections, rows and columns arrive as auto layout frames with the spacing they had on the page.",
    );
    expect(deriveLayerNote("absolute")).toBe(
      "Every layer keeps the exact x/y it was captured at — a faithful snapshot that won't reflow.",
    );
  });
});

describe("summary", () => {
  it("reads viewport, layout, palette and vars separated by dots", () => {
    expect(deriveSummary(DEFAULT_CONSOLE_STATE)).toBe(
      "1440px  ·  auto layout  ·  plugin palette  ·  direct values",
    );
  });

  it("reflects every non-default choice", () => {
    expect(
      deriveSummary({
        ...DEFAULT_CONSOLE_STATE,
        viewport: "768",
        layout: "absolute",
        colors: "website",
        vars: "figma",
      }),
    ).toBe("768px  ·  absolute  ·  site palette  ·  figma variables");
  });
});
