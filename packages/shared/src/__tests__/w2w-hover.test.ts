/**
 * Tests for w2wFindInteractiveNodes — shared hover capture utility.
 */
import { describe, it, expect, vi } from "vitest";
import {
  w2wFindInteractiveNodes,
  w2wFindHoverCandidates,
  escapeCssClass,
  parseHoverSelectorsFromCssText,
  splitHoverSelector,
  findNodeBySelector,
  attachHoverToDescendants,
} from "../w2w-hover";
import type { W2WFrameNode } from "../w2w-types";

function makeFrame(overrides: Partial<W2WFrameNode> & { tag: string }): W2WFrameNode {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 44,
    quad: [0, 0, 100, 0, 100, 44, 0, 44],
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

describe("w2wFindInteractiveNodes", () => {
  it("finds <a> elements", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", classList: ["link"], attr: { href: "/page" } }),
        makeFrame({ tag: "div" }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result).toHaveLength(1);
    expect(result[0].node.tag).toBe("a");
  });

  it("finds <button> and <input> elements", () => {
    const tree = makeFrame({
      tag: "form",
      children: [
        makeFrame({ tag: "input", attr: { type: "text" } }),
        makeFrame({ tag: "button", classList: ["submit"] }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.node.tag)).toEqual(["input", "button"]);
  });

  it("finds [role=button] and [role=link]", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", attr: { role: "button" }, classList: ["btn"] }),
        makeFrame({ tag: "span", attr: { role: "link" }, classList: ["lnk"] }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result).toHaveLength(2);
  });

  it("builds #id selector", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", attr: { id: "nav-link" } }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result[0].selector).toBe("#nav-link");
  });

  it("builds tag.class1.class2 selector with all classes", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", classList: ["nav-link", "primary"] }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result[0].selector).toBe("a.nav-link.primary");
  });

  it("builds tag[href] selector when no classes/id", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", attr: { href: "/store" } }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result[0].selector).toBe('a[href="/store"]');
  });

  it("builds tag[role] selector as fallback", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", attr: { role: "button" } }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result[0].selector).toBe('div[role="button"]');
  });

  it("caps results at maxResults (Phase 2: default 500)", () => {
    const children = Array.from({ length: 550 }, (_, i) =>
      makeFrame({ tag: "a", classList: [`link-${i}`] })
    );
    const tree = makeFrame({ tag: "div", children });
    const result = w2wFindInteractiveNodes(tree);
    expect(result).toHaveLength(500);
  });

  it("warns when truncating beyond cap (Phase 2)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const children = Array.from({ length: 550 }, (_, i) =>
      makeFrame({ tag: "a", classList: [`link-${i}`] })
    );
    const tree = makeFrame({ tag: "div", children });
    w2wFindInteractiveNodes(tree);
    expect(warnSpy).toHaveBeenCalled();
    const msg = warnSpy.mock.calls[0]?.[0];
    expect(String(msg)).toMatch(/truncat/i);
    warnSpy.mockRestore();
  });

  it("caps results at custom maxResults", () => {
    const children = Array.from({ length: 10 }, (_, i) =>
      makeFrame({ tag: "a", classList: [`link-${i}`] })
    );
    const tree = makeFrame({ tag: "div", children });
    const result = w2wFindInteractiveNodes(tree, 5);
    expect(result).toHaveLength(5);
  });

  it("finds deeply nested interactive elements", () => {
    const tree = makeFrame({
      tag: "nav",
      children: [
        makeFrame({
          tag: "ul",
          children: [
            makeFrame({
              tag: "li",
              children: [
                makeFrame({ tag: "a", classList: ["deep-link"] }),
              ],
            }),
          ],
        }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result).toHaveLength(1);
    expect(result[0].node.classList).toContain("deep-link");
  });

  it("returns null selector when no id/class/href/role", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "button" }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result[0].selector).toBeNull();
  });

  it("ignores cursor and tabindex, which the capture never records", () => {
    // `cursor` is absent from the extension's CSS_PROPERTIES and `tabindex` is
    // never captured by extractAttributes, so both predicates only ever fired
    // on hand-built fixtures. Detection is tag/role only.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", classList: ["clickable"], styles: { cursor: "pointer" } }),
        makeFrame({ tag: "div", classList: ["focusable"], attr: { tabindex: "0" } }),
      ],
    });
    expect(w2wFindInteractiveNodes(tree)).toHaveLength(0);
  });

  it("detects role=option (Phase 2: align with shared/pseudo-states.ts)", () => {
    const tree = makeFrame({
      tag: "ul",
      children: [
        makeFrame({ tag: "li", attr: { role: "option" }, classList: ["opt"] }),
      ],
    });
    const result = w2wFindInteractiveNodes(tree);
    expect(result).toHaveLength(1);
  });
});

