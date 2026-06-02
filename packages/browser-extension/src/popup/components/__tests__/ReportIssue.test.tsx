/**
 * Component tests for popup/components/ReportIssue.tsx.
 *
 * Rendered with preact's own `render` (no @testing-library — it isn't a
 * dependency of this package, and `preact/test-utils` doesn't resolve under
 * this package's vitest setup). preact schedules re-renders on a microtask,
 * so `tick()` flushes the queue after each interaction.
 *
 * `chrome.runtime.sendMessage` is stubbed so we assert on the REPORT_ISSUE
 * payload without a real service worker.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "preact";
import { ReportIssue } from "../ReportIssue";

let container: HTMLDivElement;
let sendMessage: ReturnType<typeof vi.fn>;

/** Flush preact's debounced render queue plus any pending microtasks. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  sendMessage = vi.fn().mockResolvedValue({ success: true });
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(props: Parameters<typeof ReportIssue>[0]) {
  render(<ReportIssue {...props} />, container);
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector);
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const baseProps = {
  url: "https://broken.example/page",
  email: "user@example.com" as string | null,
  figmaUserId: "fig-123",
  statsSummary: "2 image(s) skipped",
};

describe("ReportIssue", () => {
  it("starts collapsed showing only the toggle", () => {
    mount({ ...baseProps });
    expect(q(".report-issue__toggle")).toBeTruthy();
    expect(q(".report-issue__textarea")).toBeNull();
  });

  it("expands the form when the toggle is clicked", async () => {
    mount({ ...baseProps });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();
    expect(q(".report-issue__textarea")).toBeTruthy();
  });

  it("pre-fills the description from the prefill prop", async () => {
    mount({ ...baseProps, prefill: "1 image couldn't be included\n- detail" });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();
    const textarea = q<HTMLTextAreaElement>(".report-issue__textarea")!;
    expect(textarea.value).toBe("1 image couldn't be included\n- detail");
    // A non-empty prefill already satisfies the 10-char minimum, so Send is live.
    expect(q<HTMLButtonElement>(".btn-primary")!.disabled).toBe(false);
  });

  it("hides the email field when an email is already known", async () => {
    mount({ ...baseProps, email: "user@example.com" });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();
    expect(q(".report-issue__email")).toBeNull();
  });

  it("shows the email field when no email is known (logged out)", async () => {
    mount({ ...baseProps, email: null });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();
    expect(q(".report-issue__email")).toBeTruthy();
  });

  it("keeps Send disabled until the description is long enough", async () => {
    mount({ ...baseProps });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();

    expect(q<HTMLButtonElement>(".btn-primary")!.disabled).toBe(true);

    setValue(q<HTMLTextAreaElement>(".report-issue__textarea")!, "Layout is broken");
    await tick();
    expect(q<HTMLButtonElement>(".btn-primary")!.disabled).toBe(false);
  });

  it("requires a valid email before enabling Send when logged out", async () => {
    mount({ ...baseProps, email: null });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();

    setValue(
      q<HTMLTextAreaElement>(".report-issue__textarea")!,
      "Images are missing from the wireframe",
    );
    await tick();
    // Description ok, but email is still empty → Send stays disabled.
    expect(q<HTMLButtonElement>(".btn-primary")!.disabled).toBe(true);

    setValue(q<HTMLInputElement>(".report-issue__email")!, "me@example.com");
    await tick();
    expect(q<HTMLButtonElement>(".btn-primary")!.disabled).toBe(false);
  });

  it("sends a REPORT_ISSUE message and shows the thanks state on success", async () => {
    mount({ ...baseProps });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();

    setValue(
      q<HTMLTextAreaElement>(".report-issue__textarea")!,
      "Layout is completely broken on capture",
    );
    await tick();

    q<HTMLButtonElement>(".btn-primary")!.click();
    await tick();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const msg = sendMessage.mock.calls[0][0];
    expect(msg.type).toBe("REPORT_ISSUE");
    expect(msg.payload).toMatchObject({
      url: "https://broken.example/page",
      email: "user@example.com",
      description: "Layout is completely broken on capture",
      figmaUserId: "fig-123",
      statsSummary: "2 image(s) skipped",
    });

    expect(q(".report-issue--thanks")).toBeTruthy();
    expect(container.textContent).toContain("Thanks for reporting this issue");
  });

  it("shows an error message when the background reports failure", async () => {
    sendMessage.mockResolvedValueOnce({
      success: false,
      error: "Please check the highlighted fields.",
    });
    mount({ ...baseProps });
    q<HTMLButtonElement>(".report-issue__toggle")!.click();
    await tick();

    setValue(
      q<HTMLTextAreaElement>(".report-issue__textarea")!,
      "Something went wrong here",
    );
    await tick();

    q<HTMLButtonElement>(".btn-primary")!.click();
    await tick();

    expect(q(".report-issue__error")?.textContent).toContain(
      "Please check the highlighted fields.",
    );
    expect(q(".report-issue--thanks")).toBeNull();
  });
});
