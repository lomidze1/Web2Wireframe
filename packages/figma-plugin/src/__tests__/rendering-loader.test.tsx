/** @jsx h */
import { h, render as preactRender } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import RenderingLoader from "../ui/components/renderingLoader/RenderingLoader";

/**
 * The loader now covers the WHOLE import, not just the render tail, so it has
 * to be honest about two things it never had to be before: where in the
 * pipeline we are (the four steps), and a way out of a 44-second capture
 * (Cancel).
 */
describe("RenderingLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when hidden", () => {
    const { container } = render(
      <RenderingLoader isVisible={false} progress={{ step: "x", percent: 10 }} />
    );
    expect(container.textContent).toBe("");
  });

  it("shows the live percentage in the ring", () => {
    const { getByTestId } = render(
      <RenderingLoader
        isVisible
        progress={{ step: "Building elements…", percent: 100, phase: "finalizing" }}
      />
    );
    expect(getByTestId("loader-percent").textContent).toBe("100");
  });

  it("maps the sandbox scale above the capture segment", () => {
    // Sandbox 0 is the START of the render half, not the start of the import.
    const { getByTestId } = render(
      <RenderingLoader
        isVisible
        progress={{ step: "Creating color styles…", percent: 0, phase: "styles" }}
      />
    );
    expect(Number(getByTestId("loader-percent").textContent)).toBe(65);
  });

  it("estimates the capture phase from elapsed time", () => {
    const { getByTestId } = render(
      <RenderingLoader
        isVisible
        progress={{
          step: "Importing the website…",
          percent: 0,
          phase: "capture",
          startedAt: Date.now() - 20_000,
          estimateMs: 20_000,
        }}
      />
    );
    const shown = Number(getByTestId("loader-percent").textContent);
    expect(shown).toBeGreaterThan(45);
    expect(shown).toBeLessThan(65);
  });

  it("never moves backwards when a later update reports less", () => {
    const { getByTestId, rerender } = render(
      <RenderingLoader
        isVisible
        progress={{ step: "Frames", percent: 80, phase: "building" }}
      />
    );
    const high = Number(getByTestId("loader-percent").textContent);
    rerender(
      <RenderingLoader
        isVisible
        progress={{ step: "Frames", percent: 20, phase: "styles" }}
      />
    );
    expect(Number(getByTestId("loader-percent").textContent)).toBe(high);
  });

  it("marks the four steps done / active / pending", () => {
    const { getByTestId } = render(
      <RenderingLoader
        isVisible
        progress={{ step: "Building elements…", percent: 50, phase: "building" }}
      />
    );
    expect(getByTestId("step-capture").getAttribute("data-state")).toBe("done");
    expect(getByTestId("step-styles").getAttribute("data-state")).toBe("done");
    expect(getByTestId("step-building").getAttribute("data-state")).toBe("active");
    expect(getByTestId("step-finalizing").getAttribute("data-state")).toBe("pending");
  });

  it("marks every step done once the import completes", () => {
    const { getByTestId } = render(
      <RenderingLoader
        isVisible
        progress={{ step: "Done", percent: 100, phase: "finalizing", isComplete: true }}
      />
    );
    expect(getByTestId("step-finalizing").getAttribute("data-state")).toBe("done");
  });

  it("offers Cancel during capture only", () => {
    const onCancel = vi.fn();
    const { queryByText, getByText, rerender } = render(
      <RenderingLoader
        isVisible
        onCancel={onCancel}
        progress={{ step: "Importing…", percent: 0, phase: "capture" }}
      />
    );
    fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Once the sandbox is building nodes there is nothing left to abort.
    rerender(
      <RenderingLoader
        isVisible
        onCancel={onCancel}
        progress={{ step: "Building…", percent: 50, phase: "building" }}
      />
    );
    expect(queryByText("Cancel")).toBeNull();
  });

  it("shows the success state and auto-dismisses", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { getByText } = render(
      <RenderingLoader
        isVisible
        onClose={onClose}
        progress={{ step: "Wireframe created!", percent: 100, isComplete: true }}
      />
    );
    expect(getByText("Done")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes early when Done is clicked", async () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <RenderingLoader
        isVisible
        onClose={onClose}
        progress={{ step: "Wireframe created!", percent: 100, isComplete: true }}
      />
    );
    fireEvent.click(getByText("Done"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("resets between imports so a new run does not inherit the old percentage", () => {
    const { getByTestId, rerender } = render(
      <RenderingLoader
        isVisible
        progress={{ step: "Frames", percent: 100, phase: "finalizing" }}
      />
    );
    expect(getByTestId("loader-percent").textContent).toBe("100");

    rerender(<RenderingLoader isVisible={false} />);
    rerender(
      <RenderingLoader
        isVisible
        progress={{
          step: "Importing…",
          percent: 0,
          phase: "capture",
          startedAt: Date.now(),
          estimateMs: 20_000,
        }}
      />
    );
    expect(Number(getByTestId("loader-percent").textContent)).toBeLessThan(5);
  });

  /**
   * The component is never unmounted between imports — the tabs just flip
   * `isVisible` — so `display` survives, and the effect that zeroed it ran
   * AFTER paint. Every import from the second one on therefore painted one
   * frame of the previous import's full ring before dropping back.
   *
   * `rerender` from testing-library flushes effects before it returns, so the
   * stale frame is invisible through it (the test above passes either way).
   * This one renders with Preact directly and reads the DOM synchronously —
   * i.e. exactly the frame the user sees.
   */
  it("shows no stale percentage on the frame before effects run", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    // Preact defers useEffect to a rAF; give it one, then a macrotask.
    const flush = () =>
      new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const percent = () =>
      Number(host.querySelector('[data-testid="loader-percent"]')!.textContent);

    try {
      preactRender(
        <RenderingLoader
          isVisible
          progress={{ step: "Frames", percent: 100, phase: "finalizing" }}
        />,
        host
      );
      await flush();
      expect(percent()).toBe(100);

      preactRender(<RenderingLoader isVisible={false} />, host);
      await flush();

      // Second import. Read BEFORE the effects run — no flush.
      preactRender(
        <RenderingLoader
          isVisible
          progress={{
            step: "Capturing the website…",
            percent: 0,
            phase: "capture",
            startedAt: Date.now(),
            estimateMs: 20_000,
          }}
        />,
        host
      );

      expect(percent()).toBeLessThan(5);
    } finally {
      preactRender(null, host);
      host.remove();
    }
  });

  it("opens straight on the target when an import starts mid-render", () => {
    // A `.w2w` file decodes in a second and the sandbox is already reporting;
    // the first paint should show where we are, not crawl from zero.
    const { getByTestId, rerender } = render(
      <RenderingLoader isVisible={false} progress={undefined} />
    );

    rerender(
      <RenderingLoader
        isVisible
        progress={{ step: "Creating nodes…", percent: 50, phase: "building" }}
      />
    );

    expect(Number(getByTestId("loader-percent").textContent)).toBeGreaterThan(65);
  });
});
