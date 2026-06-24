/**
 * Compile-time flag for the dev-only log bridge (see utils/devLogger.ts).
 *
 * Replaced at build time by esbuild `define` (see build-figma-plugin.main.cjs /
 * build-figma-plugin.ui.cjs):
 *   • dev / watch builds  → `true`
 *   • production build     → `false`  (scripts/build-prod.mjs sets W2W_PROD=1)
 *
 * Because it becomes a literal `true`/`false` at every use site, esbuild
 * dead-code-eliminates `if (__W2W_DEV_LOG__) …` blocks and tree-shakes the
 * entire devLogger module out of the published bundle. Vitest injects `true`
 * via its own `define` (vitest.config.ts).
 */
declare const __W2W_DEV_LOG__: boolean;
