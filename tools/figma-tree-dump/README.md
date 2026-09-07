# W2W Tree Dump (dev)

Reads a Figma layer tree **locally**, with no REST API quota.

## Why

Figma meters `file_content:read` REST calls against a seat-tier monthly budget.
On the Starter plan that budget runs out after a handful of layer-tree reads —
`/v1/files/:key`, `/v1/files/:key/nodes` and `/v1/images` all return `429` with a
multi-day `retry-after`. The **Plugin API has no such quota**: it runs inside
Figma desktop, so this tool is free and unlimited.

Dev-only. Never published, never bundled, not part of `packages/`, no build step.

## Setup (once)

1. Start the receiver:
   ```bash
   node tools/figma-tree-dump/server.mjs
   ```
2. Figma desktop → **Plugins → Development → Import plugin from manifest…** →
   pick `tools/figma-tree-dump/manifest.json`.

## Use

1. Open the Figma link. A URL with `node-id=…` selects that node automatically.
   (Otherwise select the frame by hand — the plugin dumps the **selection**.)
2. **Plugins → Development → W2W Tree Dump (dev)**.
3. The tree lands in `tools/figma-tree-dump/dumps/`:
   - `latest.json` — always the most recent dump
   - `<timestamp>-<layer-name>.json` — the full history

Select **several** frames at once to compare them (h2d's output next to ours):
`selection` is then an array, each root gets its **own** node budget, and the
filename names the pair — `<timestamp>-h2d-frame-vs-w2w-frame.json` (three or
more roots get a `-plus-N` suffix).

`dumps/` is gitignored: dumps contain your design's contents.

## Comparing two trees

```bash
node tools/figma-tree-dump/diff.mjs dumps/latest.json               # one 2-root dump
node tools/figma-tree-dump/diff.mjs dumps/h2d-….json dumps/w2w-….json
```

**A is the reference (h2d), B is ours.** Which is which is worked out from layer
names only our renderer produces — `grid-spacer` and the `__w2w-*` pseudo-element
markers — and the banner says what it decided and why. Naming *style* proves
nothing: with "HTML layer names" on we write CSS selectors just like h2d does.
When neither side (or both) carries a marker the given order stands, and `--swap`
overrides whatever was chosen.

`--md <file>` also writes a markdown report, `--limit` caps the rows per section
(default 25) and `--tol` the geometry tolerance (default 1px).

Findings are ranked: 🔴 missing nodes, sibling reordering (z-order), `layoutMode`
and text content · 🟠 drift over 8px, fonts, fills, spacing over 4px · 🟡
everything cosmetic. Identical rows fold into one with a `×N` count.

The tool is an **evidence generator, not a root-cause analyser** — it says what
differs, and leaves why to the reader.

Matching two engines that agree on nothing but the rendered pixels is the hard
part; ids, names and wrapper depth all differ, and the geometry is wrong exactly
where we have a bug. Text findings are rendered around the point the two strings
part ways, since two paragraphs sharing a long opening otherwise print as an
identical pair. Three passes handle it: pass-through wrappers are collapsed
(so h2d's frame > frame > TEXT heading lines up with our bare TEXT), children are
assigned by best score rather than in order (z-order inversion is a defect we
hunt, so order cannot be assumed), and position is scored **relative to each
node's own parent** (a subtree a bug pushed 54px down is still correct inside).

## What gets captured

Identity (`id`, `name`, `type`, `visible`, `locked`, `opacity`, `blendMode`),
geometry (`x`, `y`, `width`, `height`, `rotation`, `absoluteBoundingBox`), the
full Auto Layout block, paints/strokes/effects/corner radii/constraints, and for
`TEXT` nodes the complete typography (`fontName`, `fontSize`, `fontWeight`,
`lineHeight`, `letterSpacing`, alignment, `textAutoResize`, …) plus `characters`.
`INSTANCE`/`COMPONENT` nodes also carry `componentId` and `mainComponentName`.

This is **more** than the REST API returns — the Plugin API sees every property.

Limits (in `code.js`): `maxNodes: 5000` **per selected root**, `maxDepth: 60`,
`maxTextChars: 2000`. Nothing is dropped silently — a cut subtree is marked
`"_truncated": "depth"` or `"nodes"`, clipped text gets
`"charactersTruncated": true`, and every cut is also listed in the top-level
`truncated` array (empty = nothing was lost), echoed in the plugin's closing
notification and in the receiver's log line. `figma.mixed` serializes as the
string `"MIXED"`.

## Tests

```bash
node --test tools/figma-tree-dump/*.test.js tools/figma-tree-dump/*.test.mjs
```

`node:test` + `node:assert`, zero dependencies. `code.js` only touches `figma.*`
behind a `typeof figma !== "undefined"` guard, so Node can `require()` it and
test the serializer against plain stand-in objects. `server.mjs` likewise only
binds a port when it is the process entry point, so importing it in a test does
not occupy 3998.

(Pass the file path, not the directory — `node --test <dir>` tries to resolve the
directory as a module and fails here.)

## Notes

- Port **3998**, bound to `127.0.0.1` only. Deliberately separate from the
  dev-log bridge on 3999 (`packages/figma-plugin/scripts/devlog-server.mjs`),
  which is wired into the plugin's production leak-gate. Both can run at once.
- The sandbox has no `fetch`, so `ui.html` is shown with `{ visible: false }`
  purely to make the network call.
- Two manifest rules Figma enforces, learned the hard way:
  1. Localhost must sit in `devAllowedDomains`, **not** `allowedDomains`
     ("If you only need to access localhost for development, please add a
     `devAllowedDomains` field instead"). `allowedDomains` is therefore
     `["none"]` — this plugin never talks to a real domain.
  2. Raw IPs are rejected: `http://127.0.0.1:3998` fails with "must be a valid
     URL". Only the `localhost` spelling is accepted.
  Because `localhost` may resolve to either `::1` or `127.0.0.1`, `server.mjs`
  binds **both** loopback addresses. Neither is reachable from off the machine.
- No `documentAccess: "dynamic-page"` on purpose: the plugin only reads the
  current page's selection, and the synchronous document model lets it read
  `mainComponent` off instances directly.
