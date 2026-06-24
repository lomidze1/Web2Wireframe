/**
 * esbuild override for the plugin UI (iframe) bundle. Injects the compile-time
 * `__W2W_DEV_LOG__` flag so the dev-only log bridge (src/utils/devLogger.ts) is
 * dead-code-eliminated from the published build.
 *
 *   production build (scripts/build-prod.mjs sets W2W_PROD=1) → false
 *   dev / watch                                               → true
 */
module.exports = function (buildOptions) {
  buildOptions.define = {
    ...buildOptions.define,
    __W2W_DEV_LOG__: process.env.W2W_PROD === "1" ? "false" : "true",
  };
  return buildOptions;
};
