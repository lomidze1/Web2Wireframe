import { describe, it, expect } from "vitest";
import {
  organizationSchema,
  softwareApplicationSchema,
  productSchema,
  breadcrumbSchema,
  faqSchema,
} from "./schemas";

describe("organizationSchema", () => {
  it("has Organization @type and required fields", () => {
    expect(organizationSchema["@type"]).toBe("Organization");
    expect(organizationSchema.name).toBe("Web2Wireframe");
    expect(organizationSchema.url).toContain("web2wireframe.design");
  });
});

describe("softwareApplicationSchema", () => {
  it("lists Free, Pro Monthly, and Pro Yearly offers", () => {
    expect(softwareApplicationSchema["@type"]).toBe("SoftwareApplication");
    const offers = softwareApplicationSchema.offers as Array<{ name: string }>;
    const names = offers.map((o) => o.name);
    expect(names).toContain("Free");
    expect(names).toContain("Pro Monthly");
    expect(names).toContain("Pro Yearly");
  });

  it("prices match the launch plan ($16 monthly, $144 yearly)", () => {
    const offers = softwareApplicationSchema.offers as Array<{
      name: string;
      price: string;
    }>;
    expect(offers.find((o) => o.name === "Pro Monthly")?.price).toBe("16");
    expect(offers.find((o) => o.name === "Pro Yearly")?.price).toBe("144");
  });
});

describe("productSchema", () => {
  it("describes Pro and pins prices in USD", () => {
    expect(productSchema["@type"]).toBe("Product");
    expect(productSchema.name).toContain("Pro");
    const offers = productSchema.offers as Array<{ priceCurrency: string }>;
    for (const o of offers) {
      expect(o.priceCurrency).toBe("USD");
    }
  });
});

describe("breadcrumbSchema", () => {
  it("builds BreadcrumbList with 1-based positions and absolutized urls", () => {
    const schema = breadcrumbSchema([
      { name: "Home", url: "/" },
      { name: "Pricing", url: "/pricing" },
    ]);
    expect(schema["@type"]).toBe("BreadcrumbList");
    const items = schema.itemListElement as Array<{
      position: number;
      name: string;
      item: string;
    }>;
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
    expect(items[0].item).toBe("https://web2wireframe.design/");
    expect(items[1].item).toBe("https://web2wireframe.design/pricing");
  });

  it("preserves absolute URLs unchanged", () => {
    const schema = breadcrumbSchema([
      { name: "External", url: "https://example.com/foo" },
    ]);
    const items = schema.itemListElement as Array<{ item: string }>;
    expect(items[0].item).toBe("https://example.com/foo");
  });

  it("handles empty input gracefully", () => {
    const schema = breadcrumbSchema([]);
    expect(schema.itemListElement).toEqual([]);
  });
});

describe("faqSchema", () => {
  it("wraps each Q/A into a Question + acceptedAnswer Answer", () => {
    const schema = faqSchema([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]);
    expect(schema["@type"]).toBe("FAQPage");
    const entities = schema.mainEntity as Array<{
      "@type": string;
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }>;
    expect(entities).toHaveLength(2);
    expect(entities[0]["@type"]).toBe("Question");
    expect(entities[0].name).toBe("Q1?");
    expect(entities[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(entities[0].acceptedAnswer.text).toBe("A1.");
  });
});
