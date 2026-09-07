/**
 * Unit tests for the tree comparison in diff.mjs.
 *
 * Run:  node --test tools/figma-tree-dump/diff.test.mjs
 *
 * Fixtures are inline on purpose: dumps/ is gitignored, so a test may not lean
 * on a real dump file. The real pair is the manual acceptance check in README.
 *
 * diff.mjs only runs its CLI when it is the process entry point, so importing
 * it here just defines the pure functions.
 */

import test from "node:test";
import assert from "node:assert";

import {
  collapse,
  similarity,
  matchTrees,
  compareNode,
  diffTrees,
  diffText,
  orientPair,
  renderReport,
} from "./diff.mjs";

let seq = 0;
function box(type, x, y, w, h, over = {}) {
  seq += 1;
  return {
    id: `n:${seq}`,
    name: type,
    type,
    absoluteBoundingBox: { x, y, width: w, height: h },
    ...over,
  };
}
const frame = (x, y, w, h, over) => box("FRAME", x, y, w, h, over);
const text = (x, y, w, h, characters, over) =>
  box("TEXT", x, y, w, h, { characters, fontSize: 16, ...over });

/** Deep-clones a fixture and shifts every box by (dx, dy). */
function shift(node, dx, dy) {
  const b = node.absoluteBoundingBox;
  return {
    ...node,
    absoluteBoundingBox: { ...b, x: b.x + dx, y: b.y + dy },
    ...(node.children ? { children: node.children.map((c) => shift(c, dx, dy)) } : {}),
  };
}

const has = (findings, category) => findings.filter((f) => f.category === category);

// ---------------------------------------------------------------------------
// collapse
// ---------------------------------------------------------------------------

test("collapse drops a single-child wrapper that shares one axis", () => {
  // h2d wraps heading text in frames that w2w does not create; the heights match.
  const inner = text(0, 0, 471, 116, "Hi");
  const wrapper = frame(0, 0, 1234, 116, { name: "h2.hds-heading", children: [inner] });

  const out = collapse(wrapper);

  assert.equal(out.type, "TEXT");
  assert.deepEqual(out._collapsed, ["h2.hds-heading"]);
});

test("collapse keeps a container whose only child is genuinely smaller", () => {
  const button = frame(0, 0, 32, 32, { name: "Button" });
  const row = frame(0, 0, 1264, 183, { name: "Row", children: [button] });

  const out = collapse(row);

  assert.equal(out.name, "Row");
  assert.equal(out.children.length, 1);
  assert.deepEqual(out._collapsed, []);
});

// ---------------------------------------------------------------------------
// similarity + matchTrees
// ---------------------------------------------------------------------------

test("similarity refuses to pair across type classes", () => {
  const parent = frame(0, 0, 100, 100);
  const a = frame(0, 0, 50, 50);
  const b = text(0, 0, 50, 50, "x");

  assert.equal(similarity(a, b, parent, parent), 0);
});

test("identical trees match completely and report nothing", () => {
  const build = () =>
    frame(0, 0, 200, 100, {
      name: "Root",
      children: [text(0, 0, 80, 20, "one"), text(0, 40, 80, 20, "two")],
    });

  const diff = diffTrees(build(), build());

  assert.equal(diff.stats.aOnly, 0);
  assert.equal(diff.stats.bOnly, 0);
  assert.equal(diff.findings.length, 0);
});

test("a subtree pushed down still matches — position is parent-relative", () => {
  const a = frame(0, 0, 400, 400, {
    name: "Root",
    children: [
      frame(0, 0, 400, 100, {
        name: "Head",
        children: [text(10, 10, 80, 20, "title")],
      }),
    ],
  });
  // The whole Head subtree slides 54px down, exactly like a heading overflow.
  const b = {
    ...a,
    children: [shift(a.children[0], 0, 54)],
  };

  const { pairs, aOnly, bOnly } = matchTrees(a, b);

  assert.equal(aOnly.length, 0);
  assert.equal(bOnly.length, 0);
  assert.equal(pairs.length, 3); // root + Head + title
});

test("reordered children are one order finding, not missing + extra", () => {
  const gradient = frame(0, 0, 200, 100, { name: "Gradient" });
  const content = frame(0, 0, 180, 90, { name: "Content" });
  const a = frame(0, 0, 200, 100, { name: "Root", children: [gradient, content] });
  const b = frame(0, 0, 200, 100, { name: "Root", children: [content, gradient] });

  const diff = diffTrees(a, b);

  assert.equal(diff.stats.aOnly, 0);
  assert.equal(diff.stats.bOnly, 0);
  const order = has(diff.findings, "child-order");
  assert.equal(order.length, 1);
  assert.equal(order[0].severity, "high");
});

