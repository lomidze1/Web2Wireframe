#!/usr/bin/env node
/**
 * Compares two dumped Figma layer trees — h2d's output against ours.
 *
 * This is an *evidence generator*, not a root-cause analyser: it says what
 * differs, fast, and leaves why to the reader.
 *
 * Run:  node tools/figma-tree-dump/diff.mjs <dump.json>            (a 2-root dump)
 *       node tools/figma-tree-dump/diff.mjs <h2d.json> <w2w.json>
 *
 * The hard part is matching nodes across two engines that agree on nothing but
 * the rendered pixels: ids differ, names differ (and naming style says nothing
 * about which engine made a tree — "HTML layer names" makes us write CSS
 * selectors too), wrapper depth differs, and — the whole point — the geometry is
 * wrong wherever we have a bug. Three passes make that tractable:
 *
 *   1. collapse   pass-through wrappers vanish, so a 2-frame-deep h2d heading
 *                 lines up with our bare TEXT node
 *   2. match      recursive, order-INDEPENDENT assignment scored on size and
 *                 parent-relative position (a subtree pushed 54px down by a bug
 *                 is still internally correct), with text content as an anchor
 *   3. compare    matched pairs are diffed property by property, and sibling
 *                 order is reported on its own — z-order inversion is a defect
 *                 we hunt, so the matcher must not assume order is preserved
 *
 * Dev-only, like the rest of this directory. No build step, zero dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULTS = {
  tol: 1, // px: below this, geometry drift is measurement noise
  big: 8, // px: above this, geometry drift stops being cosmetic
  spacing: 4, // px: threshold for itemSpacing / padding
  threshold: 0.55, // minimum similarity for two nodes to be called the same
  limit: 25, // rows printed per severity section
};

/** How far a node may sit from its expected in-parent offset before it stops scoring. */
const POS_SCALE = 200;

const SEVERITIES = ["high", "medium", "low"];
const BADGE = { high: "🔴 HIGH", medium: "🟠 MEDIUM", low: "🟡 LOW" };

/** Node types that are interchangeable containers as far as matching cares. */
const BOX_TYPES = new Set([
  "FRAME",
  "RECTANGLE",
  "INSTANCE",
  "COMPONENT",
  "COMPONENT_SET",
  "GROUP",
  "SECTION",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "STAR",
]);

const typeClass = (type) => (BOX_TYPES.has(type) ? "BOX" : type);

/** Geometry, preferring the absolute box the dump records for every node. */
function bb(node) {
  const box = node.absoluteBoundingBox;
  if (box) {
    return { x: box.x ?? 0, y: box.y ?? 0, w: box.width ?? 0, h: box.height ?? 0 };
  }
  return { x: node.x ?? 0, y: node.y ?? 0, w: node.width ?? 0, h: node.height ?? 0 };
}

const children = (node) => node.children ?? [];

