/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/preact";

import Plan from "../ui/components/modalPopup/planPopup/Plan";
import { ConfigProvider } from "../ui/shared/ConfigContext";
import { LicenseProvider } from "../ui/shared/LicenseContext";
import { applyAuthToken } from "../ui/shared/licenseClient";

const FIGMA_USER_ID = "subscribe-test-user";

function dispatchCurrentUser(userId: string | null): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { pluginMessage: { type: "current-user", data: { userId } } },
    }),
  );
}

function licenseJson(email: string | null) {
  const now = new Date().toISOString();
  return {
    figmaUserId: FIGMA_USER_ID,
    email,
    plan: "free",
    status: "active",
    cycleStartedAt: now,
    cycleEndsAt: new Date(Date.now() + 30 * 864e5).toISOString(),
    usage: { imports: 3, periodStartedAt: now },
    limits: { imports: 10 },
    subscription: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Route fetch: license fetch returns `email`; record subscribe calls. */
function mockFetch(email: string | null) {
  const subscribeBodies: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/newsletter/subscribe")) {
      subscribeBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/license/me")) {
      return new Response(JSON.stringify(licenseJson(email)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
  return subscribeBodies;
}

function renderPlan() {
  render(
    <ConfigProvider>
      <LicenseProvider>
        <Plan isOpen onClose={vi.fn()} />
      </LicenseProvider>
    </ConfigProvider>,
  );
  act(() => dispatchCurrentUser(FIGMA_USER_ID));
}

describe("Plan modal — one-click Subscribe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });
  afterEach(() => vi.restoreAllMocks());

  it("subscribes with the license email — no email typed by the user", async () => {
    const subscribeBodies = mockFetch("known@example.com");
    renderPlan();

    const btn = await waitFor(() =>
      screen.getByRole("button", { name: /subscribe/i }),
    );
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() =>
      expect(subscribeBodies).toEqual([{ email: "known@example.com" }]),
    );
  });

  it("disables the Subscribe button when the license has no email", async () => {
    mockFetch(null);
    renderPlan();

    const btn = (await waitFor(() =>
      screen.getByRole("button", { name: /subscribe/i }),
    )) as HTMLButtonElement;

    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBeTruthy();
  });
});
