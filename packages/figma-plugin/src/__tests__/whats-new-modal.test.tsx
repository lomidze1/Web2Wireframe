/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import WhatsNewModal from "../ui/components/modalPopup/WhatsNewModal";
import { LEGIBLY_URL } from "../ui/shared/whatsNew";

/**
 * The modal no longer just disappears: every way of closing it "docks" the
 * note — `onDock` fires at once (the banner under the Import button mounts),
 * the dialog flies into it, and `onClose` follows when the flight ends.
 */

const originalAnimate = (HTMLElement.prototype as any).animate;

const openExternalCalls = (spy: any) =>
  spy.mock.calls.filter((c: any) => c[0]?.pluginMessage?.type === "open-external");

function setup() {
  const onClose = vi.fn();
  const onDock = vi.fn();
  const postSpy = vi.spyOn(parent, "postMessage");
  const utils = render(<WhatsNewModal isOpen={true} onClose={onClose} onDock={onDock} />);
  const button = (re: RegExp) =>
    Array.from(utils.container.querySelectorAll("button")).find(
      (b) => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")
    ) as HTMLButtonElement | undefined;
  return { ...utils, onClose, onDock, postSpy, button };
}

afterEach(() => {
  vi.restoreAllMocks();
  (HTMLElement.prototype as any).animate = originalAnimate;
  document.querySelectorAll("[data-news-banner]").forEach((el) => el.remove());
});

describe("WhatsNewModal", () => {
  it("names Legibly and what it does", () => {
    const { container } = setup();
    expect(container.textContent).toMatch(/Legibly/);
    expect(container.textContent).toMatch(/accessib/i);
  });

  it("keeps it short: one plain Try Legibly button, no beta talk", () => {
    const { container, button } = setup();
    expect(button(/try legibly/i)!.textContent?.trim()).toBe("Try Legibly");
    expect(container.textContent).not.toMatch(/beta/i);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<WhatsNewModal isOpen={false} onClose={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("docks and closes from ×", async () => {
    const { button, onDock, onClose } = setup();
    fireEvent.click(button(/close/i)!);
    expect(onDock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("docks and closes from Maybe later", async () => {
    const { button, onDock, onClose } = setup();
    fireEvent.click(button(/maybe later/i)!);
    expect(onDock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("docks and closes from a click on the backdrop", async () => {
    const { container, onDock, onClose } = setup();
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onDock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("asks Figma to open Legibly, then docks and closes", async () => {
    const { button, postSpy, onDock, onClose } = setup();
    fireEvent.click(button(/try legibly/i)!);
    const calls = openExternalCalls(postSpy);
    expect(calls).toHaveLength(1);
    expect(calls[0][0].pluginMessage.data.url).toBe(LEGIBLY_URL);
    expect(onDock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });


  it("docks only once when closed twice", async () => {
    const { button, onDock, onClose } = setup();
    fireEvent.click(button(/close/i)!);
    fireEvent.click(button(/maybe later/i)!);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDock).toHaveBeenCalledTimes(1);
  });

  it("waits for the flight into the banner before closing", async () => {
    const target = document.createElement("div");
    target.setAttribute("data-news-banner", "");
    document.body.appendChild(target);
    const animation: { onfinish: null | (() => void) } = { onfinish: null };
    const animateSpy = vi.fn(() => animation);
    (HTMLElement.prototype as any).animate = animateSpy;

    const { button, onClose } = setup();
    fireEvent.click(button(/close/i)!);

    await waitFor(() => expect(animateSpy).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();

    animation.onfinish?.();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
