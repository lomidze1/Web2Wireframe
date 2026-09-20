/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/preact";
import LicenseReadyGate, { LICENSE_WAIT_MS } from "../ui/components/LicenseReadyGate";

/**
 * Opening the plugin used to render the Web tab before the license arrived:
 * the first-run steps showed for a split second, then vanished once the license
 * said the user had already imported. The gate keeps the loading screen up
 * until the license is known — or a short timeout, so a slow API never locks
 * the plugin.
 */

const licenseState: { current: any } = { current: null };
vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => licenseState.current,
}));

const LICENSE = { plan: "free", usage: { imports: 3 }, limits: { imports: 10 } };

function ui() {
  return (
    <LicenseReadyGate fallback={<div>Loading…</div>}>
      <div>App content</div>
    </LicenseReadyGate>
  );
}

beforeEach(() => {
  licenseState.current = { license: null, isLoading: true, error: null, refresh: vi.fn() };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LicenseReadyGate", () => {
  it("keeps the loading screen up while the license is still loading", () => {
    const { container } = render(ui());
    expect(container.textContent).toBe("Loading…");
  });

  it("opens the app as soon as the license arrives", () => {
    const { container, rerender } = render(ui());
    licenseState.current = { license: LICENSE, isLoading: false, error: null, refresh: vi.fn() };
    rerender(ui());
    expect(container.textContent).toBe("App content");
  });

  it("opens the app when the license request failed", () => {
    licenseState.current = { license: null, isLoading: false, error: "offline", refresh: vi.fn() };
    const { container } = render(ui());
    expect(container.textContent).toBe("App content");
  });

  it("opens the app anyway after the wait limit", () => {
    vi.useFakeTimers();
    const { container } = render(ui());
    expect(container.textContent).toBe("Loading…");

    act(() => {
      vi.advanceTimersByTime(LICENSE_WAIT_MS);
    });

    expect(container.textContent).toBe("App content");
  });

  it("never goes back to the loading screen once open", () => {
    // A retry clears `error` while the license is still null — that must not
    // unmount the whole app.
    licenseState.current = { license: null, isLoading: false, error: "offline", refresh: vi.fn() };
    const { container, rerender } = render(ui());
    licenseState.current = { license: null, isLoading: true, error: null, refresh: vi.fn() };
    rerender(ui());
    expect(container.textContent).toBe("App content");
  });

  it("waits no longer than three seconds", () => {
    expect(LICENSE_WAIT_MS).toBeLessThanOrEqual(3000);
  });
});
