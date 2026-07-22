import { describe, it, expect, vi, afterEach } from "vitest";
import { subscribeNewsletter } from "../ui/shared/newsletterClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribeNewsletter", () => {
  it("POSTs the email as JSON to /api/newsletter/subscribe", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await subscribeNewsletter("user@example.com");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/newsletter/subscribe");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({ email: "user@example.com" });
  });

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "subscription_failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(subscribeNewsletter("user@example.com")).rejects.toThrow();
  });
});
