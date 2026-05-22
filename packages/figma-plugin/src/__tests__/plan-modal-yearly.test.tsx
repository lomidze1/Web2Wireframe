/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/preact";

import Plan from "../ui/components/modalPopup/planPopup/Plan";
import { ConfigProvider } from "../ui/shared/ConfigContext";
import { applyAuthToken, type License } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "yearly-test-user";

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

describe("Plan modal — Monthly vs Yearly tier UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders both Monthly $16 and Yearly $144 cards for a Free user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(freeLicense()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <ConfigProvider>
        <Plan isOpen onClose={vi.fn()} />
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));

    await waitFor(() => {
      expect(screen.getByText(/monthly · \$16/i)).toBeTruthy();
    });
    expect(screen.getByText(/yearly · \$144/i)).toBeTruthy();
    expect(screen.getByText(/save 25%/i)).toBeTruthy();
    expect(screen.getByTestId("get-pro-monthly")).toBeTruthy();
    expect(screen.getByTestId("get-pro-yearly")).toBeTruthy();
  });

  it("clicking the Monthly button posts plan='monthly' to /api/checkout/create", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.endsWith("/api/license/me")) {
        return Promise.resolve(
          new Response(JSON.stringify(freeLicense()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      // Checkout response — return any shape; we only care about the request
      // body the plugin sent to the backend.
      return Promise.resolve(
        new Response(
          JSON.stringify({
            checkoutUrl: "https://pay.flitt.test/c/m",
            orderId: "w2w_pro_u_m",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    vi.spyOn(window, "open").mockReturnValue({} as Window);

    render(
      <ConfigProvider>
        <Plan isOpen onClose={vi.fn()} />
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));
    const button = await waitFor(() => screen.getByTestId("get-pro-monthly"));

    await act(async () => {
      fireEvent.click(button);
    });

    // Find the checkout/create call among fetch calls (license fetch comes
    // first). Its body must declare plan: "monthly".
    const checkoutCall = fetchSpy.mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/api/checkout/create"),
    );
    expect(checkoutCall).toBeTruthy();
    const body = JSON.parse(
      ((checkoutCall?.[1] as RequestInit | undefined)?.body as string) ?? "{}",
    );
    expect(body.plan).toBe("monthly");
    expect(body.figmaUserId).toBe(FIGMA_USER_ID);
  });

  it("clicking the Yearly button posts plan='yearly' to /api/checkout/create", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.endsWith("/api/license/me")) {
        return Promise.resolve(
          new Response(JSON.stringify(freeLicense()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            checkoutUrl: "https://pay.flitt.test/c/y",
            orderId: "w2w_pro_u_y",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    vi.spyOn(window, "open").mockReturnValue({} as Window);

    render(
      <ConfigProvider>
        <Plan isOpen onClose={vi.fn()} />
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));
    const button = await waitFor(() => screen.getByTestId("get-pro-yearly"));

    await act(async () => {
      fireEvent.click(button);
    });

    const checkoutCall = fetchSpy.mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/api/checkout/create"),
    );
    expect(checkoutCall).toBeTruthy();
    const body = JSON.parse(
      ((checkoutCall?.[1] as RequestInit | undefined)?.body as string) ?? "{}",
    );
    expect(body.plan).toBe("yearly");
    expect(body.figmaUserId).toBe(FIGMA_USER_ID);
  });
});