describe("escapeCssClass", () => {
  it("passes through normal class names", () => {
    expect(escapeCssClass("nav-link")).toBe("nav-link");
  });

  it("escapes dots", () => {
    expect(escapeCssClass("my.class")).toBe("my\\.class");
  });

  it("escapes colons", () => {
    expect(escapeCssClass("hover:bg-blue")).toBe("hover\\:bg-blue");
  });
});

describe("parseHoverSelectorsFromCssText", () => {
  it("extracts .btn:hover from single rule", () => {
    expect(parseHoverSelectorsFromCssText(".btn:hover")).toEqual([".btn:hover"]);
  });

  it("extracts multiple :hover selectors from comma-separated list", () => {
    const result = parseHoverSelectorsFromCssText(".a:hover, .b:hover, .c");
    expect(result).toEqual([".a:hover", ".b:hover"]);
  });

  it("handles :hover with descendant combinator", () => {
    expect(parseHoverSelectorsFromCssText(".nav:hover .icon")).toEqual([
      ".nav:hover .icon",
    ]);
  });

  it("handles :hover with direct child combinator", () => {
    expect(parseHoverSelectorsFromCssText(".nav:hover > .icon")).toEqual([
      ".nav:hover > .icon",
    ]);
  });

  it("ignores :not(:hover)", () => {
    expect(parseHoverSelectorsFromCssText(".btn:not(:hover)")).toEqual([]);
  });

  it("keeps ::before/::after pseudo-elements combined with :hover (Phase 2)", () => {
    // Phase 2: Apple nav uses `.link:hover::before { … }` for underline sweeps.
    // We keep these and let splitHoverSelector strip the pseudo-element from
    // the trigger so `forcePseudoState :hover` on the host still fires the
    // pseudo-element's transition.
    expect(parseHoverSelectorsFromCssText(".btn:hover::before")).toEqual([
      ".btn:hover::before",
    ]);
    expect(parseHoverSelectorsFromCssText(".btn:hover::after")).toEqual([
      ".btn:hover::after",
    ]);
  });

  it("handles multiple pseudo-classes (hover + focus)", () => {
    expect(parseHoverSelectorsFromCssText(".btn:hover:focus")).toEqual([
      ".btn:hover:focus",
    ]);
  });

  it("returns empty array for selector without :hover", () => {
    expect(parseHoverSelectorsFromCssText(".btn, .card")).toEqual([]);
  });

  it("handles whitespace variations", () => {
    const result = parseHoverSelectorsFromCssText("  .a:hover  ,  .b:hover  ");
    expect(result).toEqual([".a:hover", ".b:hover"]);
  });

  it("skips invalid selectors containing :hover inside :not()", () => {
    const result = parseHoverSelectorsFromCssText(
      ".a:hover, .b:not(:hover), .c:hover",
    );
    expect(result).toEqual([".a:hover", ".c:hover"]);
  });
});

