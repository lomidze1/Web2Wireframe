import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks BEFORE importing the service
// ============================================================================

const mockContactsCreate = vi.fn();

// Resend SDK — newsletterService instantiates `new Resend(apiKey)` and uses
// `client.contacts.create({ audience_id, email })`. Mock the constructor so
// every instance exposes the same vi.fn() we can assert against.
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    contacts: { create: mockContactsCreate },
  })),
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    email: {
      resendApiKey: "re_test_key",
      noreplyEmail: "noreply@test",
      supportToEmail: "support@test",
    },
    newsletter: {
      audienceId: "aud_test_123",
    },
  },
}));

const { subscribeToNewsletter, __resetNewsletterClientForTests } = await import(
  "../src/services/newsletterService.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  __resetNewsletterClientForTests();
});

// ============================================================================
// subscribeToNewsletter
// ============================================================================

describe("subscribeToNewsletter", () => {
  it("returns ok=true and calls Resend contacts.create with audience_id+email", async () => {
    mockContactsCreate.mockResolvedValue({
      data: { id: "contact_1", name: "", created_at: "now" },
      error: null,
    });

    const result = await subscribeToNewsletter("user@example.com");

    expect(result).toEqual({ ok: true });
    expect(mockContactsCreate).toHaveBeenCalledWith({
      audience_id: "aud_test_123",
      email: "user@example.com",
      unsubscribed: false,
    });
  });

  it("normalizes email (trim + lowercase) before sending to Resend", async () => {
    mockContactsCreate.mockResolvedValue({ data: { id: "c1" }, error: null });

    await subscribeToNewsletter("  USER@Example.COM  ");

    expect(mockContactsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
    );
  });

  it("returns ok=true (idempotent) when Resend says the contact already exists", async () => {
    mockContactsCreate.mockResolvedValue({
      data: null,
      error: { message: "Contact already exists in this audience" },
    });

    const result = await subscribeToNewsletter("dup@example.com");

    expect(result).toEqual({ ok: true });
  });

  it("returns ok=false with error when Resend returns a non-duplicate error", async () => {
    mockContactsCreate.mockResolvedValue({
      data: null,
      error: { message: "Invalid API key" },
    });

    const result = await subscribeToNewsletter("user@example.com");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid API key");
    }
  });

  it("returns ok=false when Resend throws an exception", async () => {
    mockContactsCreate.mockRejectedValue(new Error("network down"));

    const result = await subscribeToNewsletter("user@example.com");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("network down");
    }
  });
});
