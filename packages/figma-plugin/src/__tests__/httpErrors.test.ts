import { describe, it, expect } from "vitest";
import { httpErrorMessage, toUserMessage } from "../ui/shared/httpErrors";

describe("httpErrorMessage", () => {
  it("returns a server-side message for 5xx", () => {
    expect(httpErrorMessage(500)).toMatch(/our side/i);
    expect(httpErrorMessage(503)).toMatch(/our side/i);
  });

  it("returns a rate-limit message for 429", () => {
    expect(httpErrorMessage(429)).toMatch(/too many requests/i);
  });

  it("returns a session message for 401 and 403", () => {
    expect(httpErrorMessage(401)).toMatch(/session expired/i);
    expect(httpErrorMessage(403)).toMatch(/session expired/i);
  });

  it("returns a generic request message for other 4xx", () => {
    expect(httpErrorMessage(404)).toMatch(/couldn't process/i);
    expect(httpErrorMessage(400)).toMatch(/couldn't process/i);
  });

  it("never leaks the raw status code", () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      expect(httpErrorMessage(status)).not.toMatch(/\d{3}/);
    }
  });
});

describe("toUserMessage", () => {
  it("maps a fetch network TypeError to a connection message", () => {
    const networkError = new TypeError("Failed to fetch");
    expect(toUserMessage(networkError, "fallback")).toMatch(/connection/i);
    expect(toUserMessage(networkError, "fallback")).not.toMatch(/failed to fetch/i);
  });

  it("passes through an intentional Error message", () => {
    expect(toUserMessage(new Error("Quota exceeded"), "fallback")).toBe(
      "Quota exceeded",
    );
  });

  it("uses the fallback for non-Error values", () => {
    expect(toUserMessage("oops", "fallback")).toBe("fallback");
    expect(toUserMessage(null, "fallback")).toBe("fallback");
  });
});
