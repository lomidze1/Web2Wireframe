/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/preact";
import Footer from "../ui/components/footer/Footer";
import QuotaExceededModal from "../ui/components/modalPopup/QuotaExceededModal";

/**
 * W2W is free since 2026-11-07 (docs/plans/PLUGIN-free-release.md): no plan
 * pill, no Pro upsell anywhere. The server still caps Free at 1000/month as a
 * fair-use guard, so the quota modal stays, but price-free.
 */

const licenseWithUsage = {
  figmaUserId: "u-1",
  email: null,
  plan: "free" as const,
  status: "active",
  cycleStartedAt: "",
  cycleEndsAt: "",
  usage: { imports: 3, periodStartedAt: "" },
  limits: { imports: 1000 },
  subscription: null,
  createdAt: "",
  updatedAt: "",
};

vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => ({ license: licenseWithUsage, isLoading: false, error: null, refresh: vi.fn() }),
}));

describe("Footer — free mode", () => {
  it("shows no plan pill or import count", () => {
    const { container } = render(
      <Footer
        onSettingsClick={vi.fn()}
        onHelpClick={vi.fn()}
        onExtensionClick={vi.fn()}
        // Old callers may still pass this; the pill must not come back.
        {...({ onPlanClick: vi.fn() } as Record<string, unknown>)}
      />,
    );
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+|Pro\b/);
    expect(container.querySelector('[aria-label^="Plan"]')).toBeNull();
  });
});

describe("QuotaExceededModal — fair-use notice", () => {
  it("explains the monthly limit with no price or Pro upsell", () => {
    const { container } = render(<QuotaExceededModal isOpen={true} onClose={vi.fn()} />);
    expect(container.textContent).toMatch(/1000/);
    expect(container.textContent).toMatch(/next month/i);
    expect(container.textContent).not.toMatch(/\$|Pro\b|Flitt|upgrade/i);
  });
});
