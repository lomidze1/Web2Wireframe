/**
 * enrichAllTextNodes — isCustomFont gate (TDD)
 *
 * Server-side (Linux Chromium) CSS.getPlatformFontsForNode returns system
 * fallback families ("Liberation Sans", "Noto Sans CJK JP") for text that
 * renders with a font not shipped as @font-face. Overriding the content
 * script's CSS-declared `font` with those names stamps un-installable
 * rebind markers in the plugin ("waiting for: Liberation Sans" forever).
 *
 * Gate: the platform familyName may only replace `font` when the platform
 * font is a real web font (`isCustomFont: true`). System fallbacks keep the
 * content-script "Family Weight" string. `platformFont` metadata is stamped
 * unconditionally in both cases.
 */

import { describe, it, expect } from "vitest";
import { enrichAllTextNodes } from "../src/lib/cdp/w2w-extraction.js";
import type { W2WFrameNode, W2WTextNode } from "@w2w/shared";

// ============================================================================
// Helpers — minimal synthetic W2W tree (pure function, no CDP mock needed)
// ============================================================================

const GEO = { x: 0, y: 0, width: 100, height: 20, quad: [0, 0, 100, 0, 100, 20, 0, 20] as W2WTextNode["quad"] };

function textNode(font: string): W2WTextNode {
  return { ...GEO, type: "TEXT", value: "hello", font };
}

