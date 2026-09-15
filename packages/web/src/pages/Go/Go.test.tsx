import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Go from "./Go";
import { REDIRECT_DELAY_MS } from "./goRedirect";
import { FIGMA_PLUGIN_URL } from "../../data/links";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/go/:source" element={<Go />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Go redirect page", () => {
  let replace: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    replace = vi
      .spyOn(window.location, "replace")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a fallback link to the plugin listing", () => {
    renderAt("/go/linkedin");
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      FIGMA_PLUGIN_URL,
    );
  });

  it("redirects once, only after the delay", () => {
    renderAt("/go/linkedin");
    vi.advanceTimersByTime(REDIRECT_DELAY_MS - 1);
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(FIGMA_PLUGIN_URL);
  });

  it("does not redirect if the page unmounts before the delay", () => {
    const { unmount } = renderAt("/go/x");
    unmount();
    vi.advanceTimersByTime(REDIRECT_DELAY_MS * 2);
    expect(replace).not.toHaveBeenCalled();
  });
});
