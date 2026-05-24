#!/usr/bin/env node
/**
 * Production build wrapper for the Figma plugin.
 *
 * The plugin's `src/ui/shared/apiConfig.ts` holds a single boolean
 * `USE_PRODUCTION` that switches between `http://localhost:3002` (dev) and
 * `https://api.web2wireframe.design` (published Community build). Figma plugins
 * have no build-time env-var pipeline, so the toggle has to live in source —
 * which means it can be accidentally committed in the wrong state.
 *
 * This wrapper:
 *   1. Flips USE_PRODUCTION to `true` on disk.
 *   2. Runs `build-figma-plugin --typecheck --minify`. The bundle that lands
 *      in `build/main.js` has the production URL baked in.
 *   3. Resets USE_PRODUCTION to `false` in a `finally` so the working tree
 *      goes back to the dev state — even if the build fails, gets Ctrl+C'd,
 *      or the process is killed mid-flight.
 *
 * Result: `npm run build` always produces a production-targeted bundle,
 * `git status` never shows a stray USE_PRODUCTION=true diff, and `npm run
 * watch` keeps pointing at localhost.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiConfigPath = path.resolve(
  __dirname,
  "..",
  "src",
  "ui",
  "shared",
  "apiConfig.ts",
);

const TOGGLE_RE = /const USE_PRODUCTION = (true|false);/;

function setUseProduction(value) {
  const before = fs.readFileSync(apiConfigPath, "utf8");
  if (!TOGGLE_RE.test(before)) {
    throw new Error(
      `[build-prod] Could not find 'const USE_PRODUCTION = …;' in ${apiConfigPath}`,
    );
  }
  const after = before.replace(TOGGLE_RE, `const USE_PRODUCTION = ${value};`);
  fs.writeFileSync(apiConfigPath, after);
}

let resetDone = false;
function resetToDev() {
  if (resetDone) return;
  resetDone = true;
  try {
    setUseProduction(false);
    console.log("[build-prod] reset USE_PRODUCTION = false");
  } catch (err) {
    console.error("[build-prod] failed to reset USE_PRODUCTION:", err);
  }
}

// Best-effort: if the process is killed by a signal, still reset before
// exiting. Node won't run `finally` on SIGINT/SIGTERM by default.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    resetToDev();
    process.exit(1);
  });
}

async function main() {
  setUseProduction(true);
  console.log("[build-prod] set USE_PRODUCTION = true");

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      "build-figma-plugin",
      ["--typecheck", "--minify"],
      { stdio: "inherit", shell: true },
    );
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });

  return exitCode;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error("[build-prod] error:", err);
} finally {
  resetToDev();
}
process.exit(code);