describe("splitHoverSelector", () => {
  it("returns trigger=.btn, target=.btn for '.btn:hover'", () => {
    expect(splitHoverSelector(".btn:hover")).toEqual({
      trigger: ".btn",
      target: ".btn",
    });
  });

  it("returns trigger=.nav, target=.nav .icon for '.nav:hover .icon'", () => {
    expect(splitHoverSelector(".nav:hover .icon")).toEqual({
      trigger: ".nav",
      target: ".nav .icon",
    });
  });

  it("returns trigger=.card, target=.card > span for '.card:hover > span'", () => {
    expect(splitHoverSelector(".card:hover > span")).toEqual({
      trigger: ".card",
      target: ".card > span",
    });
  });

  it("strips trailing :focus when combined: .btn:hover:focus", () => {
    const result = splitHoverSelector(".btn:hover:focus");
    expect(result).not.toBeNull();
    expect(result!.trigger).toBe(".btn");
  });

  it("strips ::before/::after from trigger but keeps in target (Phase 2)", () => {
    // Phase 2: trigger = host, target = host + pseudo (for reference).
    // Forcing :hover on the host fires the ::before transition too.
    expect(splitHoverSelector(".btn:hover::before")).toEqual({
      trigger: ".btn",
      target: ".btn::before",
    });
    expect(splitHoverSelector(".card:hover::after")).toEqual({
      trigger: ".card",
      target: ".card::after",
    });
  });

  it("handles ::before BEFORE :hover — trigger = host (Phase 2)", () => {
    // Edge case: `.foo::before:hover` = when ::before itself is hovered.
    // We can't force :hover on a pseudo-element, so approximate by forcing
    // :hover on the host. Trigger drops both :hover and ::before.
    const result = splitHoverSelector(".foo::before:hover");
    expect(result).not.toBeNull();
    expect(result!.trigger).toBe(".foo");
  });

  it("handles compound :hover on tag.class form", () => {
    expect(splitHoverSelector("a.link:hover")).toEqual({
      trigger: "a.link",
      target: "a.link",
    });
  });

  it("handles #id:hover", () => {
    expect(splitHoverSelector("#main-btn:hover")).toEqual({
      trigger: "#main-btn",
      target: "#main-btn",
    });
  });
});

describe("findNodeBySelector", () => {
  it("finds by #id", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "a", attr: { id: "nav-link" } })],
    });
    const result = findNodeBySelector(tree, "#nav-link");
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("a");
  });

  it("finds by .class", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "span", classList: ["icon"] })],
    });
    const result = findNodeBySelector(tree, ".icon");
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("span");
  });

  it("finds by .class1.class2 (multiple classes)", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "button", classList: ["btn"] }),
        makeFrame({ tag: "button", classList: ["btn", "primary"] }),
      ],
    });
    const result = findNodeBySelector(tree, ".btn.primary");
    expect(result).not.toBeNull();
    expect(result!.classList).toEqual(["btn", "primary"]);
  });

  it("finds by tag", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "button" })],
    });
    const result = findNodeBySelector(tree, "button");
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("button");
  });

  it("finds by tag.class", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "span", classList: ["icon"] }),
        makeFrame({ tag: "a", classList: ["icon"] }),
      ],
    });
    const result = findNodeBySelector(tree, "a.icon");
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("a");
  });

  it("returns null for no match", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "span", classList: ["foo"] })],
    });
    expect(findNodeBySelector(tree, ".bar")).toBeNull();
  });

  it("returns first match in DFS order", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", classList: ["link"], attr: { id: "first" } }),
        makeFrame({ tag: "a", classList: ["link"], attr: { id: "second" } }),
      ],
    });
    const result = findNodeBySelector(tree, ".link");
    expect(result!.attr?.id).toBe("first");
  });

  it("handles CSS-escaped class names (Tailwind md\\:hidden)", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "div", classList: ["md:hidden"] })],
    });
    const result = findNodeBySelector(tree, ".md\\:hidden");
    expect(result).not.toBeNull();
  });

  // --- Phase 2: combinator & attribute-selector support ---

  it("resolves selector with descendant combinator — matches rightmost compound", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({
          tag: "nav",
          attr: { id: "globalnav" },
          children: [
            makeFrame({ tag: "a", classList: ["globalnav-link"] }),
          ],
        }),
      ],
    });
    // Apple-shaped: `#globalnav .globalnav-link` — rightmost = `.globalnav-link`.
    const result = findNodeBySelector(tree, "#globalnav .globalnav-link");
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("a");
  });

  it("resolves selector with child combinator (>)", () => {
    const tree = makeFrame({
      tag: "ul",
      children: [
        makeFrame({ tag: "li", classList: ["item"] }),
      ],
    });
    const result = findNodeBySelector(tree, "ul > li.item");
    expect(result!.tag).toBe("li");
  });

  it("resolves selector with sibling combinators (+, ~)", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "span", classList: ["a"] }),
        makeFrame({ tag: "span", classList: ["b"] }),
      ],
    });
    expect(findNodeBySelector(tree, ".a + .b")!.classList).toContain("b");
    expect(findNodeBySelector(tree, ".a ~ .b")!.classList).toContain("b");
  });

  it("resolves [href] attribute-presence selector", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", attr: { href: "/page" } }),
        makeFrame({ tag: "a" }), // no href
      ],
    });
    const result = findNodeBySelector(tree, "a[href]");
    expect(result).not.toBeNull();
    expect(result!.attr?.href).toBe("/page");
  });

  it("resolves [attr=\"value\"] equality selector", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", attr: { href: "/foo" } }),
        makeFrame({ tag: "a", attr: { href: "/bar" } }),
      ],
    });
    const result = findNodeBySelector(tree, 'a[href="/bar"]');
    expect(result!.attr?.href).toBe("/bar");
  });

  it("resolves [data-*] attribute selectors", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", attr: { "data-focus-method": "key" } }),
      ],
    });
    const result = findNodeBySelector(tree, 'div[data-focus-method="key"]');
    expect(result).not.toBeNull();
  });

  it("combines attribute + class: a.link[href=\"/x\"]", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", classList: ["link"], attr: { href: "/x" } }),
        makeFrame({ tag: "a", classList: ["link"], attr: { href: "/y" } }),
      ],
    });
    const result = findNodeBySelector(tree, 'a.link[href="/x"]');
    expect(result!.attr?.href).toBe("/x");
  });
});

