/**
 * W2W Tree Dump (dev) — Figma sandbox entry point.
 *
 * Serializes the current selection's layer tree to JSON and POSTs it to a local
 * receiver (tools/figma-tree-dump/server.mjs) so it can be read from disk.
 *
 * Why this exists: Figma's REST API meters "file content read" against a
 * seat-tier monthly budget, and reading a layer tree burns it. The Plugin API
 * has no such quota — it runs locally inside Figma desktop.
 *
 * Dev-only. Never published, never bundled, no build step.
 *
 * The file is a plain script (not ESM) because Figma evaluates `main` directly.
 * figma.* is touched only behind a guard so Node can require() it for tests.
 */

var DEFAULTS = {
  maxNodes: 5000,
  maxDepth: 60,
  maxTextChars: 2000,
};

/** Properties read off every node type. Missing ones are simply dropped. */
var COMMON_KEYS = [
  "visible",
  "locked",
  "opacity",
  "blendMode",
  "rotation",
  "clipsContent",
  "constraints",
  "layoutMode",
  "layoutWrap",
  "primaryAxisSizingMode",
  "counterAxisSizingMode",
  "primaryAxisAlignItems",
  "counterAxisAlignItems",
  "itemSpacing",
  "counterAxisSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "layoutAlign",
  "layoutGrow",
  "layoutPositioning",
  "fills",
  "strokes",
  "strokeWeight",
  "strokeAlign",
  "effects",
  "cornerRadius",
  "topLeftRadius",
  "topRightRadius",
  "bottomLeftRadius",
  "bottomRightRadius",
  "overflowDirection",
];

/** Extra properties read only off TEXT nodes. */
var TEXT_KEYS = [
  "fontName",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlignHorizontal",
  "textAlignVertical",
  "textAutoResize",
  "textCase",
  "textDecoration",
  "paragraphSpacing",
  "paragraphIndent",
];

/**
 * Reads node[key], swallowing the throw. Figma raises on properties that do not
 * apply to a node's type, and there is no cheap way to know which in advance.
 */
function read(node, key) {
  try {
    return node[key];
  } catch (e) {
    return undefined;
  }
}

/** Rounds geometry to 2dp — full float precision only bloats the JSON. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Normalizes one property value: figma.mixed becomes "MIXED", readonly Figma
 * arrays/objects become plain clones, numbers get rounded.
 */
function normalize(value, mixed) {
  if (value === undefined || value === null) return undefined;
  if (mixed !== undefined && value === mixed) return "MIXED";
  if (typeof value === "number") return round2(value);
  if (typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return undefined;
    }
  }
  return value;
}

function assign(out, node, keys, mixed) {
  for (var i = 0; i < keys.length; i++) {
    var value = normalize(read(node, keys[i]), mixed);
    if (value !== undefined) out[keys[i]] = value;
  }
}

/**
 * Serializes one node and its subtree.
 *
 * @param {object} node   a Figma SceneNode (or a plain stand-in, in tests)
 * @param {object} opts   merged options: maxNodes / maxDepth / maxTextChars / mixed
 * @param {object} state  shared budget counter, { count: number }
 * @param {number} depth  current recursion depth, 0 at the root
 */
function serializeNode(node, opts, state, depth) {
  state.count++;

  var out = {
    id: read(node, "id"),
    name: read(node, "name"),
    type: read(node, "type"),
  };

  var box = normalize(read(node, "absoluteBoundingBox"), opts.mixed);
  if (box) out.absoluteBoundingBox = box;

  var geometry = ["x", "y", "width", "height"];
  for (var g = 0; g < geometry.length; g++) {
    var value = normalize(read(node, geometry[g]), opts.mixed);
    if (value !== undefined) out[geometry[g]] = value;
  }

  assign(out, node, COMMON_KEYS, opts.mixed);

  if (out.type === "TEXT") {
    assign(out, node, TEXT_KEYS, opts.mixed);

    var characters = normalize(read(node, "characters"), opts.mixed);
    if (typeof characters === "string") {
      if (characters.length > opts.maxTextChars) {
        out.characters = characters.slice(0, opts.maxTextChars);
        out.charactersTruncated = true;
      } else {
        out.characters = characters;
      }
    }
  }

  if (out.type === "INSTANCE" || out.type === "COMPONENT") {
    var componentId = read(node, "componentId");
    if (componentId) out.componentId = componentId;
    var main = read(node, "mainComponent");
    if (main) out.mainComponentName = read(main, "name");
  }

  var children = read(node, "children");
  if (!children || !children.length) return out;

  if (depth >= opts.maxDepth) {
    out._truncated = "depth";
    return out;
  }

  var serialized = [];
  for (var c = 0; c < children.length; c++) {
    if (state.count >= opts.maxNodes) {
      out._truncated = "nodes";
      break;
    }
    serialized.push(serializeNode(children[c], opts, state, depth + 1));
  }
  if (serialized.length) out.children = serialized;

  return out;
}

