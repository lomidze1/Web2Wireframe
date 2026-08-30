/**
 * Same-page `#anchor` links → `linkAnchorId`, and `id` attributes → `anchorId`.
 *
 * `resolveLinkHref` deliberately drops fragment-only hrefs: a hash is NOT a URL
 * action, it is an internal navigation target. It stays dropped there. Instead
 * `resolveAnchorTarget` carries the bare id through on a separate field, which
 * the renderer resolves against a hash→node map built while the tree renders
 * (see rendering/anchorLinks.ts).
 *
 * Keyed on the `<a>` ITSELF, never inherited — otherwise every wrapper inside a
 * link card would sprout its own duplicate ON_CLICK reaction. Same rule
 * `linkReactionUrl` already follows.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { W2WFrameNode } from "@w2w/shared";

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 600, height: 40,
    quad: [0, 0, 600, 0, 600, 40, 0, 40],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function text(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 120, height: 20,
    quad: [0, 0, 120, 0, 120, 20, 0, 20],
    value,
    font: '400 16px Arial',
    ...overrides,
  };
}

function allNodes(root: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    out.push(obj);
    const kids = obj.children as unknown[] | undefined;
    if (Array.isArray(kids)) kids.forEach(visit);
  };
  visit(root);
  return out;
}

/** The node that owns the given text (or, for a link card, the one carrying the field). */
function nodeWithText(root: unknown, needle: string): Record<string, unknown> | undefined {
  return allNodes(root).find(
    (n) => typeof n.textContent === 'string' && (n.textContent as string).includes(needle),
  );
}

function nodeWithAnchorId(root: unknown, id: string): Record<string, unknown> | undefined {
  return allNodes(root).find((n) => n.anchorId === id);
}

/** body > nav > <a href={href}>{label}</a>, plus a <section id="faq"> target. */
function pageWithAnchorNav(href: string, label = 'FAQ'): W2WFrameNode {
  return frame({
    tag: 'body',
    attr: { baseURI: 'https://example.com/' },
    children: [
      frame({
        tag: 'nav',
        children: [
          frame({
            tag: 'a',
            attr: { href },
            children: [text(label)],
          }),
        ],
      }),
      frame({
        tag: 'section',
        attr: { id: 'faq' },
        y: 400,
        height: 300,
        quad: [0, 400, 600, 400, 600, 700, 0, 700],
        children: [text('Frequently asked questions')],
      }),
    ],
  }) as unknown as W2WFrameNode;
}

describe("resolveAnchorTarget: #hash reaches the node", () => {
  it("carries `#faq` through as linkAnchorId", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#faq'));
    expect(nodeWithText(tree, 'FAQ')?.linkAnchorId).toBe('faq');
  });

  it("does NOT put the hash in href — a hash is not a URL action", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#faq'));
    const link = nodeWithText(tree, 'FAQ');
    expect(link?.href).toBeUndefined();
    expect(link?.linkReactionUrl).toBeUndefined();
  });

  it("percent-decodes the id", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#section%20one'));
    expect(nodeWithText(tree, 'FAQ')?.linkAnchorId).toBe('section one');
  });

  it("keeps a malformed percent sequence verbatim instead of throwing", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#a%ZZb'));
    expect(nodeWithText(tree, 'FAQ')?.linkAnchorId).toBe('a%ZZb');
  });

  it("drops a bare `#` — top of page, no target", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#'));
    expect(nodeWithText(tree, 'FAQ')?.linkAnchorId).toBeUndefined();
  });

  it("wires a non-text anchor (icon/logo link) too", () => {
    const tree = convertW2WToWireframe(frame({
      tag: 'body',
      attr: { baseURI: 'https://example.com/' },
      children: [
        frame({
          tag: 'a',
          attr: { href: '#top' },
          children: [frame({ tag: 'span', width: 24, height: 24 })],
        }),
      ],
    }) as unknown as W2WFrameNode);
    const anchor = allNodes(tree).find((n) => n.linkAnchorId !== undefined);
    expect(anchor?.linkAnchorId).toBe('top');
  });
});

describe("anchorId: elements with an id become navigation targets", () => {
  it("records the source element's id", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#faq'));
    expect(nodeWithAnchorId(tree, 'faq')).toBeDefined();
  });

  it("leaves anchorId unset on elements with no id", () => {
    const tree = convertW2WToWireframe(pageWithAnchorNav('#faq'));
    const nav = allNodes(tree).find((n) => n.tag === 'nav');
    expect(nav?.anchorId).toBeUndefined();
  });
});

describe("linkAnchorId is keyed on the <a> itself, never inherited", () => {
  it("does not stamp wrappers inside an anchor card", () => {
    const tree = convertW2WToWireframe(frame({
      tag: 'body',
      attr: { baseURI: 'https://example.com/' },
      children: [
        frame({
          tag: 'a',
          attr: { href: '#pricing' },
          children: [
            frame({
              tag: 'div',
              classList: ['card'],
              children: [frame({ tag: 'div', classList: ['inner'], children: [text('Plans')] })],
            }),
          ],
        }),
      ],
    }) as unknown as W2WFrameNode);
    const stamped = allNodes(tree).filter((n) => n.linkAnchorId !== undefined);
    expect(stamped).toHaveLength(1);
    expect(stamped[0].tag).toBe('a');
  });
});

describe("regression: real URLs are untouched", () => {
  const urls: Array<[string, string]> = [
    ['external', 'https://example.com/pricing'],
    ['mailto', 'mailto:hello@w2w.design'],
    ['tel', 'tel:+995322000000'],
  ];

  for (const [label, href] of urls) {
    it(`${label} still lands in href and gets no linkAnchorId`, () => {
      const tree = convertW2WToWireframe(pageWithAnchorNav(href, 'Contact'));
      const link = nodeWithText(tree, 'Contact');
      expect(link?.href).toBe(href);
      expect(link?.linkAnchorId).toBeUndefined();
    });
  }
});