describe("w2wFindHoverCandidates", () => {
  it("takes nothing but interactive tags when there is no selector to go on", () => {
    // An <a> or <button> is not evidence of a hover state, and storing a full
    // re-serialized subtree for every one of them is what made 79% of a
    // stripe.com capture hover payload. But zero selectors usually means the
    // stylesheets were UNREADABLE (cross-origin CSS throws on `.cssRules`),
    // not that the page has no hover styling — so the interactive pool stays
    // as the floor for that case, bounded, and nothing else comes with it.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "button", classList: ["submit"] }),
        makeFrame({ tag: "div", classList: ["card"] }),
      ],
    });

    const result = w2wFindHoverCandidates(tree);

    expect(result.map((r) => r.node.tag)).toEqual(["button"]);
  });

  it("drops the link farm entirely once the page's own CSS can be read", () => {
    // The blowup case: 50 links the stylesheet never mentions. As soon as ONE
    // selector is collected, the pool is out of the picture and only what the
    // CSS asks for is captured.
    const children = Array.from({ length: 50 }, (_, i) =>
      makeFrame({ tag: "a", classList: [`link-${i}`], attr: { href: `/p/${i}` } }),
    );
    children.push(makeFrame({ tag: "div", classList: ["card"] }));
    const tree = makeFrame({ tag: "nav", children });

    const result = w2wFindHoverCandidates(tree, [".card"]);

    expect(result).toHaveLength(1);
    expect(result[0].node.classList).toContain("card");
  });

  it("returns EVERY node a :hover selector matches, not just the first", () => {
    // `.card:hover` styles all three cards. Non-interactive tags on purpose:
    // with <button> the blanket tag pool would satisfy this test without the
    // selector ever matching more than its first node.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", classList: ["card"], attr: { id: "a" } }),
        makeFrame({ tag: "div", classList: ["card"], attr: { id: "b" } }),
        makeFrame({
          tag: "section",
          children: [makeFrame({ tag: "div", classList: ["card"], attr: { id: "c" } })],
        }),
      ],
    });
    const result = w2wFindHoverCandidates(tree, [".card"]);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.node.attr?.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps an interactive tag when a :hover selector actually targets it", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "button", classList: ["submit"] }),
        makeFrame({ tag: "div", classList: ["card"] }),
      ],
    });
    const result = w2wFindHoverCandidates(tree, [".submit"]);
    expect(result).toHaveLength(1);
    expect(result[0].node.tag).toBe("button");
  });

  it("dedupes a node matched by two different selectors", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "button", classList: ["submit", "primary"] })],
    });
    const result = w2wFindHoverCandidates(tree, [".submit", ".primary"]);
    expect(result).toHaveLength(1);
    expect(result[0].node.tag).toBe("button");
  });

  it("caps results at maxResults", () => {
    const children = Array.from({ length: 250 }, (_, i) =>
      makeFrame({ tag: "div", classList: [`card-${i}`] }),
    );
    const tree = makeFrame({ tag: "div", children });
    const extraSelectors = children.map((_, i) => `.card-${i}`);
    const result = w2wFindHoverCandidates(tree, extraSelectors, 150);
    expect(result).toHaveLength(150);
  });

  it("builds a selector for extra-matched nodes", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "div", classList: ["card"] })],
    });
    const result = w2wFindHoverCandidates(tree, [".card"]);
    expect(result).toHaveLength(1);
    expect(result[0].selector).toBe("div.card");
  });

  it("skips extra selectors that don't match any tree node", () => {
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "div", classList: ["card"] })],
    });
    const result = w2wFindHoverCandidates(tree, [".nonexistent"]);
    expect(result).toHaveLength(0);
  });

  it("default cap is 500 (Phase 2: raised from 200)", () => {
    const children = Array.from({ length: 600 }, (_, i) =>
      makeFrame({ tag: "a", classList: [`link-${i}`] }),
    );
    const tree = makeFrame({ tag: "div", children });
    const result = w2wFindHoverCandidates(
      tree,
      children.map((_, i) => `.link-${i}`),
    );
    expect(result).toHaveLength(500);
  });

  it("caps a single selector that matches more nodes than the budget", () => {
    // One `.row:hover` rule over a 300-row table must not blow past the cap.
    // Rows carry their own id here: without one they all build the SAME probe
    // selector and collapse to a single candidate (see the dedupe suite).
    const children = Array.from({ length: 300 }, (_, i) =>
      makeFrame({ tag: "tr", classList: ["row"], attr: { id: `r${i}` } }),
    );
    const tree = makeFrame({ tag: "table", children });
    const result = w2wFindHoverCandidates(tree, [".row"], 100);
    expect(result).toHaveLength(100);
  });

  it("collapses a 300-row table with no ids to one probe", () => {
    // The same table as above, as real markup usually is. 300 identical
    // `tr.row` probes cost 300 CDP round trips and return the first row's
    // subtree 300 times.
    const children = Array.from({ length: 300 }, () =>
      makeFrame({ tag: "tr", classList: ["row"] }),
    );
    const tree = makeFrame({ tag: "table", children });

    expect(w2wFindHoverCandidates(tree, [".row"], 100)).toHaveLength(1);
  });

  it("resolves extra selectors using descendant combinators (Phase 2)", () => {
    // Apple-style: selector from stylesheet comes as `#globalnav .globalnav-link`.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({
          tag: "nav",
          attr: { id: "globalnav" },
          children: [
            makeFrame({ tag: "a", classList: ["globalnav-link"] }),
          ],
        }),
      ],
    });
    const result = w2wFindHoverCandidates(tree, [
      "#globalnav .globalnav-link",
    ]);
    expect(result.some((r) => r.node.classList.includes("globalnav-link"))).toBe(
      true,
    );
  });
});