/** Line breaks are layout, not content — a rewrap must not read as a text change. */
const normText = (value) =>
  String(value ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

/** 1 when equal, falling to 0 at `scale` apart. */
const near = (u, v, scale) => Math.max(0, 1 - Math.abs(u - v) / Math.max(scale, 1));

const round = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 1. collapse
// ---------------------------------------------------------------------------

/**
 * Removes pass-through wrappers: a node with exactly one child that shares one
 * of its axes is scaffolding, not structure.
 *
 * h2d renders a heading as frame > frame > TEXT where we render a bare TEXT.
 * Left alone, that depth mismatch shifts an entire level and every node below
 * it mismatches. The names of the removed wrappers survive in `_collapsed`.
 *
 * The one-axis rule is deliberate: a 1264×183 row holding a single 32×32 button
 * shares neither axis and stays, because there the wrapper is the layout.
 */
export function collapse(node, opts = {}) {
  return collapseInto(node, [], opts.tol ?? DEFAULTS.tol);
}

function collapseInto(node, dropped, tol) {
  const kids = children(node);
  if (kids.length === 1) {
    const outer = bb(node);
    const inner = bb(kids[0]);
    if (Math.abs(outer.w - inner.w) <= tol || Math.abs(outer.h - inner.h) <= tol) {
      return collapseInto(kids[0], [...dropped, node.name ?? ""], tol);
    }
  }

  const out = { ...node, _collapsed: dropped };
  if (kids.length) out.children = kids.map((child) => collapseInto(child, [], tol));
  return out;
}

/** Collapses a tree's insides while keeping the root, which anchors the match. */
function prepare(root, tol) {
  const out = { ...root, _collapsed: [] };
  const kids = children(root);
  if (kids.length) out.children = kids.map((child) => collapseInto(child, [], tol));
  return out;
}

// ---------------------------------------------------------------------------
// 2. match
// ---------------------------------------------------------------------------

/**
 * How alike two nodes are, 0..1.
 *
 * Position is measured **relative to each node's own parent**: a subtree that a
 * layout bug pushed 54px down is still correct on the inside, and an absolute
 * comparison would throw all of it away.
 */
export function similarity(a, b, parentA, parentB) {
  if (typeClass(a.type) !== typeClass(b.type)) return 0;

  const A = bb(a);
  const B = bb(b);
  const size =
    0.5 * near(A.w, B.w, Math.max(A.w, B.w, 1)) +
    0.5 * near(A.h, B.h, Math.max(A.h, B.h, 1));

  let position = 1;
  if (parentA && parentB) {
    const P = bb(parentA);
    const Q = bb(parentB);
    position =
      0.5 * near(A.x - P.x, B.x - Q.x, POS_SCALE) +
      0.5 * near(A.y - P.y, B.y - Q.y, POS_SCALE);
  }

  const score = 0.65 * size + 0.35 * position;

  if (a.type === "TEXT") {
    const textA = normText(a.characters);
    const textB = normText(b.characters);
    if (textA && textA === textB) return 1;
    if (textA && textB && (textA.includes(textB) || textB.includes(textA))) {
      return Math.max(score, 0.9);
    }
    if (textA !== textB) return score * 0.4;
  }

  return score;
}

/**
 * Pairs the nodes of two trees.
 *
 * Children are assigned best-score-first rather than in order, because sibling
 * order is one of the things being tested: a gradient painted last instead of
 * first must surface as one reordering, not as a pile of missing and extra
 * nodes. The resulting order is reported separately in `orderDiffs`.
 */
export function matchTrees(rootA, rootB, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const a = prepare(rootA, o.tol);
  const b = prepare(rootB, o.tol);

  const pairs = [];
  const aOnly = [];
  const bOnly = [];
  const orderDiffs = [];

  const collectSubtree = (node, into, trail) => {
    into.push({ node, path: trail });
    for (const child of children(node)) {
      collectSubtree(child, into, [...trail, child.name ?? child.type]);
    }
  };

  const visit = (nodeA, nodeB, parentA, parentB, trail) => {
    pairs.push({ a: nodeA, b: nodeB, parentA, parentB, path: trail });

    const kidsA = children(nodeA);
    const kidsB = children(nodeB);
    if (!kidsA.length && !kidsB.length) return;

    const scored = [];
    for (let i = 0; i < kidsA.length; i++) {
      for (let j = 0; j < kidsB.length; j++) {
        const score = similarity(kidsA[i], kidsB[j], nodeA, nodeB);
        if (score >= o.threshold) scored.push({ score, i, j });
      }
    }
    scored.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);

    const takenA = new Map();
    const takenB = new Map();
    for (const { i, j } of scored) {
      if (takenA.has(i) || takenB.has(j)) continue;
      takenA.set(i, j);
      takenB.set(j, i);
    }

    const order = [...takenA.keys()].sort((x, y) => x - y).map((i) => takenA.get(i));
    const sorted = [...order].sort((x, y) => x - y);
    if (order.some((value, index) => value !== sorted[index])) {
      orderDiffs.push({ a: nodeA, b: nodeB, order, path: trail });
    }

    kidsA.forEach((child, i) => {
      const name = child.name ?? child.type;
      if (takenA.has(i)) visit(child, kidsB[takenA.get(i)], nodeA, nodeB, [...trail, name]);
      else collectSubtree(child, aOnly, [...trail, name]);
    });
    kidsB.forEach((child, j) => {
      if (!takenB.has(j)) collectSubtree(child, bOnly, [...trail, child.name ?? child.type]);
    });
  };

  visit(a, b, null, null, [a.name ?? a.type]);

  return { pairs, aOnly, bOnly, orderDiffs };
}

