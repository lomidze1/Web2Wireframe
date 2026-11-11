import { describe, it, expect } from "vitest";
import {
  organizationSchema,
  softwareApplicationSchema,
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
  it("has exactly one offer: Free at $0", () => {
    expect(softwareApplicationSchema["@type"]).toBe("SoftwareApplication");
    const offers = softwareApplicationSchema.offers as Array<{
      name: string;
      price: string;
      priceCurrency: string;
    }>;
    expect(offers).toHaveLength(1);
    expect(offers[0].name).toBe("Free");
    expect(offers[0].price).toBe("0");
    expect(offers[0].priceCurrency).toBe("USD");
  });
});

describe("breadcrumbSchema", () => {
  it("builds BreadcrumbList with 1-based positions and absolutized urls", () => {
    const schema = breadcrumbSchema([
      { name: "Home", url: "/" },
      { name: "Docs", url: "/docs" },
    ]);
    expect(schema["@type"]).toBe("BreadcrumbList");
    const items = schema.itemListElement as Array<{
      position: number;
      name: string;
      item: string;
    }>;
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
    expect(items[0].item).toBe("https://www.web2wireframe.design/");
    expect(items[1].item).toBe("https://www.web2wireframe.design/docs");
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
