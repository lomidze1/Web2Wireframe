import { describe, it, expect } from "vitest";
import { getDomainFromUrl } from "./download";

describe("getDomainFromUrl", () => {
  it("extracts the hostname and underscores the dots", () => {
    expect(getDomainFromUrl("https://example.com/foo")).toBe("example_com");
  });

  it("strips a leading `www.` prefix", () => {
    expect(getDomainFromUrl("https://www.example.com")).toBe("example_com");
    // Only the leading www. — internal `www` doesn't count
    expect(getDomainFromUrl("https://www.foo.www.example.com")).toBe(
      "foo_www_example_com",
    );
  });

  it("handles deep subdomains", () => {
    expect(getDomainFromUrl("https://a.b.c.example.co.uk/path")).toBe(
      "a_b_c_example_co_uk",
    );
  });

  it("ignores port, path, query, and fragment", () => {
    expect(getDomainFromUrl("https://example.com:8080/x?y=z#h")).toBe(
      "example_com",
    );
  });

  it("falls back to `website` for an invalid URL", () => {
    expect(getDomainFromUrl("not a url")).toBe("website");
    expect(getDomainFromUrl("")).toBe("website");
  });

  it("works for non-https schemes with a hostname", () => {
    expect(getDomainFromUrl("http://localhost:3000/")).toBe("localhost");
  });
});
