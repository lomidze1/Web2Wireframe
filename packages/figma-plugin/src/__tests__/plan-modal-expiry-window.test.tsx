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
import ExpiringSoonModal from "../ui/components/modalPopup/ExpiringSoonModal";
import { ConfigProvider } from "../ui/shared/ConfigContext";
import { LicenseProvider } from "../ui/shared/LicenseContext";
import { applyAuthToken, type License } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "expiry-window-test-user";

function proLicense(daysUntilExpiry: number): License {
  const now = new Date().toISOString();
  return {
    figmaUserId: FIGMA_USER_ID,
    email: "billing@example.com",
    plan: "pro",
    status: "active",
    cycleStartedAt: now,
    cycleEndsAt: new Date(
      Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000,
    ).toISOString(),
    usage: { imports: 0, periodStartedAt: now },
    limits: { imports: null },
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

describe("Plan modal — Extend Pro visibility by days remaining", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the Extend Pro button when more than 7 days remain", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(proLicense(20)), {
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

    // Modal is loaded once the PRO badge renders.
    await waitFor(() => {
      expect(screen.getByText("PRO")).toBeTruthy();
    });
    expect(screen.queryByText(/extend pro/i)).toBeNull();
    expect(
      screen.queryByText(/buying now stacks 30 days/i),
    ).toBeNull();
  });

  it("shows the Extend Pro button when 7 or fewer days remain", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(proLicense(5)), {
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

    await waitFor(() => {
      expect(screen.getByText(/extend pro/i)).toBeTruthy();
    });
    expect(screen.getByText(/buying now stacks 30 days/i)).toBeTruthy();
  });
});

describe("ExpiringSoonModal", () => {
  it("renders the days-remaining headline and primary CTA", () => {
    render(
      <ExpiringSoonModal
        isOpen
        daysRemaining={2}
        onExtend={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/in 2 days/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^extend pro$/i })).toBeTruthy();
  });

  it("treats 1 day as 'today' urgency tier", () => {
    render(
      <ExpiringSoonModal
        isOpen
        daysRemaining={1}
        onExtend={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/ends today/i)).toBeTruthy();
  });

  it("invokes onExtend when the user clicks the primary CTA", () => {
    const onExtend = vi.fn();
    render(
      <ExpiringSoonModal
        isOpen
        daysRemaining={3}
        onExtend={onExtend}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^extend pro$/i }));
    expect(onExtend).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose when the user clicks the × close button", () => {
    const onClose = vi.fn();
    render(
      <ExpiringSoonModal
        isOpen
        daysRemaining={3}
        onExtend={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /close expiry reminder/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when isOpen is false", () => {
    render(
      <ExpiringSoonModal
        isOpen={false}
        daysRemaining={2}
        onExtend={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/your pro access/i)).toBeNull();
  });
});