// ---------------------------------------------------------------------------
// 3. compare
// ---------------------------------------------------------------------------

/** Drops Figma's bookkeeping so two equal paints compare equal. */
function normValue(value) {
  if (Array.isArray(value)) return value.map(normValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "boundVariables") continue;
      out[key] = normValue(value[key]);
    }
    return out;
  }
  if (typeof value === "number") return round(value);
  return value;
}

const sameValue = (a, b) => JSON.stringify(normValue(a)) === JSON.stringify(normValue(b));

const fontLabel = (font) =>
  font && typeof font === "object" ? `${font.family}/${font.style}` : String(font ?? "-");

/**
 * Renders two strings around the point they part ways.
 *
 * Truncating both from the start is useless here: two paragraphs that share
 * their first sixty characters printed as an identical pair, hiding the very
 * difference the row exists to show.
 */
export function diffText(a, b, width = 36) {
  const left = normText(a);
  const right = normText(b);

  let split = 0;
  while (split < left.length && split < right.length && left[split] === right[split]) split += 1;

  // Back off a little, then to a word boundary, so the window opens on a word
  // and still shows some of the text the two sides agree on. The window is wide
  // enough that the diverging words are readable, not cut after a syllable.
  let start = Math.max(0, split - 8);
  while (start > 0 && !/\s/.test(left[start - 1])) start -= 1;

  const clip = (value) => {
    const head = start > 0 ? "…" : "";
    const tail = start + width < value.length ? "…" : "";
    return `"${head}${value.slice(start, start + width)}${tail}"`;
  };

  return `${clip(left)} → ${clip(right)}`;
}

const signed = (n) => `${n > 0 ? "+" : ""}${round(n)}`;

/** Properties compared as plain enums, with the severity each one earns. */
const ENUM_PROPS = [
  ["layoutMode", "layout", "high"],
  ["layoutWrap", "layout", "medium"],
  ["primaryAxisAlignItems", "layout", "low"],
  ["counterAxisAlignItems", "layout", "low"],
  ["primaryAxisSizingMode", "layout", "low"],
  ["counterAxisSizingMode", "layout", "low"],
  ["layoutPositioning", "layout", "medium"],
  ["textAutoResize", "font", "medium"],
  ["textAlignHorizontal", "font", "low"],
  ["textAlignVertical", "font", "low"],
  ["textCase", "font", "low"],
  ["textDecoration", "font", "low"],
  ["blendMode", "flags", "low"],
  ["clipsContent", "flags", "low"],
];

/** Numeric properties: [key, category, which DEFAULTS threshold makes it medium]. */
const NUMBER_PROPS = [
  ["itemSpacing", "layout", "spacing"],
  ["counterAxisSpacing", "layout", "spacing"],
  ["paddingTop", "layout", "spacing"],
  ["paddingRight", "layout", "spacing"],
  ["paddingBottom", "layout", "spacing"],
  ["paddingLeft", "layout", "spacing"],
  ["cornerRadius", "paint", "spacing"],
  ["strokeWeight", "paint", "spacing"],
];

/** Object-valued properties compared whole. */
const VALUE_PROPS = [
  ["fills", "paint", "medium"],
  ["strokes", "paint", "low"],
  ["effects", "paint", "low"],
  ["constraints", "flags", "low"],
  ["lineHeight", "font", "medium"],
  ["letterSpacing", "font", "medium"],
];

/**
 * Every difference between one matched pair.
 *
 * `parentA`/`parentB` may be null (the roots, or a caller testing one node), in
 * which case the in-parent offset is skipped — there is nothing to be relative to.
 */