/** Serializes a whole tree from `root`. Returns the plain JSON object. */
function serializeTree(root, options) {
  var opts = {
    maxNodes: DEFAULTS.maxNodes,
    maxDepth: DEFAULTS.maxDepth,
    maxTextChars: DEFAULTS.maxTextChars,
    mixed: undefined,
  };
  if (options) {
    for (var key in options) {
      if (options[key] !== undefined) opts[key] = options[key];
    }
  }
  return serializeNode(root, opts, { count: 0 }, 0);
}

/**
 * Serializes several roots, each with its own node budget.
 *
 * A shared budget lets a big first root starve the ones after it, which silently
 * gutted the two-frame comparison this tool exists for.
 */
function serializeRoots(roots, options) {
  var out = [];
  for (var i = 0; i < roots.length; i++) {
    out.push(serializeTree(roots[i], options));
  }
  return out;
}

/** Collects every _truncated marker in a serialized tree, so cuts are never silent. */
function collectTruncations(tree, out) {
  out = out || [];
  if (tree._truncated) {
    out.push({ id: tree.id, name: tree.name, reason: tree._truncated });
  }
  if (tree.children) {
    for (var i = 0; i < tree.children.length; i++) {
      collectTruncations(tree.children[i], out);
    }
  }
  return out;
}

/** Counts nodes in an already-serialized tree (for the notify message). */
function countNodes(tree) {
  var total = 1;
  if (tree.children) {
    for (var i = 0; i < tree.children.length; i++) {
      total += countNodes(tree.children[i]);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Figma sandbox entry point
// ---------------------------------------------------------------------------

function main() {
  var selection = figma.currentPage.selection;

  if (!selection.length) {
    figma.closePlugin("Select a node first, then run the plugin again.");
    return;
  }

  var opts = {
    maxNodes: DEFAULTS.maxNodes,
    maxDepth: DEFAULTS.maxDepth,
    maxTextChars: DEFAULTS.maxTextChars,
    mixed: figma.mixed,
  };

  // Each root gets its own budget, so a big frame cannot starve the next one.
  var roots = serializeRoots(selection, opts);

  var total = 0;
  var truncated = [];
  var perRoot = [];
  for (var r = 0; r < roots.length; r++) {
    var count = countNodes(roots[r]);
    total += count;
    perRoot.push(roots[r].name + " " + count);
    collectTruncations(roots[r], truncated);
  }

  var payload = {
    file: figma.root.name,
    page: figma.currentPage.name,
    // Figma writes node ids as "4750:12631"; links spell them "4750-12631".
    selection: roots.length === 1 ? roots[0] : roots,
    nodeCount: total,
    // Always present: an empty list is an explicit "nothing was dropped".
    truncated: truncated,
  };

  // The sandbox has no fetch — an invisible UI iframe does the network call.
  figma.showUI(__html__, { visible: false });
  figma.ui.postMessage(payload);

  figma.ui.onmessage = function (msg) {
    if (msg && msg.ok) {
      var summary =
        roots.length > 1 ? perRoot.join(", ") + " = " + total : total + " nodes";
      var warning =
        truncated.length > 0 ? " ⚠ " + truncated.length + " subtree(s) cut" : "";
      figma.closePlugin("Dumped " + summary + " → " + msg.path + warning);
    } else {
      figma.closePlugin(
        "Dump failed: " +
          ((msg && msg.error) || "is server.mjs running on port 3998?"),
      );
    }
  };
}

if (typeof figma !== "undefined") main();

// Exported for code.test.js; the sandbox has no `module`, so this is inert there.
if (typeof module !== "undefined") {
  module.exports = {
    serializeTree,
    serializeRoots,
    serializeNode,
    collectTruncations,
    countNodes,
    DEFAULTS,
  };
}
