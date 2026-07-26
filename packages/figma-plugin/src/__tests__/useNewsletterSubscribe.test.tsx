/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/preact";

// Mock the network layer — the hook's contract is "call subscribeNewsletter
// with the given email and drive the status state machine". The actual fetch
// is covered by newsletterClient.test.ts.
const subscribeNewsletter = vi.fn();
vi.mock("../ui/shared/newsletterClient", () => ({
  subscribeNewsletter: (email: string) => subscribeNewsletter(email),
}));

import { useNewsletterSubscribe } from "../ui/hooks/useNewsletterSubscribe";

function Probe({ email }: { email: string | null }) {
  const { status, disabled, subscribe } = useNewsletterSubscribe(email);
  return (
    <button
      type="button"
      disabled={disabled}
      data-status={status}
      onClick={subscribe}
    >
      {status}
    </button>
  );
}

describe("useNewsletterSubscribe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeNewsletter.mockReset();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("subscribes with the provided email and transitions idle → loading → success", async () => {
    let resolve!: () => void;
    subscribeNewsletter.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );

    render(<Probe email="known@example.com" />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-status")).toBe("idle");

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(subscribeNewsletter).toHaveBeenCalledWith("known@example.com");
    expect(btn.getAttribute("data-status")).toBe("loading");

    await act(async () => {
      resolve();
    });
    expect(btn.getAttribute("data-status")).toBe("success");
  });

  it("resets back to idle after the success window", async () => {
    subscribeNewsletter.mockResolvedValue(undefined);
    render(<Probe email="known@example.com" />);
    const btn = screen.getByRole("button");

    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(btn.getAttribute("data-status")).toBe("success"));

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(btn.getAttribute("data-status")).toBe("idle");
  });

  it("goes to error when the request rejects", async () => {
    subscribeNewsletter.mockRejectedValue(new Error("boom"));
    render(<Probe email="known@example.com" />);
    const btn = screen.getByRole("button");

    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(btn.getAttribute("data-status")).toBe("error"));
  });

  it("is disabled and never calls the API when email is null", async () => {
    render(<Probe email={null} />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(subscribeNewsletter).not.toHaveBeenCalled();
  });
});
