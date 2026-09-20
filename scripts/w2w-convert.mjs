#!/usr/bin/env node
/**
 * Run the real Figma-plugin converter over a capture file, offline.
 *
 * Owner-only debugging tool. `w2w-decode.mjs` stops at the decoded capture;
 * this one keeps going and executes `convertW2WToWireframe` — the whole
 * css-converter → treeSimplify → textRunMerge chain — so a capture can be
 * A/B'd in ~200ms instead of a Figma import. Everything up to the Figma API is
 * covered: geometry, auto-layout, padding/gap, text content and segments,
 * fills, images, layer names and the skipped-subtree reports.
 *
 * NOT covered: `rendering/nodes.ts` and `text.ts`. Those need the live `figma`
 * object and Figma's font engine (line breaking, auto-resize, the text fit),
 * so real-font questions still need an import plus a tree dump.
 *
 * Reads BOTH formats:
 *   .w2w   hardened container → `@w2w/shared/w2w-codec` (needs
 *          `pnpm --filter @w2w/shared build` once)
 *   .h2d   the other tool's export → XOR 57 + raw inflate
 *   .json  an already-decoded capture
 *
 * A `.h2d` tree converts too — the record shape is near-identical — which is
 * how you compare their capture against ours through OUR renderer. Treat the
 * result as indicative: their styles carry keys we never read.
 *
 * Usage:
 *   node scripts/w2w-convert.mjs <file>
 *   node scripts/w2w-convert.mjs <file> --tree out.json     # WireframeNode tree
 *   node scripts/w2w-convert.mjs <file> --decode cap.json   # decoded capture
 *   node scripts/w2w-convert.mjs <file> --mode plain        # layoutMode (default autoLayout)
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(REPO, "packages/figma-plugin");

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/** `.h2d` = JSON → raw deflate → XOR 57. No length header, so inflateRaw. */
function decodeH2D(bytes) {
  const x = Buffer.from(bytes.map((b) => b ^ 57));
  return JSON.parse(zlib.inflateRawSync(x, { maxOutputLength: 1 << 30 }).toString());
}

async function decodeCapture(file) {
  const bytes = new Uint8Array(fs.readFileSync(file));

  if (file.toLowerCase().endsWith(".h2d")) return { data: decodeH2D(bytes), format: "h2d" };

  const { decodeW2W, detectFormat } = await import("@w2w/shared/w2w-codec");
  const format = detectFormat(bytes);
  if (format === "w2w" || format === "w2w-v2") return { data: await decodeW2W(bytes), format };
  if (format === "json") return { data: JSON.parse(new TextDecoder().decode(bytes)), format };
  throw new Error(`unsupported format "${format}" — hardened .w2w, .h2d or .json only`);
}

/** Ours nests the tree under `frames[0]`; theirs puts it at the top level. */
function rootFrameOf(data) {
  const root = data.frames?.[0]?.frame ?? data.frame;
  if (!root) throw new Error("no frame tree found (expected .frames[0].frame or .frame)");
  return root;
}

/**
 * Fill in the keys a `.h2d` tree omits.
 *
 * They drop `children` entirely on a leaf FRAME (650 of 1055 nodes carried it
 * on chroniclehq.com); our converter reads `node.children.length` unguarded,
 * because our own extractor always emits the array. Same story for the other
 * always-present-for-us keys. Patching here keeps the adapter in the tool
 * instead of loosening the converter for a shape we never actually ship.
 *
 * Returns how many nodes were patched, so the report can admit it happened.
 */
function normaliseForeignTree(root) {
  let patched = 0;
  (function walk(n) {
    if (n.type === "FRAME" || n.children) {
      if (!Array.isArray(n.children)) {
        n.children = [];
        patched++;
      }
      n.classList ??= [];
      n.attr ??= {};
      n.styles ??= {};
    }
    for (const c of n.children || []) walk(c);
  })(root);
  return patched;
}