describe("attachHoverToDescendants (FIX 4)", () => {
  it("attaches hover to matching children (index + tag)", () => {
    const normalChild = makeFrame({ tag: "div", classList: ["curtain"] });
    const hoverChild = makeFrame({
      tag: "div",
      classList: ["curtain"],
      styles: { opacity: 1 },
    });
    const normal = makeFrame({
      tag: "li",
      classList: ["nav-item"],
      children: [normalChild],
    });
    const hover = makeFrame({
      tag: "li",
      classList: ["nav-item"],
      children: [hoverChild],
    });

    attachHoverToDescendants(normal, hover);
    expect(normalChild.hover).toBe(hoverChild);
  });

  it("attaches hover to grandchildren (deep recursion)", () => {
    const gcNormal = makeFrame({ tag: "span", classList: ["label"] });
    const gcHover = makeFrame({
      tag: "span",
      classList: ["label"],
      styles: { color: "rgb(255,0,0)" },
    });
    const cNormal = makeFrame({
      tag: "div",
      children: [gcNormal],
    });
    const cHover = makeFrame({
      tag: "div",
      children: [gcHover],
    });
    const normal = makeFrame({ tag: "section", children: [cNormal] });
    const hover = makeFrame({ tag: "section", children: [cHover] });

    attachHoverToDescendants(normal, hover);
    expect(cNormal.hover).toBe(cHover);
    expect(gcNormal.hover).toBe(gcHover);
  });

  it("skips child pair where tags differ", () => {
    const normalChild = makeFrame({ tag: "div" });
    const hoverChild = makeFrame({ tag: "span" });
    const normal = makeFrame({ tag: "section", children: [normalChild] });
    const hover = makeFrame({ tag: "section", children: [hoverChild] });

    attachHoverToDescendants(normal, hover);
    expect(normalChild.hover).toBeUndefined();
  });

  it("handles empty normal.children or empty hover.children", () => {
    const normal = makeFrame({ tag: "div", children: [] });
    const hover = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "span" })],
    });
    expect(() => attachHoverToDescendants(normal, hover)).not.toThrow();

    const normal2 = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "span" })],
    });
    const hover2 = makeFrame({ tag: "div", children: [] });
    expect(() => attachHoverToDescendants(normal2, hover2)).not.toThrow();
  });

  it("handles hover child array shorter than normal child array", () => {
    const n1 = makeFrame({ tag: "a" });
    const n2 = makeFrame({ tag: "b" });
    const h1 = makeFrame({ tag: "a" });
    const normal = makeFrame({ tag: "div", children: [n1, n2] });
    const hover = makeFrame({ tag: "div", children: [h1] });

    attachHoverToDescendants(normal, hover);
    expect(n1.hover).toBe(h1);
    expect(n2.hover).toBeUndefined(); // no pair
  });

  it("idempotent: calling twice produces same result", () => {
    const nc = makeFrame({ tag: "div" });
    const hc = makeFrame({ tag: "div" });
    const normal = makeFrame({ tag: "section", children: [nc] });
    const hover = makeFrame({ tag: "section", children: [hc] });

    attachHoverToDescendants(normal, hover);
    const firstHover = nc.hover;
    attachHoverToDescendants(normal, hover);
    expect(nc.hover).toBe(firstHover);
  });

  it("leaves non-FRAME children untouched (TEXT nodes have no hover)", () => {
    // W2WTextNode is a separate type; attachHoverToDescendants should only
    // recurse into FRAME children. A tree with a TEXT child should not crash.
    const textChild = { type: "TEXT" as const, value: "hi" };
    const normal: W2WFrameNode = makeFrame({
      tag: "div",
       
      children: [textChild as any],
    });
    const hover: W2WFrameNode = makeFrame({
      tag: "div",
       
      children: [textChild as any],
    });
    expect(() => attachHoverToDescendants(normal, hover)).not.toThrow();
  });

  it("curtain end-to-end: nav item has empty self diff but child has hover", () => {
    // Realistic apple.com nav-item/curtain scenario.
    const curtainNormal = makeFrame({
      tag: "div",
      attr: { id: "globalnav-curtain" },
      styles: { opacity: 0, visibility: "hidden" },
    });
    const curtainHover = makeFrame({
      tag: "div",
      attr: { id: "globalnav-curtain" },
      styles: { opacity: 1, visibility: "visible" },
    });
    const navItemNormal = makeFrame({
      tag: "li",
      classList: ["globalnav-item"],
      children: [curtainNormal],
    });
    const navItemHover = makeFrame({
      tag: "li",
      classList: ["globalnav-item"],
      children: [curtainHover],
    });
    // The caller (background/api) already assigns hover to the ROOT:
    navItemNormal.hover = navItemHover;

    attachHoverToDescendants(navItemNormal, navItemHover);

    // Root unchanged
    expect(navItemNormal.hover).toBe(navItemHover);
    // Child now has hover pointing to the visible curtain
    expect(curtainNormal.hover).toBe(curtainHover);
    expect(curtainNormal.hover?.styles.opacity).toBe(1);
  });
});

