/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import NewsBanner from "../ui/components/newsBanner/NewsBanner";
import { LEGIBLY_URL } from "../ui/shared/whatsNew";

function setup() {
  const onDismiss = vi.fn();
  const postSpy = vi.spyOn(parent, "postMessage");
  const { container } = render(<NewsBanner onDismiss={onDismiss} />);
  const button = (re: RegExp) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")
    ) as HTMLButtonElement | undefined;
  return { container, onDismiss, postSpy, button };
}

afterEach(() => vi.restoreAllMocks());

describe("NewsBanner", () => {
  it("is the docking target and names Legibly in one line", () => {
    const { container } = setup();
    expect(container.querySelector("[data-news-banner]")).toBeTruthy();
    expect(container.textContent).toMatch(/New from us: Legibly/);
    expect(container.textContent).toMatch(/accessibility/i);
  });

  it("asks Figma to open Legibly with the tracking link", () => {
    const { button, postSpy, container } = setup();
    fireEvent.click(button(/try/i)!);
    const calls = postSpy.mock.calls.filter(
      (c: any) => c[0]?.pluginMessage?.type === "open-external"
    );
    expect(calls).toHaveLength(1);
    expect((calls[0][0] as any).pluginMessage.data.url).toBe(LEGIBLY_URL);
    // No raw URL fallback on screen any more.
    expect(container.querySelector("a")).toBeNull();
  });

  it("hides from its own ×", () => {
    const { button, onDismiss } = setup();
    fireEvent.click(button(/hide legibly note/i)!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
