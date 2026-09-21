import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import A11yFix, { A11Y_FIX_THANKS_PATH } from "./A11yFix";
import Go from "../Go/Go";

const Where = () => <span data-testid="path">{useLocation().pathname}</span>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/go/a11y-fix" element={<A11yFix />} />
        <Route path={A11Y_FIX_THANKS_PATH} element={<A11yFix submitted />} />
        <Route path="/go/:source" element={<Go />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

describe("A11yFix fake-door page", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says honestly the feature is not ready and does not redirect", () => {
    vi.useFakeTimers();
    const replace = vi
      .spyOn(window.location, "replace")
      .mockImplementation(() => undefined);
    renderAt("/go/a11y-fix");
    expect(screen.getByText(/still being built/i)).toBeTruthy();
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps the submit disabled until the email looks valid", () => {
    renderAt("/go/a11y-fix");
    const button = screen.getByRole("button", { name: /notify me/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: "me@studio.com" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("subscribes via the existing newsletter endpoint and moves to /thanks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    renderAt("/go/a11y-fix");
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: "me@studio.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));

    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe(A11Y_FIX_THANKS_PATH),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/newsletter/subscribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "me@studio.com" }),
      }),
    );
    expect(screen.getByText(/we'll email you/i)).toBeTruthy();
  });

  it("stays on the form and shows an error when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 502 }),
    );
    renderAt("/go/a11y-fix");
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: "me@studio.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    await waitFor(() => expect(screen.getByText(/went wrong/i)).toBeTruthy());
    expect(screen.getByTestId("path").textContent).toBe("/go/a11y-fix");
  });

  it("leaves the other /go links redirecting as before", () => {
    renderAt("/go/linkedin");
    expect(screen.getByText(/Opening Web2Wireframe/)).toBeTruthy();
  });
});
