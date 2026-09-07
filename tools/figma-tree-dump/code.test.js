/**
 * Unit tests for the layer-tree serializer in code.js.
 *
 * Zero dependencies — node:test ships with Node >=18 (this repo's floor).
 * Run:  node --test tools/figma-tree-dump/
 *
 * code.js only calls figma.* behind a `typeof figma !== "undefined"` guard, so
 * requiring it here defines the pure functions without touching the sandbox.
 */

const test = require("node:test");
const assert = require("node:assert");

const {
  serializeTree,
  serializeRoots,
  collectTruncations,
  DEFAULTS,
} = require("./code.js");

/** Stand-in for figma.mixed (a unique symbol inside the sandbox). */
const MIXED = Symbol("figma.mixed");
const opts = { mixed: MIXED };

function frame(over) {
  return Object.assign(
    {
      id: "1:1",
      name: "Frame 1",
      type: "FRAME",
      visible: true,
      width: 977,
      height: 689,
      x: 0,
      y: 0,
      clipsContent: true,
      children: [],
    },
    over,
  );
}

function text(over) {
  return Object.assign(
    {
      id: "1:2",
      name: "Hello",
      type: "TEXT",
      visible: true,
      width: 98,
      height: 24,
      x: 424,
      y: 248,
      characters: "Hello",
      fontName: { family: "Sohne", style: "Buch" },
      fontSize: 16,
      fontWeight: 400,
      lineHeight: { unit: "PIXELS", value: 24 },
      letterSpacing: { unit: "PERCENT", value: 0 },
      textAlignHorizontal: "LEFT",
      textAlignVertical: "CENTER",
      textAutoResize: "WIDTH_AND_HEIGHT",
    },
    over,
  );
}

test("nests children and keeps identity + geometry", () => {
  const out = serializeTree(frame({ children: [text()] }), opts);

  assert.equal(out.id, "1:1");
  assert.equal(out.name, "Frame 1");
  assert.equal(out.type, "FRAME");
  assert.equal(out.width, 977);
  assert.equal(out.height, 689);
  assert.equal(out.clipsContent, true);

  assert.equal(out.children.length, 1);
  assert.equal(out.children[0].type, "TEXT");
  assert.equal(out.children[0].x, 424);
});

test("captures full text typography", () => {
  const out = serializeTree(text(), opts);

  assert.equal(out.characters, "Hello");
  assert.deepEqual(out.fontName, { family: "Sohne", style: "Buch" });
  assert.equal(out.fontSize, 16);
  assert.equal(out.fontWeight, 400);
  assert.deepEqual(out.lineHeight, { unit: "PIXELS", value: 24 });
  assert.equal(out.textAlignVertical, "CENTER");
});

test("figma.mixed becomes the string MIXED, never a crash", () => {
  const out = serializeTree(text({ fontSize: MIXED, fontName: MIXED }), opts);

  assert.equal(out.fontSize, "MIXED");
  assert.equal(out.fontName, "MIXED");
});

test("maxDepth stops recursion and marks the node", () => {
  // depth 0 -> depth 1 -> depth 2; maxDepth 1 must cut at the second level.
  const deep = frame({
    id: "a",
    children: [frame({ id: "b", children: [frame({ id: "c" })] })],
  });

  const out = serializeTree(deep, { ...opts, maxDepth: 1 });

  assert.equal(out.children.length, 1);
  assert.equal(out.children[0].id, "b");
  assert.equal(out.children[0].children, undefined);
  assert.equal(out.children[0]._truncated, "depth");
});

test("maxNodes stops recursion and marks the node", () => {
  const wide = frame({
    children: [text({ id: "t1" }), text({ id: "t2" }), text({ id: "t3" })],
  });

  const out = serializeTree(wide, { ...opts, maxNodes: 2 });

  assert.equal(out.children.length, 1); // root + 1 child = budget of 2
  assert.equal(out._truncated, "nodes");
});

test("a throwing property getter is skipped, not fatal", () => {
  const node = frame();
  Object.defineProperty(node, "fills", {
    get() {
      throw new Error("Cannot read fills on this node type");
    },
    enumerable: true,
  });

  const out = serializeTree(node, opts);

  assert.equal(out.id, "1:1");
  assert.equal(out.fills, undefined);
});

test("childless nodes omit the children key entirely", () => {
  const out = serializeTree(frame({ children: [] }), opts);

  assert.equal(out.children, undefined);
  assert.ok(!("children" in out));
});

test("long text is truncated with an explicit marker", () => {
  const long = "x".repeat(DEFAULTS.maxTextChars + 50);
  const out = serializeTree(text({ characters: long }), opts);

  assert.equal(out.characters.length, DEFAULTS.maxTextChars);
  assert.equal(out.charactersTruncated, true);
});

test("serializeRoots gives each root its own node budget", () => {
  // Shared budget bug: root A's children used to eat the allowance root B needed.
  const a = frame({ id: "a", children: [text({ id: "a1" }), text({ id: "a2" })] });
  const b = frame({ id: "b", children: [text({ id: "b1" }), text({ id: "b2" })] });

  const out = serializeRoots([a, b], { ...opts, maxNodes: 3 });

  assert.equal(out.length, 2);
  assert.equal(out[0].children.length, 2);
  assert.equal(out[1].children.length, 2); // used to be cut to 0
  assert.equal(out[1]._truncated, undefined);
});

test("collectTruncations reports every cut subtree", () => {
  const deep = frame({
    id: "a",
    children: [frame({ id: "b", name: "Deep", children: [frame({ id: "c" })] })],
  });

  const cut = collectTruncations(serializeTree(deep, { ...opts, maxDepth: 1 }));

  assert.equal(cut.length, 1);
  assert.deepEqual(cut[0], { id: "b", name: "Deep", reason: "depth" });
});

test("collectTruncations returns an empty list for a complete tree", () => {
  const out = serializeTree(frame({ children: [text()] }), opts);

  assert.deepEqual(collectTruncations(out), []);
});