/**
 * Two consequences of deriving candidates from stylesheet selectors alone.
 *
 * 1. `buildSelectorForNode` emits the SAME string for every id-less node that
 *    shares a tag and classes — three sibling `div.card` all become
 *    "div.card". Both consumers resolve it with a first-match-only query
 *    (`DOM.querySelector` in the extension, `document.querySelector` inside
 *    `extractSubtree`), so cards 2 and 3 are handed CARD 1's subtree, its
 *    absolute geometry included, after paying a full probe each —
 *    querySelector + two forcePseudoState round trips + a 16ms settle + a
 *    subtree extraction. A `.row:hover` rule over a 300-row table went from
 *    one probe to 300, and the extension's loop has no time budget.
 *
 * 2. A page whose CSS is served cross-origin throws SecurityError on
 *    `cssRules`, so `collectHoverSelectors` returns nothing — and with the
 *    interactive pool gone, nothing means NO hover capture at all. The pool
 *    is worth keeping exactly there: as a floor when the stylesheets could
 *    not be read.
 */
describe("hover candidates are one probe per distinct selector", () => {
  it("returns one candidate for id-less siblings that share a selector", () => {
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", classList: ["card"] }),
        makeFrame({ tag: "div", classList: ["card"] }),
        makeFrame({ tag: "div", classList: ["card"] }),
      ],
    });

    const result = w2wFindHoverCandidates(tree, [".card"]);

    expect(result).toHaveLength(1);
    expect(result[0].selector).toBe("div.card");
  });

  it("keeps every node a selector matches when they are tellable apart", () => {
    // The reason findNodesBySelector returns all matches in the first place.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "div", classList: ["card"], attr: { id: "a" } }),
        makeFrame({ tag: "div", classList: ["card"], attr: { id: "b" } }),
      ],
    });

    const result = w2wFindHoverCandidates(tree, [".card"]);

    expect(result.map((r) => r.selector).sort()).toEqual(["#a", "#b"]);
  });

  it("never returns a candidate the consumers would skip", () => {
    // A node with no id, no classes, no href and no role has no selector at
    // all; both consumers `continue` past it. Carrying it only inflated the
    // count and ate the cap.
    const tree = makeFrame({
      tag: "div",
      children: [makeFrame({ tag: "div" })],
    });

    expect(w2wFindHoverCandidates(tree, ["div"])).toEqual([]);
  });

  it("does not let one selector's duplicates starve another selector", () => {
    const children = Array.from({ length: 40 }, () =>
      makeFrame({ tag: "div", classList: ["row"] }),
    );
    children.push(makeFrame({ tag: "button", classList: ["cta"] }));
    const tree = makeFrame({ tag: "div", children });

    const result = w2wFindHoverCandidates(tree, [".row", ".cta"], 2);

    expect(result.map((r) => r.selector)).toEqual(["div.row", "button.cta"]);
  });
});

