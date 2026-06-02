#!/usr/bin/env node
/**
 * Decode a hardened `.w2w` capture file back into readable JSON.
 *
 * Owner-only debugging tool — lives in the repo, is never shipped, and works on
 * ANY `.w2w` (including files produced by the public production build) because
 * the codec key lives in `@w2w/shared`. The public extension only ever writes
 * `.w2w`; this is how you read one.
 *
 * Requires `@w2w/shared` to be built first (`pnpm --filter @w2w/shared build`).
 *
 * Usage:
 *   node scripts/w2w-decode.mjs <file.w2w>            # pretty JSON → stdout
 *   node scripts/w2w-decode.mjs <file.w2w> <out.json> # write to a file
 *   node scripts/w2w-decode.mjs <file.w2w> | jq '.frames[0]'   # pipe & search
 */

import fs from "node:fs";
import path from "node:path";
import { decodeW2W, detectFormat } from "@w2w/shared/w2w-codec";

async function main() {
  const [input, output] = process.argv.slice(2);

  if (!input || input === "-h" || input === "--help") {
    console.error(
      "Usage: node scripts/w2w-decode.mjs <file.w2w> [out.json]\n" +
        "       node scripts/w2w-decode.mjs <file.w2w> | jq '.'",
    );
    process.exit(input ? 0 : 1);
  }

  if (!fs.existsSync(input)) {
    console.error(`[w2w-decode] File not found: ${input}`);
    process.exit(1);
  }

  const bytes = new Uint8Array(fs.readFileSync(input));
  const format = detectFormat(bytes);

  let data;
  if (format === "w2w" || format === "w2w-v2") {
    data = await decodeW2W(bytes);
  } else if (format === "json") {
    // Already plain JSON (e.g. an old export) — just reformat it.
    data = JSON.parse(new TextDecoder().decode(bytes));
  } else {
    console.error(
      `[w2w-decode] Unsupported format "${format}". This tool decodes hardened ` +
        `.w2w (or plain .json). Legacy gzip+msgpack .w2w files are not handled here.`,
    );
    process.exit(1);
  }

  const json = JSON.stringify(data, null, 2);

  if (output) {
    fs.writeFileSync(output, json);
    const kb = (json.length / 1024).toFixed(0);
    console.error(`[w2w-decode] Wrote ${output} (${kb} KB) from ${path.basename(input)}`);
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch((err) => {
  console.error("[w2w-decode] Failed:", err.message);
  process.exit(1);
});
