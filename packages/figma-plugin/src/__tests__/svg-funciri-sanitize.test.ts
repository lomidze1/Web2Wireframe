/**
 * stripe.com regression: gradient-filled icons imported solid black.
 *
 * The icons fill themselves from a gradient defined in their own `<defs>`:
 *
 *   <path fill="url(#apps-plus-gradient-id-:R9meupr6l6:)" …>
 *
 * The capture bakes the COMPUTED paint back into the attribute, and
 * `getComputedStyle().fill` serialises a reference the CSS way — with quotes:
 *
 *   fill="url(&quot;#apps-plus-gradient-id-:R9meupr6l6:&quot;)"
 *
 * An SVG presentation attribute is parsed as a `<FuncIRI>`, which has no quoted
 * form, so the reference dangles and the shape falls back to black. The
 * definition itself arrives intact — only the pointer to it is malformed.
 */
import { describe, it, expect } from "vitest";

import { sanitizeSvgMarkup } from "../rendering/realImages";

describe("sanitizeSvgMarkup", () => {
  it("unquotes the entity-escaped reference stripe.com actually sends", () => {
    const markup =
      '<svg><path fill="url(&quot;#apps-plus-gradient-id-:R9meupr6l6:&quot;)"/></svg>';

    expect(sanitizeSvgMarkup(markup)).toContain(
      'fill="url(#apps-plus-gradient-id-:R9meupr6l6:)"',
    );
    expect(sanitizeSvgMarkup(markup)).not.toContain("&quot;");
  });

  it("unquotes plain double and single quotes too", () => {
    expect(sanitizeSvgMarkup(`<path fill="url('#a')"/>`)).toContain('url(#a)');
    expect(sanitizeSvgMarkup(`<path fill='url("#a")'/>`)).toContain('url(#a)');
  });

  it("unquotes the numeric entity", () => {
    expect(sanitizeSvgMarkup('<path fill="url(&#34;#a&#34;)"/>')).toContain('url(#a)');
  });

  it("keeps the colons React's useId() puts in the id", () => {
    const out = sanitizeSvgMarkup('<path fill="url(&quot;#tag-id-:R4rapr6l6:&quot;)"/>');

    expect(out).toContain('url(#tag-id-:R4rapr6l6:)');
  });

  it("leaves an already-valid reference untouched", () => {
    const markup = '<svg><path fill="url(#grad)" stroke="url(#other)"/></svg>';

    expect(sanitizeSvgMarkup(markup)).toBe(markup);
  });

  it("fixes every reference in one markup, not just the first", () => {
    const markup =
      '<svg><path fill="url(&quot;#a&quot;)"/><path fill="url(&quot;#b&quot;)"/>' +
      '<g clip-path="url(&quot;#c&quot;)"/></svg>';

    const out = sanitizeSvgMarkup(markup);

    expect(out).toContain('url(#a)');
    expect(out).toContain('url(#b)');
    expect(out).toContain('url(#c)');
    expect(out).not.toContain("&quot;");
  });

  it("does not touch a data: URL", () => {
    // Quotes are legal — and load-bearing — around a data URI in CSS.
    const markup = '<image href="data:image/png;base64,iVBORw0KGgo="/>';

    expect(sanitizeSvgMarkup(markup)).toBe(markup);
  });

  it("does not touch an external url()", () => {
    const markup = '<path fill="url(&quot;https://example.com/x.svg#g&quot;)"/>';

    expect(sanitizeSvgMarkup(markup)).toBe(markup);
  });

  it("leaves the id attribute on the definition alone", () => {
    const markup =
      '<defs><linearGradient id="apps-plus-gradient-id-:R9meupr6l6:"><stop/></linearGradient></defs>';

    expect(sanitizeSvgMarkup(markup)).toBe(markup);
  });
});
