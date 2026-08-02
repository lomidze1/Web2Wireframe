import { describe, it, expect } from "vitest";
import { nestBySections } from "../src/lib/nestElements.js";
import type { SimplifiedElement } from "../src/lib/wireframeConverter.js";

function section(name: string, y: number, height: number, extra?: Partial<SimplifiedElement>): SimplifiedElement {
  return { type: "section-bg", name, x: 0, y, width: 1440, height, ...extra } as SimplifiedElement;
}

function item(type: string, y: number, height: number, extra?: Partial<SimplifiedElement>): SimplifiedElement {
  return { type, x: 100, y, width: 400, height, ...extra } as SimplifiedElement;
}

const PAGE_HEIGHT = 4000;

describe("nestBySections", () => {
  it("moves a section's content inside it", () => {
    const footer = section("Footer", 3600, 400);
    const logo = item("logo", 3650, 48);
    const links = item("nav-links", 3700, 40);

    const out = nestBySections([footer, logo, links], PAGE_HEIGHT);

    expect(out).toHaveLength(1);
    expect(out[0]).toBe(footer);
    expect(footer.elements).toHaveLength(2);
    expect(footer.elements).toEqual([logo, links]);
  });

  it("leaves child coordinates in page space", () => {
    const footer = section("Footer", 3600, 400);
    const logo = item("logo", 3650, 48);

    nestBySections([footer, logo], PAGE_HEIGHT);

    expect(logo.y).toBe(3650);
    expect(logo.x).toBe(100);
  });

  it("routes each element to its own section", () => {
    const hero = section("Hero", 0, 1000);
    const footer = section("Footer", 3600, 400);
    const heading = item("heading", 100, 60);
    const legal = item("paragraph", 3700, 40);

    const out = nestBySections([hero, footer, heading, legal], PAGE_HEIGHT);

    expect(out).toHaveLength(2);
    expect(hero.elements).toEqual([heading]);
    expect(footer.elements).toEqual([legal]);
  });

  it("nests a smaller section inside a bigger one, and content into the smallest", () => {
    const outer = section("Features", 1000, 1200);
    const inner = section("Feature Grid", 1100, 400);
    const card = item("card", 1150, 200);

    const out = nestBySections([outer, inner, card], PAGE_HEIGHT);

    expect(out).toEqual([outer]);
    expect(outer.elements).toEqual([inner]);
    expect(inner.elements).toEqual([card]);
  });

  it("does not treat a full-page section as a container", () => {
    const wrapper = section("Page", 0, 3900); // 97.5% of the page
    const heading = item("heading", 100, 60);

    const out = nestBySections([wrapper, heading], PAGE_HEIGHT);

    expect(out).toHaveLength(2);
    expect(wrapper.elements).toBeUndefined();
  });

  it("keeps an element that belongs to no section at top level", () => {
    const footer = section("Footer", 3600, 400);
    const stray = item("badge", 2000, 40);

    const out = nestBySections([footer, stray], PAGE_HEIGHT);

    expect(out).toHaveLength(2);
    expect(footer.elements).toBeUndefined();
  });

  it("does not nest an element that only grazes the section", () => {
    // Section 1000..1400; element 1350..1550 — only 25% of it is inside.
    const sec = section("Features", 1000, 400);
    const straddler = item("card", 1350, 200);

    const out = nestBySections([sec, straddler], PAGE_HEIGHT);

    expect(out).toHaveLength(2);
    expect(sec.elements).toBeUndefined();
  });

  it("appends to children the AI already provided", () => {
    const sec = section("Hero", 0, 1000, { elements: [item("heading", 50, 40)] });
    const extra = item("button", 200, 44);

    nestBySections([sec, extra], PAGE_HEIGHT);

    expect(sec.elements).toHaveLength(2);
    expect(sec.elements?.[1]).toBe(extra);
  });

  it("keeps sections in their original order", () => {
    const hero = section("Hero", 0, 1000);
    const footer = section("Footer", 3600, 400);

    const out = nestBySections([footer, hero], PAGE_HEIGHT);

    expect(out.map((e) => (e as { name?: string }).name)).toEqual(["Footer", "Hero"]);
  });

  it("passes a flat list through untouched when there are no sections", () => {
    const a = item("heading", 100, 40);
    const b = item("paragraph", 200, 40);

    const out = nestBySections([a, b], PAGE_HEIGHT);

    expect(out).toEqual([a, b]);
  });
});