export function compareNode(a, b, parentA, parentB, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const out = [];
  const add = (severity, category, label, detail) =>
    out.push({ severity, category, label, detail });

  const drift = (value) => (Math.abs(value) > o.big ? "medium" : "low");

  const A = bb(a);
  const B = bb(b);
  for (const [key, from, to] of [
    ["width", A.w, B.w],
    ["height", A.h, B.h],
  ]) {
    const delta = to - from;
    if (Math.abs(delta) > o.tol) {
      add(drift(delta), "size", key, `${round(from)} → ${round(to)} (${signed(delta)})`);
    }
  }

  if (parentA && parentB) {
    const P = bb(parentA);
    const Q = bb(parentB);
    for (const [key, from, to] of [
      ["x", A.x - P.x, B.x - Q.x],
      ["y", A.y - P.y, B.y - Q.y],
    ]) {
      const delta = to - from;
      if (Math.abs(delta) > o.tol) {
        add(drift(delta), "offset", key, `${round(from)} → ${round(to)} (${signed(delta)})`);
      }
    }
  }

  if (a.type !== b.type) add("medium", "type", "type", `${a.type} → ${b.type}`);
  if (a.visible === true && b.visible === false) add("high", "flags", "visible", "true → false");

  if (a.type === "TEXT" && b.type === "TEXT") {
    if (normText(a.characters) !== normText(b.characters)) {
      add("high", "text", "characters", diffText(a.characters, b.characters));
    }
    if (!sameValue(a.fontName, b.fontName)) {
      add("medium", "font", "fontName", `${fontLabel(a.fontName)} → ${fontLabel(b.fontName)}`);
    }
    if (Math.abs((a.fontSize ?? 0) - (b.fontSize ?? 0)) > 0.5) {
      add("medium", "font", "fontSize", `${a.fontSize} → ${b.fontSize}`);
    }
  }

  for (const [key, category, severity] of ENUM_PROPS) {
    if (a[key] === undefined || b[key] === undefined || a[key] === b[key]) continue;
    add(severity, category, key, `${a[key]} → ${b[key]}`);
  }

  for (const [key, category, threshold] of NUMBER_PROPS) {
    if (typeof a[key] !== "number" || typeof b[key] !== "number") continue;
    const delta = b[key] - a[key];
    if (Math.abs(delta) <= o.tol) continue;
    add(
      Math.abs(delta) > o[threshold] ? "medium" : "low",
      category,
      key,
      `${round(a[key])} → ${round(b[key])} (${signed(delta)})`,
    );
  }

  for (const [key, category, severity] of VALUE_PROPS) {
    if (a[key] === undefined || b[key] === undefined || sameValue(a[key], b[key])) continue;
    add(severity, category, key, describe(a[key], b[key]));
  }

  const wrappersA = a._collapsed?.length ?? 0;
  const wrappersB = b._collapsed?.length ?? 0;
  if (wrappersA !== wrappersB) {
    add("low", "wrapper", "wrapper depth", `${wrappersA} → ${wrappersB}`);
  }

  return out;
}

/** A one-line rendering of two structured values, for the report. */
function describe(a, b) {
  const one = (value) => {
    if (Array.isArray(value)) {
      if (!value.length) return "none";
      const kinds = [...new Set(value.map((entry) => entry?.type ?? "?"))].join(",");
      return value.length === 1 ? kinds : `${value.length}× ${kinds}`;
    }
    if (value && typeof value === "object") {
      if ("unit" in value) return `${value.value ?? ""}${value.unit === "PERCENT" ? "%" : ""}`;
      return JSON.stringify(value);
    }
    return String(value);
  };
  return `${one(a)} → ${one(b)}`;
}

/**
 * Layer names only our renderer produces. Naming style is no help — "HTML layer
 * names" makes us write CSS selectors too — but these are ours alone.
 */
const OUR_MARKERS = [
  { name: "grid-spacer", test: (name) => name === "grid-spacer" },
  { name: "__w2w", test: (name) => name.includes("__w2w") },
];

function ourMarkers(root) {
  const found = new Set();
  const walk = (node) => {
    const name = node.name ?? "";
    for (const marker of OUR_MARKERS) if (marker.test(name)) found.add(marker.name);
    for (const child of children(node)) walk(child);
  };
  walk(root);
  return [...found];
}

/**
 * Decides which of two roots is ours, so the report reads in the right
 * direction without the reader having to guess the selection order.
 *
 * Evidence only counts when exactly one side carries it.
 */
export function orientPair(first, second) {
  const marksFirst = ourMarkers(first);
  const marksSecond = ourMarkers(second);

  if (marksFirst.length && !marksSecond.length) {
    return { a: second, b: first, swapped: true, reason: `ours detected by ${marksFirst.join(", ")}` };
  }
  if (marksSecond.length && !marksFirst.length) {
    return { a: first, b: second, swapped: false, reason: `ours detected by ${marksSecond.join(", ")}` };
  }
  return { a: first, b: second, swapped: false, reason: "order as given — no W2W marker on exactly one side" };
}

