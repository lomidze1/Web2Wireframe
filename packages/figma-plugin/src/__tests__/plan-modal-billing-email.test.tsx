/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/preact";

import Plan from "../ui/components/modalPopup/planPopup/Plan";
import { ConfigProvider } from "../ui/shared/ConfigContext";
import { LicenseProvider } from "../ui/shared/LicenseContext";
import { applyAuthToken, type License } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "figma-user-billing-test";

function makeLicense(overrides: Partial<License>): License {
  const now = new Date().toISOString();
  const base: License = {
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
  return { ...base, ...overrides };
}

function mockLicenseFetch(license: License): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(license), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function dispatchCurrentUser(userId: string | null): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        pluginMessage: {
          type: "current-user",
          data: { userId },
        },
      },
    }),
  );
}

describe("Plan modal — Billing email row", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Seed a plugin token so fetchMyLicense can issue its authed request.
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the row when license is Pro AND email is set", async () => {
    mockLicenseFetch(
      makeLicense({
        plan: "pro",
        status: "active",
        email: "user@example.com",
        limits: { imports: null },
        subscription: {
          flittOrderId: "order-1",
          activatedAt: new Date().toISOString(),
          nextBillingAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          canceledAt: null,
        },
      }),
    );

    render(
      <ConfigProvider>
        <LicenseProvider>
          <Plan isOpen onClose={vi.fn()} />
        </LicenseProvider>
      </ConfigProvider>,
    );

    act(() => {
      dispatchCurrentUser(FIGMA_USER_ID);
    });

    await waitFor(() => {
      expect(screen.getByText("Billing email")).toBeTruthy();
    });
    expect(screen.getByText("user@example.com")).toBeTruthy();
  });

  it("hides the row when license is Free (even if email is set)", async () => {
    mockLicenseFetch(
      makeLicense({
        plan: "free",
        email: "free-user@example.com",
      }),
    );

    render(
      <ConfigProvider>
        <LicenseProvider>
          <Plan isOpen onClose={vi.fn()} />
        </LicenseProvider>
      </ConfigProvider>,
    );

    act(() => {
      dispatchCurrentUser(FIGMA_USER_ID);
    });

    // Wait for the license to load (Status row appears).
    await waitFor(() => {
      expect(screen.getByText("Status")).toBeTruthy();
    });

    expect(screen.queryByText("Billing email")).toBeNull();
    expect(screen.queryByText("free-user@example.com")).toBeNull();
  });

  it("hides the row when license is Pro but email is null", async () => {
    mockLicenseFetch(
      makeLicense({
        plan: "pro",
        status: "active",
        email: null,
        limits: { imports: null },
        subscription: {
          flittOrderId: "order-2",
          activatedAt: new Date().toISOString(),
          nextBillingAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          canceledAt: null,
        },
      }),
    );

    render(
      <ConfigProvider>
        <LicenseProvider>
          <Plan isOpen onClose={vi.fn()} />
        </LicenseProvider>
      </ConfigProvider>,
    );

    act(() => {
      dispatchCurrentUser(FIGMA_USER_ID);
    });

    await waitFor(() => {
      expect(screen.getByText("Status")).toBeTruthy();
    });

    expect(screen.queryByText("Billing email")).toBeNull();
  });
});
