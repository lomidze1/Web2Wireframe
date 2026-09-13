/**
 * The ring's progress arc must NOT carry a `stroke-dashoffset` transition.
 *
 * RenderingLoader eases that value itself, once per animation frame. A CSS
 * transition on the same property restarts from the new start value on every
 * one of those writes, so it never completes: the ring crawls a few degrees
 * behind while the percentage races to 100 and the overlay closes. This has
 * already shipped once and is recorded as a trap in the component's comments —
 * a stylesheet edit is all it takes to bring it back, and no rendered-DOM test
 * can see it (happy-dom does not apply the CSS module).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// happy-dom rewrites `import.meta.url` to a non-file scheme, so resolve from
// the vitest root (packages/figma-plugin) instead.
const css = readFileSync(
  resolve("src/ui/components/renderingLoader/RenderingLoader.css"),
  "utf8",
);

/** The body of every rule whose selector mentions `.progressArc`. */
function arcRuleBodies(): string[] {
  const bodies: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css))) {
    if (m[1].includes(".progressArc")) bodies.push(m[2]);
  }
  return bodies;
}

describe("RenderingLoader stylesheet", () => {
  it("has progressArc rules to check", () => {
    // Guards the test itself: a rename would otherwise make it vacuously pass.
    expect(arcRuleBodies().length).toBeGreaterThan(0);
  });

  it("never transitions stroke-dashoffset on the arc", () => {
    for (const body of arcRuleBodies()) {
      expect(body).not.toMatch(/stroke-dashoffset/);
    }
  });

  it("never transitions `all` on the arc, which would include dashoffset", () => {
    for (const body of arcRuleBodies()) {
      expect(body).not.toMatch(/transition:\s*all\b/);
    }
  });
});
