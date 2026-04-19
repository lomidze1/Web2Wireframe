import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "fs";

// Custom plugin to copy manifest.json and fix paths
function copyManifestPlugin() {
  return {
    name: "copy-manifest",
    closeBundle() {
      // Copy manifest.json to dist
      copyFileSync(
        resolve(__dirname, "manifest.json"),
        resolve(__dirname, "dist/manifest.json")
      );

      // Copy global.css to dist/assets if it exists
      const cssPath = resolve(__dirname, "src/styles/global.css");
      if (existsSync(cssPath)) {
        const distAssetsDir = resolve(__dirname, "dist/assets");
        if (!existsSync(distAssetsDir)) {
          mkdirSync(distAssetsDir, { recursive: true });
        }
        copyFileSync(cssPath, resolve(distAssetsDir, "global.css"));
      }

      console.log("✓ Copied manifest.json to dist/");
    },
  };
}

export default defineConfig({
  plugins: [preact(), copyManifestPlugin()],
  publicDir: "public",
  base: "./", // Use relative paths for Chrome extension compatibility
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name]/index.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