// ---------------------------------------------------------------------------
// Converter — loaded through Vite so the TypeScript and the `__W2W_DEV_LOG__`
// define resolve exactly as they do in the plugin build.
// ---------------------------------------------------------------------------

async function loadConverter() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: PLUGIN,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    define: { __W2W_DEV_LOG__: "false" },
  });
  // The converter reaches for a couple of Figma globals at module scope; it
  // never draws anything, so the stubs only have to exist.
  globalThis.figma ??= { createFrame: () => ({}), mixed: Symbol("figma.mixed") };
  const mod = await server.ssrLoadModule("/src/rendering/css-converter.ts");
  return { convert: mod.convertW2WToWireframe, close: () => server.close() };
}

// ---------------------------------------------------------------------------

function summarise(tree) {
  const s = { layers: 0, text: 0, frame: 0, image: 0, chars: 0, maxDepth: 0 };
  (function walk(n, d) {
    s.layers++;
    s.maxDepth = Math.max(s.maxDepth, d);
    if (n.type === "text") {
      s.text++;
      s.chars += (n.textContent || "").length;
    } else {
      s.frame++;
      if (n.imageUrl) s.image++;
    }
    for (const c of n.children || []) walk(c, d + 1);
  })(tree, 0);
  return s;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const input = process.argv[2];
  if (!input || input === "-h" || input === "--help") {
    console.error(
      "Usage: node scripts/w2w-convert.mjs <file.w2w|file.h2d|file.json> [options]\n" +
        "  --tree <out.json>    write the converted WireframeNode tree\n" +
        "  --decode <out.json>  write the decoded capture\n" +
        "  --mode <mode>        layoutMode (default: autoLayout)",
    );
    process.exit(input ? 0 : 1);
  }
  if (!fs.existsSync(input)) {
    console.error(`[w2w-convert] File not found: ${input}`);
    process.exit(1);
  }

  const t0 = Date.now();
  const { data, format } = await decodeCapture(input);
  const root = rootFrameOf(data);
  const patched = format === "h2d" ? normaliseForeignTree(root) : 0;
  const tDecode = Date.now() - t0;

  const decodeOut = arg("--decode");
  if (decodeOut) fs.writeFileSync(decodeOut, JSON.stringify(data, null, 2));

  const { convert, close } = await loadConverter();
  const skipped = [];
  const t1 = Date.now();
  const tree = convert(root, {
    layoutMode: arg("--mode") || "autoLayout",
    onSkippedFrame: (s) => skipped.push(s),
  });
  const tConvert = Date.now() - t1;

  const s = summarise(tree);
  console.log(`\n${path.basename(input)}  [${format}]  ${data.url || data.name || ""}`);
  console.log(`  decode ${tDecode}ms · convert ${tConvert}ms`);
  if (patched) {
    console.log(`  ⚠ foreign tree — ${patched} node(s) given an empty children[]; indicative only`);
  }
  console.log(`  page   ${Math.round(root.width)}×${Math.round(root.height)}`);
  console.log(
    `  layers ${s.layers}  (text ${s.text}, frame ${s.frame}, image ${s.image})  ` +
      `${s.chars} chars, depth ${s.maxDepth}`,
  );
  console.log(`  reported skips: ${skipped.length}`);
  for (const k of skipped) {
    console.log(
      `    ${k.layerName}  ${Math.round(k.width)}×${Math.round(k.height)}  ${k.nodes} node(s)`,
    );
  }

  const treeOut = arg("--tree");
  if (treeOut) {
    fs.writeFileSync(treeOut, JSON.stringify(tree, null, 2));
    console.log(`  → tree written to ${treeOut}`);
  }
  if (decodeOut) console.log(`  → capture written to ${decodeOut}`);

  await close();
}

main().catch((err) => {
  console.error("[w2w-convert] Failed:", err.stack || err.message);
  process.exit(1);
});
