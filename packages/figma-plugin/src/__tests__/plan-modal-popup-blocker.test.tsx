/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/preact";

import Plan from "../ui/components/modalPopup/planPopup/Plan";
import { ConfigProvider } from "../ui/shared/ConfigContext";
import { applyAuthToken, type License } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "popup-blocker-test-user";

function freeLicense(): License {
  const now = new Date().toISOString();
  return {
    figmaUserId: FIGMA_USER_ID,
    email: null,
    plan: "free",
    status: "active",
    cycleStartedAt: now,
    cycleEndsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    usage: { imports: 0, periodStartedAt: now },
    limits: { imports: 10 },
    subscription: null,
    createdAt: now,
    updatedAt: now,
  };
}

function dispatchCurrentUser(userId: string | null): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { pluginMessage: { type: "current-user", data: { userId } } },
    }),
  );
}

const CHECKOUT_URL = "https://pay.flitt.com/merchants/abc/index.html?token=xyz";

function mockFetchSequence(
  responses: Array<Response | Promise<Response>>,
): void {
  let i = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve(r);
  });
}

describe("Plan modal — popup blocker fallback (F7)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a fallback link when window.open returns null", async () => {
    mockFetchSequence([
      new Response(JSON.stringify(freeLicense()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(
        JSON.stringify({ checkoutUrl: CHECKOUT_URL, orderId: "ord_1" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ]);
    // Simulate a popup blocker: window.open returns null.
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <ConfigProvider>
        <Plan isOpen onClose={vi.fn()} />
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));
    await waitFor(() => screen.getByText("Get Pro"));

    await act(async () => {
      fireEvent.click(screen.getByText("Get Pro"));
    });

    await waitFor(() => {
      const link = screen.getByTestId(
        "checkout-fallback-link",
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.href).toBe(CHECKOUT_URL);
      expect(link.target).toBe("_blank");
    });
    expect(openSpy).toHaveBeenCalledWith(CHECKOUT_URL, "_blank");
    expect(
      screen.getByText(/Your browser blocked the checkout window/i),
    ).toBeTruthy();
  });

  it("does NOT show fallback link when window.open succeeds", async () => {
    mockFetchSequence([
      new Response(JSON.stringify(freeLicense()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(
        JSON.stringify({ checkoutUrl: CHECKOUT_URL, orderId: "ord_2" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ]);
    // Successful open — return a non-null windowProxy stub.
    vi.spyOn(window, "open").mockReturnValue({} as Window);

    render(
      <ConfigProvider>
        <Plan isOpen onClose={vi.fn()} />
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));
    await waitFor(() => screen.getByText("Get Pro"));

    await act(async () => {
      fireEvent.click(screen.getByText("Get Pro"));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Complete payment in your browser/i),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId("checkout-fallback-link")).toBeNull();
  });
});
