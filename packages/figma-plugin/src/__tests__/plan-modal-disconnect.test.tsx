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
import { applyAuthToken, type License } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "disconnect-test-user";

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

describe("Plan modal — Disconnect Figma", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a Disconnect Figma button once a license is loaded (connected)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(freeLicense()), {
        status: 200,
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

    const btn = await waitFor(() =>
      screen.getByRole("button", { name: /disconnect figma/i }),
    );
    expect(btn).toBeTruthy();
  });

  it("clicking Disconnect clears the token and fires w2w:auth-expired", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(freeLicense()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const authExpiredHandler = vi.fn();
    window.addEventListener("w2w:auth-expired", authExpiredHandler);
    // clearAuthToken() posts a `clear-auth-token` message to the sandbox.
    const postSpy = vi.spyOn(parent, "postMessage");

    try {
      render(
        <ConfigProvider>
          <LicenseProvider>
            <Plan isOpen onClose={vi.fn()} />
          </LicenseProvider>
        </ConfigProvider>,
      );
      act(() => dispatchCurrentUser(FIGMA_USER_ID));

      const btn = await waitFor(() =>
        screen.getByRole("button", { name: /disconnect figma/i }),
      );
      await act(async () => {
        fireEvent.click(btn);
      });

      expect(authExpiredHandler).toHaveBeenCalledTimes(1);
      expect(
        postSpy.mock.calls.some(
          ([msg]) =>
            (msg as { pluginMessage?: { type?: string } } | undefined)
              ?.pluginMessage?.type === "clear-auth-token",
        ),
      ).toBe(true);
    } finally {
      window.removeEventListener("w2w:auth-expired", authExpiredHandler);
    }
  });

  it("does NOT show the Disconnect button before a license loads (disconnected)", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(freeLicense()), {
        status: 200,
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
    // No current-user dispatched → no license fetched → no Disconnect button.
    expect(
      screen.queryByRole("button", { name: /disconnect figma/i }),
    ).toBeNull();
  });
});
