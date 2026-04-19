import { defineConfig } from "tsup";

// `clean` is handled by the build script (rm -rf dist) before tsup runs,
// because tsup executes the two configs below in parallel and an inline
// `clean: true` on one would race with / wipe the other's output.
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
  },
  {
    // content-script-bundle uses `import.meta.url`, so ESM only.
    entry: ["src/content-script-bundle.ts"],
    format: ["esm"],
    dts: true,
  },
]);
