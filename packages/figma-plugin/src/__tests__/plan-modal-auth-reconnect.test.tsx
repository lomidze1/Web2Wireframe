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
import { LicenseProvider } from "../ui/shared/LicenseContext";
import { applyAuthToken } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "auth-reconnect-test-user";

function dispatchCurrentUser(userId: string | null): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { pluginMessage: { type: "current-user", data: { userId } } },
    }),
  );
}

describe("Plan modal — auth-failure recovery (Bug 3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a Reconnect Figma button when the license fetch returns 403", async () => {
    // 403 does NOT trigger isAuthExpired() (which only fires for 401), so the
    // user gets `httpErrorMessage(403)` = "Your session expired. Reconnect..."
    // with no automatic redirect. The recovery button gives them a way out.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <ConfigProvider>
        <LicenseProvider>
          <Plan isOpen onClose={vi.fn()} />
        </LicenseProvider>
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));

    await waitFor(() => {
      expect(screen.getByText(/your session expired/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /reconnect figma/i })).toBeTruthy();
  });

  it("clicking Reconnect Figma dispatches the w2w:auth-expired window event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const authExpiredHandler = vi.fn();
    window.addEventListener("w2w:auth-expired", authExpiredHandler);

    try {
      render(
        <ConfigProvider>
          <LicenseProvider>
            <Plan isOpen onClose={vi.fn()} />
          </LicenseProvider>
        </ConfigProvider>,
      );
      act(() => dispatchCurrentUser(FIGMA_USER_ID));

      const button = await waitFor(() =>
        screen.getByRole("button", { name: /reconnect figma/i }),
      );
      await act(async () => {
        fireEvent.click(button);
      });

      expect(authExpiredHandler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("w2w:auth-expired", authExpiredHandler);
    }
  });

  it("does NOT show the Reconnect button on a non-auth error (5xx)", async () => {
    // 500 → httpErrorMessage returns "Something went wrong on our side…"
    // (no "session expired" / "reconnect" wording) — reconnecting wouldn't fix
    // a server error, so we shouldn't suggest it.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "internal" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <ConfigProvider>
        <LicenseProvider>
          <Plan isOpen onClose={vi.fn()} />
        </LicenseProvider>
      </ConfigProvider>,
    );
    act(() => dispatchCurrentUser(FIGMA_USER_ID));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    });
    expect(
      screen.queryByRole("button", { name: /reconnect figma/i }),
    ).toBeNull();
  });
});
