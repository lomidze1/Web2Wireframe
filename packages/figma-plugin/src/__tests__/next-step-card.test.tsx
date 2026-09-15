/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import NextStepCard, {
  type ImportSnapshot,
} from "../ui/components/nextStepCard/NextStepCard";
import type { QuotaInfo } from "../ui/shared/quota";

/**
 * 60% of activated users import exactly once and never come back, while the
 * ones who stay re-import the same site with other settings. The card offers
 * that second step; these tests pin which actions it offers and what it says
 * about the free allowance.
 */

const SNAPSHOT: ImportSnapshot = {
  url: "https://stripe.com/",
  viewports: ["1440"],
  colorMode: "website",
  fontMode: "website",
  assetMode: "realAssets",
};

const finite = (remaining: number, limit = 10): QuotaInfo => ({
  unlimited: false,
  remaining,
  limit,
  nearLimit: remaining <= 2,
});

function setup(overrides: {
  snapshot?: ImportSnapshot;
  quota?: QuotaInfo | null;
  disabled?: boolean;
} = {}) {
  const handlers = {
    onImportMobile: vi.fn(),
    onAnotherPage: vi.fn(),
    onWireframe: vi.fn(),
    onDismiss: vi.fn(),
    onSeePro: vi.fn(),
  };
  const { container } = render(
    <NextStepCard
      snapshot={overrides.snapshot ?? SNAPSHOT}
      quota={overrides.quota === undefined ? finite(9) : overrides.quota}
      disabled={overrides.disabled ?? false}
      {...handlers}
    />
  );
  const button = (re: RegExp) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")
    ) as HTMLButtonElement | undefined;
  return { container, handlers, button };
}

describe("NextStepCard — actions", () => {
  it("offers mobile, another page and wireframe style after a desktop import", () => {
    const { button } = setup();
    expect(button(/mobile version/i)).toBeTruthy();
    expect(button(/another page/i)).toBeTruthy();
    expect(button(/wireframe style/i)).toBeTruthy();
  });

  it("skips the mobile action when 375 was already imported", () => {
    const { button } = setup({ snapshot: { ...SNAPSHOT, viewports: ["1440", "375"] } });
    expect(button(/mobile version/i)).toBeUndefined();
  });

  it("skips the wireframe action when the import was already wireframe-styled", () => {
    const { button } = setup({
      snapshot: { ...SNAPSHOT, colorMode: "plugin", fontMode: "plugin", assetMode: "placeholders" },
    });
    expect(button(/wireframe style/i)).toBeUndefined();
  });

  it("wires each action to its handler", () => {
    const { button, handlers } = setup();
    fireEvent.click(button(/mobile version/i)!);
    expect(handlers.onImportMobile).toHaveBeenCalledTimes(1);

    const second = setup();
    fireEvent.click(second.button(/another page/i)!);
    expect(second.handlers.onAnotherPage).toHaveBeenCalledTimes(1);

    const third = setup();
    fireEvent.click(third.button(/wireframe style/i)!);
    expect(third.handlers.onWireframe).toHaveBeenCalledTimes(1);
  });

  it("dismisses on ✕", () => {
    const { button, handlers } = setup();
    fireEvent.click(button(/dismiss suggestions/i)!);
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("disables the importing actions while an import is running", () => {
    const { button } = setup({ disabled: true });
    expect(button(/mobile version/i)!.disabled).toBe(true);
    expect(button(/wireframe style/i)!.disabled).toBe(true);
  });

  it("fires an importing action only once on a double click", () => {
    const { button, handlers } = setup();
    const mobile = button(/mobile version/i)!;
    fireEvent.click(mobile);
    fireEvent.click(mobile);
    expect(handlers.onImportMobile).toHaveBeenCalledTimes(1);
  });
});

describe("NextStepCard — free allowance", () => {
  it("says how many free imports are left and what an action costs", () => {
    const { container } = setup({ quota: finite(9) });
    expect(container.textContent).toMatch(/9 free imports left this month/);
    expect(container.textContent).toMatch(/Uses 1 of your 9 remaining imports/);
  });

  it("warns near the limit and offers Pro", () => {
    const { container, button, handlers } = setup({ quota: finite(2) });
    expect(container.textContent).toMatch(/Only 2 free imports left this month/);
    expect(container.textContent).toMatch(/Pro is unlimited/);
    fireEvent.click(button(/see pro/i)!);
    expect(handlers.onSeePro).toHaveBeenCalledTimes(1);
  });

  it("uses the singular for the last import", () => {
    const { container } = setup({ quota: finite(1) });
    expect(container.textContent).toMatch(/Only 1 free import left this month/);
  });

  it("drops the importing actions once the allowance is used up", () => {
    const { container, button } = setup({ quota: finite(0) });
    expect(container.textContent).toMatch(/You've used all 10 free imports this month/);
    expect(button(/mobile version/i)).toBeUndefined();
    expect(button(/wireframe style/i)).toBeUndefined();
    expect(button(/another page/i)).toBeTruthy();
    expect(button(/see pro/i)).toBeTruthy();
  });

  it("says nothing about imports to an unlimited plan", () => {
    const { container, button } = setup({ quota: { unlimited: true } });
    expect(container.textContent).not.toMatch(/imports? left|remaining/i);
    expect(button(/see pro/i)).toBeUndefined();
    expect(button(/mobile version/i)).toBeTruthy();
  });

  it("keeps the actions but shows no count when the allowance is unknown", () => {
    const { container, button } = setup({ quota: null });
    expect(container.textContent).not.toMatch(/imports? left|remaining/i);
    expect(button(/mobile version/i)).toBeTruthy();
    expect(button(/wireframe style/i)).toBeTruthy();
  });
});