function frameNode(children: W2WFrameNode["children"]): W2WFrameNode {
  return {
    ...GEO,
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("enrichAllTextNodes — isCustomFont gate", () => {
  it("overrides font with platform familyName when isCustomFont is true", () => {
    const t = textNode("Inter Medium");
    const root = frameNode([frameNode([t])]);
    const fontsByIdx = new Map([
      [0, { familyName: "Inter", postScriptName: "Inter-Medium", isCustomFont: true }],
    ]);

    enrichAllTextNodes(root, fontsByIdx);

    expect(t.font).toBe("Inter");
    expect(t.platformFont).toEqual({ familyName: "Inter", postScriptName: "Inter-Medium" });
  });

  it("keeps content-script font when platform font is a system fallback (isCustomFont false)", () => {
    const t = textNode("Space Grotesk Light");
    const root = frameNode([frameNode([t])]);
    const fontsByIdx = new Map([
      [0, { familyName: "Liberation Sans", postScriptName: "LiberationSans", isCustomFont: false }],
    ]);

    enrichAllTextNodes(root, fontsByIdx);

    // CSS-declared "Family Weight" string survives — no un-installable marker later.
    expect(t.font).toBe("Space Grotesk Light");
    // Metadata still recorded unconditionally.
    expect(t.platformFont).toEqual({ familyName: "Liberation Sans", postScriptName: "LiberationSans" });
  });

  it("walks text-host frames in DFS order (idx per frame with text children)", () => {
    const t1 = textNode("Inter Regular");
    const t2 = textNode("Arial");
    // Root has no direct TEXT children → does not consume an idx.
    const root = frameNode([frameNode([t1]), frameNode([t2])]);
    const fontsByIdx = new Map([
      [0, { familyName: "Inter", postScriptName: "Inter-Regular", isCustomFont: true }],
      [1, { familyName: "Noto Sans CJK JP", postScriptName: "NotoSansCJKjp", isCustomFont: false }],
    ]);

    enrichAllTextNodes(root, fontsByIdx);

    expect(t1.font).toBe("Inter");
    expect(t2.font).toBe("Arial"); // fallback platform font did not clobber CSS family
    expect(t2.platformFont?.familyName).toBe("Noto Sans CJK JP");
  });

  it("leaves text untouched when no platform font was collected for its host", () => {
    const t = textNode("Georgia Bold");
    const root = frameNode([frameNode([t])]);

    enrichAllTextNodes(root, new Map());

    expect(t.font).toBe("Georgia Bold");
    expect(t.platformFont).toBeUndefined();
  });
});

// ============================================================================
// enrichAllTextNodes — გაფუჭებული `name` ცხრილის დამცავი
// ============================================================================

/**
 * ფონტის `name` ცხრილში ოჯახის ველი (ID 1) ზოგჯერ საავტორო სტრიქონითაა
 * შევსებული. Chromium მას პატიოსნად აბრუნებს — გაზომილი stripe.com-ზე:
 *
 *   familyName="Copyright Klim Type Foundry"  postScriptName="SohneVF-Buch"
 *   isCustomFont=true  glyphCount=2751
 *
 * `isCustomFont` gate ასეთს ვერ იჭერს (ნამდვილი web font-ია), ამიტომ სტრიქონი
 * `font`-ად ეწერებოდა და მომხმარებელს „Fonts Not Available" სიაში ხვდებოდა.
 *
 * მოსალოდნელი ქცევა: გაზომვა მთლიანად უგულებელვყოთ — არც `font`, არც
 * `platformFont` — რომ CSS-ში დეკლარირებული სახელი გადარჩეს. იგივე წესი
 * მოქმედებს tree-builder-ში obfuscated ფონტებზე.
 */
describe("enrichAllTextNodes — საავტორო ტექსტი familyName-ში", () => {
  it("არ ცვლის font-ს, როცა familyName საავტორო სტრიქონია", () => {
    const t = textNode("sohne-var");
    const root = frameNode([frameNode([t])]);
    const fontsByIdx = new Map([
      [
        0,
        {
          familyName: "Copyright Klim Type Foundry",
          postScriptName: "SohneVF-Buch",
          isCustomFont: true,
        },
      ],
    ]);

    enrichAllTextNodes(root, fontsByIdx);

    expect(t.font).toBe("sohne-var"); // CSS-ის სახელი გადარჩა
  });

  it("არც platformFont-ს stamp-ავს საავტორო სტრიქონით", () => {
    const t = textNode("sohne-var");
    const root = frameNode([frameNode([t])]);
    const fontsByIdx = new Map([
      [
        0,
        {
          familyName: "Copyright Klim Type Foundry",
          postScriptName: "SohneVF-Buch",
          isCustomFont: true,
        },
      ],
    ]);

    enrichAllTextNodes(root, fontsByIdx);

    expect(t.platformFont?.familyName).not.toBe("Copyright Klim Type Foundry");
  });

  it("ნამდვილ web font-ს ისევე stamp-ავს, როგორც აქამდე (რეგრესია არ არის)", () => {
    const t = textNode("Inter Medium");
    const root = frameNode([frameNode([t])]);
    const fontsByIdx = new Map([
      [0, { familyName: "Inter", postScriptName: "Inter-Medium", isCustomFont: true }],
    ]);

    enrichAllTextNodes(root, fontsByIdx);

    expect(t.font).toBe("Inter");
    expect(t.platformFont?.familyName).toBe("Inter");
  });
});

/**
 * vaayu.tech (URL import 2026-09-18): the content script tags a host AFTER its
 * children (post-order) and never tags the synthesized `__w2w-pseudo-*`
 * wrappers. Counting pre-order gave every heading its nested `<em>`'s font —
 * "Tobias Italic" — and nine upright headings rendered entirely in italic. The
 * extension's walk was fixed on 2026-09-08; this is the same numbering.
 */
describe("enrichAllTextNodes — numbering matches the content script", () => {
  const ITALIC = { familyName: "Tobias Italic", postScriptName: "Tobias_Regular_Italic", isCustomFont: true };
  const UPRIGHT = { familyName: "Tobias", postScriptName: "Tobias_Regular", isCustomFont: true };

  it("numbers a nested host before its parent (post-order)", () => {
    const heading = textNode("Tobias");
    const inEm = textNode("Tobias");
    const root = frameNode([frameNode([heading, frameNode([inEm])])]);

    enrichAllTextNodes(root, new Map([[0, ITALIC], [1, UPRIGHT]]));

    expect(inEm.platformFont?.familyName).toBe("Tobias Italic");
    expect(heading.platformFont?.familyName).toBe("Tobias");
    expect(heading.font).toBe("Tobias");
  });

  it("skips synthesized pseudo-element wrappers, which carry no index", () => {
    const pseudo = { ...frameNode([textNode("Inter")]), classList: ["__w2w-pseudo-before"] };
    const label = textNode("Tobias");
    const root = frameNode([pseudo, frameNode([label])]);

    enrichAllTextNodes(root, new Map([[0, UPRIGHT]]));

    expect(label.platformFont?.familyName).toBe("Tobias");
  });
});