/** Hairline and hidden extras are artefacts, not content — they rank lower. */
const isHairline = (node) => {
  const { w, h } = bb(node);
  return (w <= 2 && h <= 2) || node.visible === false;
};

const rank = (finding) => SEVERITIES.indexOf(finding.severity);

const label = (node) => `${node.type} ${node.name ?? ""}`.trim();

function countNodes(node) {
  return 1 + children(node).reduce((total, child) => total + countNodes(child), 0);
}

/** Full comparison: matched-pair differences, reordering, and both leftovers. */
export function diffTrees(rootA, rootB, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const match = matchTrees(rootA, rootB, o);
  const findings = [];

  for (const pair of match.pairs) {
    for (const finding of compareNode(pair.a, pair.b, pair.parentA, pair.parentB, o)) {
      findings.push({ ...finding, node: label(pair.a), path: pair.path });
    }
  }

  for (const diff of match.orderDiffs) {
    findings.push({
      severity: "high",
      category: "child-order",
      label: "children reordered",
      detail: `[${diff.order.join(", ")}]`,
      node: label(diff.a),
      path: diff.path,
    });
  }

  for (const { node, path: trail } of match.aOnly) {
    const { w, h } = bb(node);
    findings.push({
      severity: "high",
      category: "missing",
      label: "not in ours",
      detail: `${round(w)}×${round(h)}`,
      node: label(node),
      path: trail.slice(0, -1),
    });
  }

  for (const { node, path: trail } of match.bOnly) {
    const { w, h } = bb(node);
    findings.push({
      severity: isHairline(node) ? "low" : "medium",
      category: "extra",
      label: "only in ours",
      detail: `${round(w)}×${round(h)}`,
      node: label(node),
      path: trail.slice(0, -1),
    });
  }

  findings.sort((x, y) => rank(x) - rank(y));

  return {
    findings,
    stats: {
      nodesA: countNodes(rootA),
      nodesB: countNodes(rootB),
      matched: match.pairs.length,
      aOnly: match.aOnly.length,
      bOnly: match.bOnly.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. report
// ---------------------------------------------------------------------------

/** Folds identical rows into one with a count, so 6 identical losses read as one. */
function fold(findings) {
  const rows = new Map();
  for (const finding of findings) {
    const where = finding.path?.slice(-2).join(" / ") ?? "";
    const key = `${finding.category} ${finding.node} ${finding.label} ${finding.detail} ${where}`;
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { ...finding, where, count: 1 });
  }
  return [...rows.values()];
}

const pad = (value, width) => String(value).padEnd(width);

export function renderReport(diff, opts = {}) {
  const limit = opts.limit ?? DEFAULTS.limit;
  const { stats } = diff;
  const lines = [
    `${opts.a ?? "A"}  ·  A = reference   ${stats.nodesA} nodes`,
    `${opts.b ?? "B"}  ·  B = ours        ${stats.nodesB} nodes`,
  ];
  if (opts.reason) lines.push(`(${opts.reason})`);
  lines.push(
    "",
    `matched ${stats.matched} · only in A ${stats.aOnly} · only in B ${stats.bOnly}` +
      ` · findings ${diff.findings.length}`,
  );

  for (const severity of SEVERITIES) {
    const rows = fold(diff.findings.filter((finding) => finding.severity === severity));
    if (!rows.length) continue;

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    lines.push("", `${BADGE[severity]} (${total})`);

    const shown = rows.slice(0, limit);
    const width = Math.max(...shown.map((row) => row.category.length));
    for (const row of shown) {
      const times = row.count > 1 ? `  ×${row.count}` : "";
      const where = row.where ? `   — in ${row.where}` : "";
      lines.push(
        `  ${pad(row.category, width)}  ${row.node}  ${row.label}: ${row.detail}${times}${where}`,
      );
    }
    if (rows.length > shown.length) lines.push(`  … ${rows.length - shown.length} more`);
  }

  return `${lines.join("\n")}\n`;
}

const escapePipes = (value) => String(value).replace(/\|/g, "\\|");

export function renderMarkdown(diff, opts = {}) {
  const { stats } = diff;
  const lines = [
    `# Tree diff — ${opts.a ?? "A"} vs ${opts.b ?? "B"}`,
    "",
    `_${new Date().toISOString().slice(0, 10)} · generated by \`tools/figma-tree-dump/diff.mjs\`_`,
    "",
    "| side | nodes |",
    "|---|---|",
    `| A — reference — \`${opts.a ?? "A"}\` | ${stats.nodesA} |`,
    `| B — ours — \`${opts.b ?? "B"}\` | ${stats.nodesB} |`,
    "",
    `matched **${stats.matched}** · only in A **${stats.aOnly}** · only in B **${stats.bOnly}**`,
  ];
  if (opts.reason) lines.push("", `_sides placed: ${opts.reason}_`);

  for (const severity of SEVERITIES) {
    const rows = fold(diff.findings.filter((finding) => finding.severity === severity));
    if (!rows.length) continue;

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    lines.push(
      "",
      `## ${BADGE[severity]} (${total})`,
      "",
      "| what | node | change | where |",
      "|---|---|---|---|",
    );
    for (const row of rows) {
      const times = row.count > 1 ? ` ×${row.count}` : "";
      lines.push(
        `| ${row.category}${times} | \`${row.node}\` |` +
          ` ${row.label}: ${escapePipes(row.detail)} | ${row.where} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { files: [], swap: false, md: null, limit: DEFAULTS.limit, tol: DEFAULTS.tol };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--swap") out.swap = true;
    else if (arg === "--md") out.md = argv[++i];
    else if (arg === "--limit") out.limit = Number(argv[++i]);
    else if (arg === "--tol") out.tol = Number(argv[++i]);
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else out.files.push(arg);
  }
  return out;
}

/** Reads the two roots to compare, from one 2-root dump or two single dumps. */
export function loadPair(files) {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

  if (files.length === 1) {
    const dump = read(files[0]);
    const roots = Array.isArray(dump.selection) ? dump.selection : [dump.selection];
    if (roots.length < 2) {
      throw new Error(
        `${files[0]} holds one root — select both frames before dumping, or pass two files`,
      );
    }
    const name = path.basename(files[0]);
    return {
      a: roots[0],
      b: roots[1],
      labelA: `${name} [0] ${roots[0].name}`,
      labelB: `${name} [1] ${roots[1].name}`,
    };
  }

  if (files.length === 2) {
    const [first, second] = files.map(read);
    const root = (dump) => (Array.isArray(dump.selection) ? dump.selection[0] : dump.selection);
    return {
      a: root(first),
      b: root(second),
      labelA: path.basename(files[0]),
      labelB: path.basename(files[1]),
    };
  }

  throw new Error("pass one dump holding two roots, or two dump files");
}

const USAGE = `usage: node tools/figma-tree-dump/diff.mjs <dump.json> | <a.json> <b.json>

  --swap        flip the detected direction
  --md <file>   also write a markdown report
  --limit <n>   rows per severity section (default ${DEFAULTS.limit})
  --tol <px>    geometry tolerance (default ${DEFAULTS.tol})

A is the reference (h2d), B is ours. The banner says which file is which.`;

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    process.exit(2);
  }

  if (!args.files.length) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  let pair;
  try {
    pair = loadPair(args.files);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  // Selection order in Figma is not something the user controls, so the sides
  // are placed by evidence and --swap only overrides that.
  const oriented = orientPair(pair.a, pair.b);
  let a = oriented.a;
  let b = oriented.b;
  let labels = oriented.swapped
    ? { a: pair.labelB, b: pair.labelA }
    : { a: pair.labelA, b: pair.labelB };
  let reason = oriented.reason;

  if (args.swap) {
    [a, b] = [b, a];
    labels = { a: labels.b, b: labels.a };
    reason = `${reason}, then flipped by --swap`;
  }

  const diff = diffTrees(a, b, { tol: args.tol });
  process.stdout.write(renderReport(diff, { ...labels, reason, limit: args.limit }));

  if (args.md) {
    fs.writeFileSync(args.md, renderMarkdown(diff, { ...labels, reason }));
    process.stdout.write(`\nmarkdown report → ${args.md}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
