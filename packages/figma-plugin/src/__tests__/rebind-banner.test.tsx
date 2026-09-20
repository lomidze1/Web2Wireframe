/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import RebindBanner from "../ui/components/rebindBanner/RebindBanner";

/**
 * The strip that tells the user an import substituted fonts. It sits between
 * the scrolling content and the footer bar, so it owns the plugin's full width
 * instead of competing with Extension + the plan pill for the ~106px the
 * footer's centre slot could spare.
 *
 * Dismissing it collapses it into the footer icon, which stays behind for as
 * long as the page still holds substituted fonts — that flight is what teaches
 * the user where the control went.
 */

const originalAnimate = (HTMLElement.prototype as { animate?: unknown }).animate;

function setup(count = 3) {
  const onReapply = vi.fn();
  const onDismiss = vi.fn();
  const utils = render(
    <RebindBanner count={count} onReapply={onReapply} onDismiss={onDismiss} />,
  );
  const button = (re: RegExp) =>
    Array.from(utils.container.querySelectorAll("button")).find(
      (b) => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLButtonElement | undefined;
  return { ...utils, onReapply, onDismiss, button };
}

afterEach(() => {
  (HTMLElement.prototype as { animate?: unknown }).animate = originalAnimate;
  document.querySelectorAll("[data-rebind-icon]").forEach((el) => el.remove());
});

describe("RebindBanner", () => {
  it("says how many fonts were substituted", () => {
    expect(setup(3).container.textContent).toMatch(/3 fonts substituted/);
  });

  it("counts a single font in the singular", () => {
    expect(setup(1).container.textContent).toMatch(/1 font substituted/);
  });

  it("opens the Re-apply flow", () => {
    const { button, onReapply } = setup();
    fireEvent.click(button(/^re-apply$/i)!);
    expect(onReapply).toHaveBeenCalledTimes(1);
  });

  it("dismisses straight away when the browser cannot animate", () => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    const { button, onDismiss } = setup();
    fireEvent.click(button(/dismiss/i)!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("exposes the hook the flight measures", () => {
    expect(setup().container.querySelector("[data-rebind-banner]")).toBeTruthy();
  });

  it("waits for the flight into the footer icon before dismissing", async () => {
    const target = document.createElement("div");
    target.setAttribute("data-rebind-icon", "");
    document.body.appendChild(target);
    const animation: { onfinish: null | (() => void) } = { onfinish: null };
    const animateSpy = vi.fn(() => animation);
    (HTMLElement.prototype as { animate?: unknown }).animate = animateSpy;

    const { button, onDismiss } = setup();
    fireEvent.click(button(/dismiss/i)!);

    await waitFor(() => expect(animateSpy).toHaveBeenCalled());
    expect(onDismiss).not.toHaveBeenCalled();

    animation.onfinish?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses only once when clicked twice", async () => {
    const target = document.createElement("div");
    target.setAttribute("data-rebind-icon", "");
    document.body.appendChild(target);
    const animation: { onfinish: null | (() => void) } = { onfinish: null };
    (HTMLElement.prototype as { animate?: unknown }).animate = vi.fn(() => animation);

    const { button, onDismiss } = setup();
    fireEvent.click(button(/dismiss/i)!);
    fireEvent.click(button(/dismiss/i)!);
    await waitFor(() => expect(animation.onfinish).toBeTruthy());

    animation.onfinish?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
