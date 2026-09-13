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

// Prod-safety gate: the dev-only log bridge (src/utils/devLogger.ts) and the
// dev-only import profiler (src/utils/perf.ts) must be dead-code-eliminated
// from the published bundle. If any sentinel survives, the bundle is unsafe to
// publish — fail the build hard.
const buildDir = path.resolve(__dirname, "..", "build");
const FORBIDDEN = ["__W2W_DEVLOG__", "localhost:3999", "[w2w-perf]"];

function assertNoDevLoggerLeak() {
  let files = [];
  try {
    files = fs
      .readdirSync(buildDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join(buildDir, f));
  } catch {
    return; // no build dir → nothing produced; main() exit code handles it
  }
  const leaks = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const needle of FORBIDDEN) {
      if (content.includes(needle)) leaks.push(`${path.basename(file)} → "${needle}"`);
    }
  }
  if (leaks.length > 0) {
    throw new Error(
      `[build-prod] DEV-ONLY CODE LEAKED INTO PRODUCTION BUNDLE — refusing to ship:\n  ${leaks.join("\n  ")}`,
    );
  }
  console.log("[build-prod] prod-safety gate passed — no dev-only code in bundle");
}

async function main() {
  setUseProduction(true);
  console.log("[build-prod] set USE_PRODUCTION = true");

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      "build-figma-plugin",
      ["--typecheck", "--minify"],
      // W2W_PROD=1 → esbuild define sets __W2W_DEV_LOG__ = false, stripping the
      // dev-log bridge (see build-figma-plugin.{main,ui}.cjs).
      { stdio: "inherit", shell: true, env: { ...process.env, W2W_PROD: "1" } },
    );
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });

  if (exitCode === 0) assertNoDevLoggerLeak();

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
