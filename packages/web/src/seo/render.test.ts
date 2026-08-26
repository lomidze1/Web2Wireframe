import { describe, it, expect } from "vitest";
import { renderHead } from "./render";
import type { SeoConfig } from "./types";

const baseConfig: SeoConfig = {
  title: "Test Title",
  description: "Test description",
  canonical: "https://www.web2wireframe.design/test",
};

describe("renderHead", () => {
  it("renders title, description, and canonical from config", () => {
    const html = renderHead(baseConfig);
    expect(html).toContain("<title>Test Title</title>");
    expect(html).toContain('<meta name="description" content="Test description" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://www.web2wireframe.design/test" />',
    );
  });

  it("emits Open Graph + Twitter cards with sensible defaults", () => {
    const html = renderHead(baseConfig);
    expect(html).toContain('property="og:site_name" content="Web2Wireframe"');
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('property="og:url" content="https://www.web2wireframe.design/test"');
  });

  it("falls back ogTitle/ogDescription to title/description when unset", () => {
    const html = renderHead(baseConfig);
    expect(html).toContain('property="og:title" content="Test Title"');
    expect(html).toContain('property="og:description" content="Test description"');
  });

  it("honors explicit ogTitle/ogDescription overrides", () => {
    const html = renderHead({
      ...baseConfig,
      ogTitle: "OG Title",
      ogDescription: "OG Desc",
    });
    expect(html).toContain('property="og:title" content="OG Title"');
    expect(html).toContain('property="og:description" content="OG Desc"');
    // Twitter mirrors og:* fallback chain
    expect(html).toContain('name="twitter:title" content="OG Title"');
  });

  it("uses DEFAULT_OG_IMAGE when ogImage is unset", () => {
    const html = renderHead(baseConfig);
    expect(html).toContain(
      'property="og:image" content="https://www.web2wireframe.design/og-image.png"',
    );
  });

  it("emits robots noindex when config.noindex is true", () => {
    const html = renderHead({ ...baseConfig, noindex: true });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it("omits robots meta tag when noindex is false/unset", () => {
    const html = renderHead(baseConfig);
    expect(html).not.toContain('name="robots"');
  });

  it("serializes JSON-LD scripts when provided", () => {
    const html = renderHead({
      ...baseConfig,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Test Co",
        },
      ],
    });
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"name":"Test Co"');
  });

  it("emits multiple JSON-LD scripts when array has several entries", () => {
    const html = renderHead({
      ...baseConfig,
      jsonLd: [
        { "@context": "https://schema.org", "@type": "Organization", name: "A" },
        { "@context": "https://schema.org", "@type": "Product", name: "B" },
      ],
    });
    const scriptCount = html.match(/<script type="application\/ld\+json">/g)?.length;
    expect(scriptCount).toBe(2);
  });

  // ==========================================================================
  // XSS / escaping — critical for security since these strings land in <head>
  // ==========================================================================

  it("escapes HTML special characters in title", () => {
    const html = renderHead({
      ...baseConfig,
      title: '<script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes ampersand in attribute values", () => {
    const html = renderHead({
      ...baseConfig,
      description: "Tom & Jerry",
    });
    expect(html).toContain('content="Tom &amp; Jerry"');
  });

  it("escapes double-quotes that would otherwise close an attribute", () => {
    const html = renderHead({
      ...baseConfig,
      description: 'Say "hello"',
    });
    expect(html).toContain("&quot;hello&quot;");
    expect(html).not.toContain('"hello"'); // unescaped form must not survive
  });

  it("escapes <script> inside JSON-LD via \\u003c", () => {
    // Even though JSON.stringify wraps it in a string, an embedded </script>
    // would close the surrounding script tag in HTML. The renderer replaces
    // < with < to defeat that.
    const html = renderHead({
      ...baseConfig,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          name: "</script><img src=x onerror=alert(1)>",
        },
      ],
    });
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c");
  });
});