test("a node only in the reference is reported once, subtree included", () => {
  const a = frame(0, 0, 200, 100, {
    name: "Root",
    children: [
      text(0, 0, 80, 20, "kept"),
      frame(0, 40, 80, 40, { name: "Gone", children: [text(0, 40, 40, 20, "lost")] }),
    ],
  });
  const b = frame(0, 0, 200, 100, { name: "Root", children: [text(0, 0, 80, 20, "kept")] });

  const diff = diffTrees(a, b);

  assert.equal(diff.stats.aOnly, 2); // Gone + its child
  const missing = has(diff.findings, "missing");
  assert.equal(missing.length, 2);
  assert.ok(missing.every((f) => f.severity === "high"));
});

test("an extra node in ours is medium, and only low when it is a hairline", () => {
  const a = frame(0, 0, 200, 100, { name: "Root", children: [text(0, 0, 80, 20, "kept")] });
  const withExtra = (extra) =>
    frame(0, 0, 200, 100, { name: "Root", children: [text(0, 0, 80, 20, "kept"), extra] });

  const big = diffTrees(a, withExtra(frame(0, 40, 80, 40, { name: "Extra" })));
  const hairline = diffTrees(a, withExtra(frame(0, 40, 1, 1, { name: "grid-spacer" })));

  assert.equal(has(big.findings, "extra")[0].severity, "medium");
  assert.equal(has(hairline.findings, "extra")[0].severity, "low");
});

// ---------------------------------------------------------------------------
// compareNode
// ---------------------------------------------------------------------------

test("a changed layoutMode is high severity", () => {
  const a = frame(0, 0, 100, 100, { layoutMode: "NONE" });
  const b = frame(0, 0, 100, 100, { layoutMode: "VERTICAL" });

  const [finding] = has(compareNode(a, b, null, null), "layout");

  assert.equal(finding.severity, "high");
  assert.match(finding.detail, /NONE → VERTICAL/);
});

test("different characters are high severity", () => {
  const a = text(0, 0, 80, 20, "The backbone\nof global commerce");
  const b = text(0, 0, 80, 20, "The backbone of global commerce");

  // Wrapping alone is not a text change — newlines collapse like whitespace.
  assert.equal(has(compareNode(a, b, null, null), "text").length, 0);

  const c = text(0, 0, 80, 20, "Something else");
  assert.equal(has(compareNode(a, c, null, null), "text")[0].severity, "high");
});

test("font family and size drift are medium severity", () => {
  const a = text(0, 0, 80, 20, "135+", {
    fontSize: 48,
    fontName: { family: "Söhne", style: "Buch" },
  });
  const b = text(0, 0, 80, 20, "135+", {
    fontSize: 47.44,
    fontName: { family: "S?hne VF", style: "Buch" },
  });

  const found = has(compareNode(a, b, null, null), "font");

  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.severity === "medium"));
});

test("size drift crosses from low to medium at the 8px mark", () => {
  const a = frame(0, 0, 100, 116);
  const small = frame(0, 0, 100, 118);
  const large = frame(0, 0, 100, 176);

  assert.equal(has(compareNode(a, small, null, null), "size")[0].severity, "low");
  assert.equal(has(compareNode(a, large, null, null), "size")[0].severity, "medium");
});

test("sub-tolerance drift is not reported at all", () => {
  const a = frame(0, 0, 100, 116.4);
  const b = frame(0, 0, 100, 116.9);

  assert.deepEqual(has(compareNode(a, b, null, null), "size"), []);
});

test("fills are compared by value, ignoring Figma's boundVariables noise", () => {
  const fill = (r) => [
    { type: "SOLID", visible: true, opacity: 1, color: { r, g: 0, b: 0 }, boundVariables: {} },
  ];
  const a = frame(0, 0, 10, 10, { fills: fill(1) });
  const same = frame(0, 0, 10, 10, {
    fills: [{ type: "SOLID", visible: true, opacity: 1, color: { r: 1, g: 0, b: 0 } }],
  });
  const other = frame(0, 0, 10, 10, { fills: fill(0) });

  assert.deepEqual(has(compareNode(a, same, null, null), "paint"), []);
  assert.equal(has(compareNode(a, other, null, null), "paint")[0].severity, "medium");
});

