import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks BEFORE importing the service
// ============================================================================

const mockFind = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockSendSupportEmail = vi.fn();
const mockGenHtml = vi.fn(() => "<html>reminder</html>");
const mockGenText = vi.fn(() => "reminder text");

vi.mock("../src/models/License.js", () => ({
  License: {
    find: (...args: unknown[]) => mockFind(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

vi.mock("../src/services/emailService.js", () => ({
  sendSupportEmail: (...args: unknown[]) => mockSendSupportEmail(...args),
  generateExpiryReminderHtml: (...args: unknown[]) => mockGenHtml(...args),
  generateExpiryReminderText: (...args: unknown[]) => mockGenText(...args),
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    website: { baseUrl: "https://web2wireframe.test" },
    email: { noreplyEmail: "noreply@web2wireframe.test" },
  },
}));

const { runExpiryReminders } = await import(
  "../src/services/reminderService.js"
);

// ============================================================================
// Helpers
// ============================================================================

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    _id: "id-1",
    figmaUserId: "u-1",
    email: "user@example.com",
    cycleEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGenHtml.mockReturnValue("<html>reminder</html>");
  mockGenText.mockReturnValue("reminder text");
  mockSendSupportEmail.mockResolvedValue({ success: true });
});

// ============================================================================
// runExpiryReminders
// ============================================================================

describe("runExpiryReminders", () => {
  it("queries one-time Pro licenses expiring within 3 days, with NO $gt lower bound", async () => {
    mockFind.mockResolvedValue([]);
    await runExpiryReminders();

    expect(mockFind).toHaveBeenCalledOnce();
    const filter = mockFind.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.plan).toBe("pro");
    expect(filter["subscription.autoRenew"]).toEqual({ $ne: true });
    expect(filter["subscription.reminderSentAt"]).toBe(null);
    expect(filter.email).toEqual({ $ne: null });
    const cycleEndsAt = filter.cycleEndsAt as { $lt: Date; $gt?: Date };
    expect(cycleEndsAt.$lt).toBeInstanceOf(Date);
    expect(cycleEndsAt.$gt).toBeUndefined();
  });

  it("claims reminderSentAt atomically then sends one email per license", async () => {
    const cand = makeCandidate();
    mockFind.mockResolvedValue([cand]);
    mockFindOneAndUpdate.mockResolvedValue(cand);

    const result = await runExpiryReminders();

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "id-1", "subscription.reminderSentAt": null },
      { $set: { "subscription.reminderSentAt": expect.any(Date) } },
      { new: true },
    );
    expect(mockSendSupportEmail).toHaveBeenCalledOnce();
    expect(mockSendSupportEmail.mock.calls[0][0].to).toBe("user@example.com");
    expect(mockGenHtml.mock.calls[0][0].renewUrl).toBe(
      "https://web2wireframe.test/renew?uid=u-1",
    );
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("does not send when the atomic claim is lost to another runner", async () => {
    mockFind.mockResolvedValue([makeCandidate()]);
    mockFindOneAndUpdate.mockResolvedValue(null);

    const result = await runExpiryReminders();

    expect(mockSendSupportEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("does nothing and does not throw on an empty result set", async () => {
    mockFind.mockResolvedValue([]);
    const result = await runExpiryReminders();
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockSendSupportEmail).not.toHaveBeenCalled();
  });

  it("one send failure does not abort the rest", async () => {
    const a = makeCandidate({ _id: "a", figmaUserId: "ua", email: "a@x.com" });
    const b = makeCandidate({ _id: "b", figmaUserId: "ub", email: "b@x.com" });
    mockFind.mockResolvedValue([a, b]);
    mockFindOneAndUpdate.mockImplementation((filter: { _id: string }) =>
      Promise.resolve(filter._id === "a" ? a : b),
    );
    mockSendSupportEmail
      .mockRejectedValueOnce(new Error("resend down"))
      .mockResolvedValueOnce({ success: true });

    const result = await runExpiryReminders();

    expect(mockSendSupportEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, failed: 1 });
  });
});