describe("hover falls back when the stylesheets could not be read", () => {
  it("uses the interactive pool when no selector was collected", () => {
    // apple.com and every other CDN-CSS page: `cssRules` throws SecurityError,
    // `collectHoverSelectors` returns [], and without this the capture ships
    // no hover states at all.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "button", classList: ["submit"] }),
        makeFrame({ tag: "div", classList: ["card"] }),
      ],
    });

    const result = w2wFindHoverCandidates(tree, []);

    expect(result).toHaveLength(1);
    expect(result[0].node.tag).toBe("button");
  });

  it("does NOT fall back once a single selector was collected", () => {
    // stripe.com's 1154 subtrees came from unioning the pool in unconditionally.
    // A page whose CSS we could read gets exactly what its CSS asks for.
    const tree = makeFrame({
      tag: "div",
      children: [
        makeFrame({ tag: "a", classList: ["nav-link"], attr: { href: "/a" } }),
        makeFrame({ tag: "a", classList: ["nav-link"], attr: { href: "/b" } }),
        makeFrame({ tag: "div", classList: ["card"] }),
      ],
    });

    const result = w2wFindHoverCandidates(tree, [".card"]);

    expect(result).toHaveLength(1);
    expect(result[0].node.classList).toContain("card");
  });

  it("bounds the fallback so a link farm cannot flood the payload", () => {
    const children = Array.from({ length: 400 }, (_, i) =>
      makeFrame({ tag: "a", classList: [`link-${i}`], attr: { href: `/p/${i}` } }),
    );
    const tree = makeFrame({ tag: "nav", children });

    const result = w2wFindHoverCandidates(tree, []);

    expect(result.length).toBeLessThanOrEqual(150);
  });
});

