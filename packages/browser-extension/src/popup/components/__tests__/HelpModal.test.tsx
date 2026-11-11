/**
 * Web2Wireframe is free (2026-11): the Help modal must not point at plans
 * or pricing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "preact";
import { HelpModal } from "../HelpModal";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe("HelpModal (free mode)", () => {
  it("has no plans or pricing link", () => {
    render(<HelpModal isOpen onClose={() => undefined} />, container);

    expect(container.textContent ?? "").not.toMatch(/compare plans/i);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.href);
    expect(hrefs.some((h) => h.includes("/pricing"))).toBe(false);
    expect(hrefs.some((h) => h.includes("/docs"))).toBe(true);
  });
});
