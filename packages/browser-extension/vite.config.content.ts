import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";

// Separate build for the content script.
// MV3 content scripts are classic scripts and cannot use ES module `import`.
// `inlineDynamicImports: true` + IIFE format forces everything into a single
// file, so imports from @w2w/shared (or any other module) get inlined instead
// of being emitted as a separate chunk.
export default defineConfig({
  plugins: [preact()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content/index.ts"),
      formats: ["iife"],
      name: "W2WContent",
      fileName: () => "content/index.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
