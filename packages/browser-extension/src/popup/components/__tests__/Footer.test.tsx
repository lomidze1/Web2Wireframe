/**
 * Component tests for popup/components/Footer.tsx.
 *
 * The middle usage slot used to render a hardcoded "0/10 imports per month"
 * for signed-out users — a placeholder indistinguishable from a real count,
 * on a surface that can't spend quota (the Figma plugin does, at import time).
 * It is now hidden until a license is actually loaded.
 *
 * Rendered with preact's own `render` (no @testing-library — it isn't a
 * dependency of this package), mirroring ReportIssue.test.tsx.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "preact";
import type { License, SessionState } from "../../../shared/types";
import { Footer } from "../Footer";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.restoreAllMocks();
});

function fakeLicense(overrides: Partial<License> = {}): License {
  return {
    figmaUserId: "u-1",
    email: null,
    plan: "free",
    status: "active",
    cycleStartedAt: "2026-05-01T00:00:00.000Z",
    cycleEndsAt: "2026-06-01T00:00:00.000Z",
    usage: { imports: 0, periodStartedAt: "2026-05-01T00:00:00.000Z" },
    limits: { imports: 10 },
    subscription: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const fakeSession: SessionState = {
  sessionToken: "t",
  expiresAt: Date.now() + 86_400_000,
  figmaUserId: "u-1",
  email: "a@b.c",
  cachedLicense: null,
};

function mount(props: Partial<Parameters<typeof Footer>[0]> = {}) {
  render(
    <Footer
      onPlanClick={() => undefined}
      onHelpClick={() => undefined}
      onIdentityClick={() => undefined}
      license={null}
      session={null}
      {...props}
    />,
    container,
  );
}

describe("Footer usage pill", () => {
  it("hides the pill entirely when no license is loaded", () => {
    mount({ license: null });

    expect(container.querySelector(".usage-pill")).toBeNull();
    // The two icon buttons still frame the footer.
    expect(container.querySelectorAll(".footer-btn")).toHaveLength(2);
  });

  it("shows a real count once a free license is loaded", () => {
    mount({
      license: fakeLicense({
        usage: { imports: 3, periodStartedAt: "2026-05-01T00:00:00.000Z" },
      }),
      session: fakeSession,
    });

    const pill = container.querySelector(".usage-pill");
    expect(pill?.textContent).toBe("3/10 imports per month");
  });

  it("shows 'Pro' for a pro license", () => {
    mount({
      license: fakeLicense({
        plan: "pro",
        limits: { imports: null },
        usage: { imports: 7, periodStartedAt: "2026-05-01T00:00:00.000Z" },
      }),
      session: fakeSession,
    });

    const pill = container.querySelector(".usage-pill");
    expect(pill?.textContent).toBe("Pro");
    expect(pill?.className).toContain("usage-pill-pro");
  });

  it("keeps the sign-in path working with the pill hidden", () => {
    const onIdentityClick = vi.fn();
    mount({ license: null, session: null, onIdentityClick });

    const identity = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sign in with Figma"]',
    );
    expect(identity).not.toBeNull();
    identity?.click();
    expect(onIdentityClick).toHaveBeenCalledTimes(1);
  });
});
