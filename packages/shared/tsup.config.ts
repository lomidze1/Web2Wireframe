import { defineConfig } from "tsup";

// `clean` is handled by the build script (rm -rf dist) before tsup runs,
// because tsup executes the two configs below in parallel and an inline
// `clean: true` on one would race with / wipe the other's output.
export default defineConfig([
  {
    // The barrel (src/index.ts) MUST stay free of @msgpack/msgpack: the Figma
    // plugin SANDBOX (main.ts) imports it transitively, and msgpack constructs
    // `new TextEncoder()` at module top-level — which throws in Figma's sandbox
    // (no TextEncoder there). The codec lives in its own entry/subpath
    // (@w2w/shared/w2w-codec) so only the UI iframe / extension / CLI (which all
    // have TextEncoder) pull msgpack in.
    entry: ["src/index.ts", "src/w2w-codec.ts"],
    format: ["cjs", "esm"],
    dts: true,
    // Bundle msgpack into dist/w2w-codec so downstream bundlers don't have to
    // resolve it from this package's location. (No effect on index.js, which
    // does not import msgpack.)
    noExternal: ["@msgpack/msgpack"],
  },
  {
    // content-script-bundle uses `import.meta.url`, so ESM only.
    entry: ["src/content-script-bundle.ts"],
    format: ["esm"],
    dts: true,
  },
]);
