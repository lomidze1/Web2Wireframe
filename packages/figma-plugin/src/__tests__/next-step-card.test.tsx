/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import NextStepCard, {
  type ImportSnapshot,
} from "../ui/components/nextStepCard/NextStepCard";

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
  textMode: "website",
  assetMode: "realAssets",
};

const WIREFRAME = { label: "✏️ Try wireframe style" };

function setup(overrides: {
  snapshot?: ImportSnapshot;
  disabled?: boolean;
  nextStyle?: { label: string } | null;
  showChooseYourself?: boolean;
} = {}) {
  const handlers = {
    onImportMobile: vi.fn(),
    onAnotherPage: vi.fn(),
    onTryStyle: vi.fn(),
    onChooseYourself: vi.fn(),
    onDismiss: vi.fn(),
  };
  const { container } = render(
    <NextStepCard
      snapshot={overrides.snapshot ?? SNAPSHOT}
      disabled={overrides.disabled ?? false}
      nextStyle={overrides.nextStyle === undefined ? WIREFRAME : overrides.nextStyle}
      showChooseYourself={overrides.showChooseYourself ?? true}
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
  it("offers mobile, another page, the next style and choosing yourself", () => {
    const { button } = setup();
    expect(button(/mobile version/i)).toBeTruthy();
    expect(button(/another page/i)).toBeTruthy();
    expect(button(/wireframe style/i)).toBeTruthy();
    expect(button(/choose yourself/i)).toBeTruthy();
    // The longer label is only for when no ladder step is left.
    expect(button(/pick your own settings/i)).toBeUndefined();
  });

  it("offers only the next style right after the first import", () => {
    const { button } = setup({ showChooseYourself: false });
    expect(button(/wireframe style/i)).toBeTruthy();
    expect(button(/choose yourself/i)).toBeUndefined();
  });

  it("names whichever ladder step comes next", () => {
    const { button } = setup({ nextStyle: { label: "📐 Try low-fi sketch" } });
    expect(button(/low-fi sketch/i)).toBeTruthy();
    expect(button(/wireframe style/i)).toBeUndefined();
  });

  it("keeps Choose yourself once every style was tried", () => {
    const { button } = setup({ nextStyle: null });
    expect(button(/^\S*\s*Try /)).toBeUndefined();
    expect(button(/pick your own settings/i)).toBeTruthy();
  });

  it("skips the mobile action when 375 was already imported", () => {
    const { button } = setup({ snapshot: { ...SNAPSHOT, viewports: ["1440", "375"] } });
    expect(button(/mobile version/i)).toBeUndefined();
  });

  it("wires each action to its handler", () => {
    const first = setup();
    fireEvent.click(first.button(/mobile version/i)!);
    expect(first.handlers.onImportMobile).toHaveBeenCalledTimes(1);

    const second = setup();
    fireEvent.click(second.button(/another page/i)!);
    expect(second.handlers.onAnotherPage).toHaveBeenCalledTimes(1);

    const third = setup();
    fireEvent.click(third.button(/wireframe style/i)!);
    expect(third.handlers.onTryStyle).toHaveBeenCalledTimes(1);

    const fourth = setup();
    fireEvent.click(fourth.button(/choose yourself/i)!);
    expect(fourth.handlers.onChooseYourself).toHaveBeenCalledTimes(1);
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
    // Opening the settings panel costs nothing and stays available.
    expect(button(/choose yourself/i)!.disabled).toBe(false);
  });

  it("fires an importing action only once on a double click", () => {
    const { button, handlers } = setup();
    const style = button(/wireframe style/i)!;
    fireEvent.click(style);
    fireEvent.click(style);
    expect(handlers.onTryStyle).toHaveBeenCalledTimes(1);
  });
});

describe("NextStepCard — free mode (no allowance, no Pro)", () => {
  it("says nothing about imports left, limits or Pro", () => {
    const { container, button } = setup();
    expect(container.textContent).not.toMatch(/imports? left|remaining|free import|Pro\b/i);
    expect(button(/see pro/i)).toBeUndefined();
  });

  it("always offers the importing actions", () => {
    const { button } = setup();
    expect(button(/mobile version/i)).toBeTruthy();
    expect(button(/wireframe style/i)).toBeTruthy();
    expect(button(/another page/i)).toBeTruthy();
  });
});
