import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    // Files run serially in fresh workers (isolation kept). Integration
    // suites use mongoose's process-global default connection — running
    // two `*.integration.test.ts` files in parallel workers would race
    // them onto the same singleton. `fileParallelism: false` makes files
    // run one-at-a-time WITHOUT sharing process state (each file still
    // gets a fresh worker, so module caches stay clean).
    // Tradeoff: ~2-3s longer suite time; acceptable for ~18 files.
    fileParallelism: false,
  },
});
