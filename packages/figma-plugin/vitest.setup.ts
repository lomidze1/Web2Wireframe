/**
 * Global test setup.
 *
 * The loadFontAsync memoization (src/rendering/fontLoader.ts) is module-level
 * state that outlives a single test. Tests routinely swap the loadFontAsync
 * mock between cases ("Helvetica loads" → "Helvetica is missing"), and a
 * cached answer from the previous case would leak into the next. Reset the
 * cache before every test so each one sees a cold font system.
 */
import { beforeEach } from "vitest";
import { resetFontCacheForTests } from "./src/rendering/fontLoader";

beforeEach(() => {
  resetFontCacheForTests();
});
