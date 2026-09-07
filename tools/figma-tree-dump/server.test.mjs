/**
 * Unit tests for the pure filename logic in server.mjs.
 *
 * Run:  node --test tools/figma-tree-dump/server.test.mjs
 *
 * server.mjs only calls listen() when it is the process entry point, so this
 * import defines the pure helpers without binding port 3998.
 */

import test from "node:test";
import assert from "node:assert";

import { dumpFileName, slug } from "./server.mjs";

const STAMP = "2026-09-03T10-00-00-000Z";

test("a single root keeps the original <stamp>-<name> shape", () => {
  const name = dumpFileName({ selection: { name: "Section" } }, STAMP);

  assert.equal(name, `${STAMP}-section.json`);
});

test("an unwrapped single-element array is named like a single root", () => {
  const name = dumpFileName({ selection: [{ name: "Section" }] }, STAMP);

  assert.equal(name, `${STAMP}-section.json`);
});

test("two roots are joined so the pair is readable at a glance", () => {
  const name = dumpFileName(
    { selection: [{ name: "h2d frame" }, { name: "w2w frame" }] },
    STAMP,
  );

  assert.equal(name, `${STAMP}-h2d-frame-vs-w2w-frame.json`);
});

test("more than two roots name the first pair and count the rest", () => {
  const name = dumpFileName(
    { selection: [{ name: "A" }, { name: "B" }, { name: "C" }] },
    STAMP,
  );

  assert.equal(name, `${STAMP}-a-vs-b-plus-1.json`);
});

test("multi-root names are shortened so the filename stays sane", () => {
  const long = "x".repeat(60);
  const name = dumpFileName({ selection: [{ name: long }, { name: long }] }, STAMP);

  assert.equal(name, `${STAMP}-${"x".repeat(24)}-vs-${"x".repeat(24)}.json`);
});

test("a nameless root falls back to 'node'", () => {
  assert.equal(slug(undefined), "node");
  assert.equal(slug("!!!"), "node");
});
