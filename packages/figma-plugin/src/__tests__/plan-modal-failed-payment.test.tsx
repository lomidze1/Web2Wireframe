/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/preact";

import Plan from "../ui/components/modalPopup/planPopup/Plan";
import { ConfigProvider } from "../ui/shared/ConfigContext";
import type { License } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "figma-user-failed-payment";
const CYCLE_ENDS_AT = "2026-06-04T10:00:00.000Z";

function makeProLicense(failureCount: number): License {
  const now = new Date().toISOString();
  return {
    figmaUserId: FIGMA_USER_ID,
    email: "user@example.com",
    plan: "pro",
    status: "active",
    cycleStartedAt: now,
    cycleEndsAt: CYCLE_ENDS_AT,
    usage: { imports: 5, periodStartedAt: now },
    limits: { imports: null },
    subscription: {
      flittOrderId: "order-1",
      activatedAt: now,
      nextBillingAt: CYCLE_ENDS_AT,
      canceledAt: null,
      lastFailedAt: failureCount > 0 ? now : null,
      failureCount,
    },
    createdAt: now,
    updatedAt: now,
  };
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

function getBanner(): HTMLElement | null {
  // CSS Modules return undefined at vitest runtime (no transformer wired),
  // so we tag the banner with `data-severity` for stable test selection.
  return document.querySelector<HTMLElement>("[data-severity]");
}

async function renderPlan(license: License): Promise<void> {
  mockLicenseFetch(license);
  render(
    <ConfigProvider>
      <Plan isOpen onClose={vi.fn()} />
    </ConfigProvider>,
  );
  act(() => {
    dispatchCurrentUser(FIGMA_USER_ID);
  });
  await waitFor(() => {
    expect(screen.getByText("Status")).toBeTruthy();
  });
}

describe("Plan modal — Failed payment banner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when failureCount = 0", async () => {
    await renderPlan(makeProLicense(0));
    expect(screen.queryByText(/Last payment attempt failed/i)).toBeNull();
  });

  it("renders info severity (yellow) when failureCount = 1", async () => {
    await renderPlan(makeProLicense(1));
    const banner = getBanner();
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-severity")).toBe("info");
    expect(banner!.textContent).toMatch(/1 attempt\b/);
  });

  it("renders warning severity (orange) when failureCount = 2", async () => {
    await renderPlan(makeProLicense(2));
    const banner = getBanner();
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-severity")).toBe("warning");
    expect(banner!.textContent).toMatch(/2 attempts/);
  });

  it("renders warning severity (orange) when failureCount = 3", async () => {
    await renderPlan(makeProLicense(3));
    const banner = getBanner();
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-severity")).toBe("warning");
  });

  it("renders urgent severity (red) when failureCount = 4", async () => {
    await renderPlan(makeProLicense(4));
    const banner = getBanner();
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-severity")).toBe("urgent");
    expect(banner!.textContent).toMatch(/4 attempts/);
  });

  it("includes formatted cycleEndsAt date in body", async () => {
    await renderPlan(makeProLicense(1));
    const banner = getBanner();
    expect(banner).not.toBeNull();
    // formatDate uses toLocaleDateString — the year and month should appear
    // somewhere in the rendered text regardless of locale-specific separator.
    expect(banner!.textContent).toMatch(/2026/);
    expect(banner!.textContent).toMatch(/Jun/);
  });
});
