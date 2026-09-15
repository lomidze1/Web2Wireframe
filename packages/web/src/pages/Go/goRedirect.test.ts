import { describe, it, expect } from "vitest";
import { resolveGoRedirect } from "./goRedirect";
import { FIGMA_PLUGIN_URL } from "../../data/links";

describe("resolveGoRedirect", () => {
  it("keeps a channel slug and targets the plugin listing", () => {
    expect(resolveGoRedirect("linkedin")).toEqual({
      source: "linkedin",
      target: FIGMA_PLUGIN_URL,
    });
  });

  it("lowercases and drops anything outside [a-z0-9-]", () => {
    expect(resolveGoRedirect("LinkedIn").source).toBe("linkedin");
    expect(resolveGoRedirect("Product Hunt!").source).toBe("producthunt");
    expect(resolveGoRedirect("x-bio").source).toBe("x-bio");
  });

  it("falls back to 'other' for missing, empty or oversized slugs", () => {
    expect(resolveGoRedirect(undefined).source).toBe("other");
    expect(resolveGoRedirect("").source).toBe("other");
    expect(resolveGoRedirect("!!!").source).toBe("other");
    expect(resolveGoRedirect("a".repeat(31)).source).toBe("other");
  });

  it("always targets the plugin listing, whatever the slug", () => {
    for (const slug of ["x", "other", "<script>", "a".repeat(40), undefined]) {
      expect(resolveGoRedirect(slug).target).toBe(FIGMA_PLUGIN_URL);
    }
  });
});
