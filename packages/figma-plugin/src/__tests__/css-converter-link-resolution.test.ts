/**
 * Link resolution (h2d `G8`/`wq` parity).
 *
 * Before: `resolveLinkHref` looked at the node and its IMMEDIATE parent only,
 * so `<a><span><b>text</b></span></a>` lost its link entirely, and every
 * `mailto:`/`tel:` href was dropped on the floor.
 *
 * After: the resolved href is threaded DOWN the conversion so any depth of
 * wrapper inherits it, and mail/phone links survive (percent-decoded for
 * `mailto:`, which is frequently encoded).
 *
 * Still rejected: empty, `file:`, `javascript:`, a bare `//`, and `#`-only.
 * `#anchor` → target NODE is a deliberate follow-up (needs a hash→node map
 * built after the whole tree renders), not a half-implementation.
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

/** All nodes in the converted tree, flattened. */
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

/** The href carried by whichever node ended up owning the given text. */
function hrefForText(root: unknown, needle: string): string | undefined {
  const hit = allNodes(root).find(
    (n) => typeof n.textContent === 'string' && (n.textContent as string).includes(needle),
  );
  return hit?.href as string | undefined;
}

/** body > div > <a href> > span > b > TEXT — the link is 3 wrappers up. */
function deeplyWrappedLink(href: string, label = 'Deep link'): W2WFrameNode {
  return frame({
    tag: 'body',
    attr: { baseURI: 'https://example.com/docs/' },
    children: [
      frame({
        children: [
          frame({
            tag: 'a',
            attr: { href },
            styles: { display: 'inline' },
            children: [
              frame({
                tag: 'span',
                styles: { display: 'inline' },
                children: [
                  frame({
                    tag: 'b',
                    styles: { display: 'inline' },
                    children: [text(label)],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  }) as unknown as W2WFrameNode;
}

describe("resolveLinkHref: walks the whole ancestor chain", () => {
  it("keeps the link through <a><span><b>text</b></span></a>", () => {
    const tree = convertW2WToWireframe(deeplyWrappedLink('https://example.com/pricing'));
    expect(hrefForText(tree, 'Deep link')).toBe('https://example.com/pricing');
  });

  it("still resolves a link on the element itself", () => {
    const tree = convertW2WToWireframe(frame({
      tag: 'body',
      attr: { baseURI: 'https://example.com/' },
      children: [
        frame({
          tag: 'a',
          attr: { href: 'https://example.com/direct' },
          styles: { display: 'inline' },
          children: [text('Direct')],
        }),
      ],
    }) as unknown as W2WFrameNode);
    expect(hrefForText(tree, 'Direct')).toBe('https://example.com/direct');
  });
});

describe("resolveLinkHref: mailto / tel are real links", () => {
  it("keeps mailto: and percent-decodes it", () => {
    const tree = convertW2WToWireframe(
      deeplyWrappedLink('mailto:hello%40w2w.design?subject=Font%20bug', 'Email us'),
    );
    expect(hrefForText(tree, 'Email us')).toBe('mailto:hello@w2w.design?subject=Font bug');
  });

  it("keeps a mailto: that is not encoded", () => {
    const tree = convertW2WToWireframe(
      deeplyWrappedLink('mailto:hello@w2w.design', 'Email us'),
    );
    expect(hrefForText(tree, 'Email us')).toBe('mailto:hello@w2w.design');
  });

  it("keeps tel: verbatim", () => {
    const tree = convertW2WToWireframe(deeplyWrappedLink('tel:+995322000000', 'Call us'));
    expect(hrefForText(tree, 'Call us')).toBe('tel:+995322000000');
  });

  it("survives a malformed percent sequence instead of throwing", () => {
    const tree = convertW2WToWireframe(deeplyWrappedLink('mailto:a%ZZb@w2w.design', 'Email us'));
    expect(hrefForText(tree, 'Email us')).toBe('mailto:a%ZZb@w2w.design');
  });
});

describe("resolveLinkHref: rejected schemes", () => {
  const rejected: Array<[string, string]> = [
    ['empty', ''],
    ['whitespace only', '   '],
    ['file:', 'file:///Users/giorgi/Desktop/page.html'],
    ['javascript:', 'javascript:void(0)'],
    ['bare //', '//'],
    ['fragment only', '#section-2'],
  ];

  for (const [label, href] of rejected) {
    it(`drops ${label}`, () => {
      const tree = convertW2WToWireframe(deeplyWrappedLink(href, 'Not a link'));
      expect(hrefForText(tree, 'Not a link')).toBeUndefined();
    });
  }

  it("keeps a protocol-relative URL that actually has a host", () => {
    const tree = convertW2WToWireframe(deeplyWrappedLink('//cdn.example.com/a', 'CDN'));
    expect(hrefForText(tree, 'CDN')).toBe('https://cdn.example.com/a');
  });
});

describe("per-run link URLs reach the segments", () => {
  /**
   * `<p>Read the <a>docs</a>, the <a>pricing</a> or <a>email us</a>.</p>` —
   * one paragraph, three different destinations. Every run must remember its
   * own, otherwise the whole paragraph collapses to a single link.
   */
  function inlineRun(
    value: string,
    x: number,
    width: number,
    opts: { tag?: string; href?: string } = {},
  ): Record<string, unknown> {
    const run = text(value, { x, width });
    if (!opts.tag) return run;
    return frame({
      tag: opts.tag,
      x, width, height: 20,
      attr: opts.href ? { href: opts.href } : {},
      styles: { display: 'inline' },
      children: [run],
    });
  }

  it("stamps each anchor run with its own href", () => {
    const tree = convertW2WToWireframe(frame({
      tag: 'body',
      attr: { baseURI: 'https://w2w.design/' },
      children: [
        frame({
          tag: 'p',
          styles: { display: 'block' },
          children: [
            inlineRun('Read the ', 0, 70),
            inlineRun('docs', 70, 36, { tag: 'a', href: 'https://w2w.design/docs' }),
            inlineRun(', the ', 106, 42),
            inlineRun('pricing', 148, 52, { tag: 'a', href: 'https://w2w.design/pricing' }),
            inlineRun(' or ', 200, 28),
            inlineRun('email us', 228, 60, {
              tag: 'a',
              href: 'mailto:hello%40w2w.design',
            }),
            inlineRun('.', 288, 6),
          ],
        }),
      ],
    }) as unknown as W2WFrameNode);

    const host = allNodes(tree).find(
      (n) => Array.isArray(n.styledSegments) && (n.styledSegments as unknown[]).length > 1,
    );
    expect(host).toBeDefined();

    const segs = host!.styledSegments as Array<{ text: string; href?: string }>;
    const linked = segs.filter((sg) => sg.href).map((sg) => [sg.text.trim(), sg.href]);
    expect(linked).toEqual([
      ['docs', 'https://w2w.design/docs'],
      ['pricing', 'https://w2w.design/pricing'],
      ['email us', 'mailto:hello@w2w.design'],
    ]);
    // The plain runs between them stay unlinked.
    expect(segs.filter((sg) => !sg.href).length).toBe(segs.length - 3);
  });
});
