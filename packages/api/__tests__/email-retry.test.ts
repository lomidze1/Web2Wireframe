import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Resend BEFORE importing emailService — the helper accesses
// `getResend().emails.send()` which lazy-instantiates a Resend client.
const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    email: {
      resendApiKey: "re_test",
      noreplyEmail: "noreply@test",
    },
  },
}));

const {
  sendReceiptEmail,
  __setRetryDelaysForTests,
} = await import("../src/services/emailService.js");

let restoreDelays: () => void;

beforeEach(() => {
  mockSend.mockReset();
  // Zero delays in tests — we still exercise the retry COUNT but not the
  // wall-clock backoff. The number of array slots controls attempt count
  // (slots + 1 attempts).
  restoreDelays = __setRetryDelaysForTests([0, 0]);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  restoreDelays();
  vi.restoreAllMocks();
});

function receiptParams() {
  return {
    email: "u@x.com",
    amountCents: 1600,
    currency: "USD",
    orderId: "ord_1",
    paymentId: "pay_1",
    purchasedAt: new Date("2026-05-20T10:00:00Z"),
    proExpiresAt: new Date("2026-06-19T10:00:00Z"),
  };
}

describe("sendWithRetry behavior (via sendReceiptEmail)", () => {
  it("succeeds on first attempt — no retry", async () => {
    mockSend.mockResolvedValue({ error: null, data: { id: "msg_1" } });
    await sendReceiptEmail(receiptParams());
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("retries on Resend-returned error and succeeds on attempt 2", async () => {
    mockSend
      .mockResolvedValueOnce({ error: { message: "temporary blip" } })
      .mockResolvedValueOnce({ error: null });
    await sendReceiptEmail(receiptParams());
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("retries on a thrown network error and succeeds on attempt 3", async () => {
    mockSend
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({ error: null });
    await sendReceiptEmail(receiptParams());
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("gives up after retryDelays.length+1 attempts — never throws", async () => {
    mockSend.mockResolvedValue({ error: { message: "permanent" } });
    // Default delays array = [0,0] in this test → 3 attempts total.
    await expect(sendReceiptEmail(receiptParams())).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("never throws even if send() itself rejects on every attempt", async () => {
    mockSend.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(sendReceiptEmail(receiptParams())).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("attempts the configured number of times when delays array is empty", async () => {
    restoreDelays();
    restoreDelays = __setRetryDelaysForTests([]);
    mockSend.mockResolvedValue({ error: { message: "x" } });
    await sendReceiptEmail(receiptParams());
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