// ---------------------------------------------------------------------------
// renderReport
// ---------------------------------------------------------------------------

test("the report ranks high first and folds repeated rows into a count", () => {
  const a = frame(0, 0, 200, 200, {
    name: "Root",
    children: [
      frame(0, 0, 50, 50, { name: "Gradient" }),
      frame(0, 60, 50, 50, { name: "Gradient" }),
      frame(0, 120, 50, 50, { name: "Gradient" }),
    ],
  });
  const b = frame(0, 0, 200, 200, { name: "Root" });

  const report = renderReport(diffTrees(a, b), { a: "ref.json", b: "ours.json" });
  const high = report.indexOf("HIGH");

  assert.ok(high > -1);
  assert.match(report, /×3/);
  const low = report.indexOf("LOW");
  if (low > -1) assert.ok(high < low);
});

test("--limit truncates a section and says how many were hidden", () => {
  const children = Array.from({ length: 30 }, (_, i) =>
    frame(0, i * 10, 50, 5, { name: `Row ${i}` }),
  );
  const a = frame(0, 0, 200, 400, { name: "Root", children });
  const b = frame(0, 0, 200, 400, { name: "Root" });

  const report = renderReport(diffTrees(a, b), { a: "ref", b: "ours", limit: 5 });

  assert.match(report, /25 more/);
});

// ---------------------------------------------------------------------------
// diffText — show where two strings part ways, not their shared opening
// ---------------------------------------------------------------------------

test("two paragraphs sharing a long opening render their difference, not the prefix", () => {
  const shared = "defining the internet economy—including steeper growth for newer businesses, faster";
  const longer = `${shared} international expansion and stablecoin progress`;

  const [left, right] = diffText(shared, longer).split(" \u2192 ");

  assert.notEqual(left, right, "the two sides must not render identically");
  assert.match(right, /international/);
});

test("strings that differ from the first word need no leading ellipsis", () => {
  const rendered = diffText("Alpha beta", "Gamma delta");

  assert.ok(!rendered.startsWith('"\u2026'), rendered);
  assert.match(rendered, /Alpha beta/);
  assert.match(rendered, /Gamma delta/);
});

test("a text finding uses the diverging window", () => {
  const shared = "The very same opening words that both sides share completely";
  const a = text(0, 0, 80, 20, shared);
  const b = text(0, 0, 80, 20, `${shared} and then ours keeps going`);

  const [finding] = has(compareNode(a, b, null, null), "text");
  const [left, right] = finding.detail.split(" \u2192 ");

  assert.notEqual(left, right);
});

// ---------------------------------------------------------------------------
// orientPair — which side is ours
// ---------------------------------------------------------------------------

test("the side carrying our own artefacts is recognised as ours", () => {
  const theirs = frame(0, 0, 100, 100, {
    name: "Section",
    children: [frame(0, 0, 40, 40, { name: "Container" })],
  });
  const ours = frame(0, 0, 100, 100, {
    name: "section.hds",
    children: [frame(0, 0, 1, 1, { name: "grid-spacer" })],
  });

  const forwards = orientPair(theirs, ours);
  assert.equal(forwards.swapped, false);
  assert.match(forwards.reason, /grid-spacer/);

  const backwards = orientPair(ours, theirs);
  assert.equal(backwards.swapped, true);
  assert.equal(backwards.a, theirs);
  assert.equal(backwards.b, ours);
});

test("pseudo-element markers identify our side too", () => {
  const theirs = frame(0, 0, 100, 100, { name: "Section" });
  const ours = frame(0, 0, 100, 100, {
    name: "Section",
    children: [frame(0, 0, 10, 10, { name: "span.__w2w-pseudo-after" })],
  });

  assert.equal(orientPair(ours, theirs).swapped, true);
});

test("with no marker on either side the given order stands", () => {
  const one = frame(0, 0, 100, 100, { name: "A" });
  const two = frame(0, 0, 100, 100, { name: "B" });

  const oriented = orientPair(one, two);

  assert.equal(oriented.swapped, false);
  assert.equal(oriented.a, one);
  assert.match(oriented.reason, /order as given/);
});

test("markers on both sides are no evidence, so the order stands", () => {
  const spacer = () => frame(0, 0, 1, 1, { name: "grid-spacer" });
  const one = frame(0, 0, 100, 100, { name: "A", children: [spacer()] });
  const two = frame(0, 0, 100, 100, { name: "B", children: [spacer()] });

  assert.equal(orientPair(one, two).swapped, false);
});
