/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import Footer from "../ui/components/footer/Footer";

/**
 * The plugin window is a fixed 410px, and the footer's three groups never
 * shrink (every button is `white-space: nowrap`). A labelled "Re-apply to
 * selection" button in the centre slot needed ~156px where only ~106px was
 * left, so it pushed the right-hand group — Extension + the plan pill — off
 * the edge.
 *
 * The prompt moved out to its own strip above the footer; what stays here is a
 * 32px icon in the left group, styled like its neighbours and carrying the
 * same unseen-dot affordance as "What's new".
 */

vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => ({ license: null, isLoading: false, error: null, refresh: vi.fn() }),
}));

function setup(
  props: {
    showRebindFonts?: boolean;
    rebindUnseen?: boolean;
    rebindAriaLabel?: string;
  } = {},
) {
  const onRebindFontsClick = vi.fn();
  const { container } = render(
    <Footer
      onSettingsClick={vi.fn()}
      onHelpClick={vi.fn()}
      showRebindFonts={true}
      onRebindFontsClick={onRebindFontsClick}
      {...props}
    />,
  );
  const rebindButton = container.querySelector(
    "[data-rebind-icon]",
  ) as HTMLButtonElement | null;
  return { container, onRebindFontsClick, rebindButton };
}

describe("Footer — Re-apply fonts icon", () => {
  it("offers an icon button when the page has substituted fonts", () => {
    const { rebindButton, onRebindFontsClick } = setup();
    expect(rebindButton).toBeTruthy();
    fireEvent.click(rebindButton!);
    expect(onRebindFontsClick).toHaveBeenCalledTimes(1);
  });

  it("stays out of the footer when nothing needs re-applying", () => {
    expect(setup({ showRebindFonts: false }).rebindButton).toBeNull();
  });

  it("marks fonts the user has not looked at yet with a dot", () => {
    expect(
      setup({ rebindUnseen: true }).container.querySelector("[data-rebind-dot]"),
    ).toBeTruthy();
  });

  it("drops the dot once the user has seen the notice", () => {
    expect(
      setup({ rebindUnseen: false }).container.querySelector("[data-rebind-dot]"),
    ).toBeNull();
  });

  it("names the action for screen readers and on hover", () => {
    const { rebindButton } = setup();
    expect(rebindButton!.getAttribute("aria-label")).toBe("Re-apply original fonts");
    expect(rebindButton!.getAttribute("title")).toBe("Re-apply original fonts");
  });

  it("says when Re-apply would target the selection", () => {
    const { rebindButton } = setup({
      rebindAriaLabel: "Re-apply original fonts to selection",
    });
    expect(rebindButton!.getAttribute("aria-label")).toBe(
      "Re-apply original fonts to selection",
    );
  });

  it("carries no visible label — the width it used to take is what broke the bar", () => {
    const { rebindButton, container } = setup({
      rebindAriaLabel: "Re-apply original fonts to selection",
    });
    expect(rebindButton!.textContent?.trim()).toBe("");
    expect(container.textContent).not.toMatch(/Re-apply/);
  });
});
