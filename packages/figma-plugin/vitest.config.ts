import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // Dev-log bridge flag — see src/types/devlog-global.d.ts. Tests exercise
    // the dev path.
    __W2W_DEV_LOG__: "true",
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    environment: "happy-dom",
  },
});
