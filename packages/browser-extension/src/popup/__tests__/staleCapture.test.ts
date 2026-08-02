/**
 * Unit tests for `isStaleCapture` — the decay policy for the persisted
 * capture lifecycle.
 *
 * A finished capture screen ("Page captured successfully" / an error) is shown
 * exactly once: the popup that displays it stamps `seen`, so any later open
 * retires it and starts on the capture form instead of the old result.
 * An in-flight capture is never stale — the debugger infobar force-closes the
 * popup mid-run and that progress has to come back.
 */

import { describe, it, expect } from "vitest";
import type { PersistedCaptureState } from "@/shared/types";
import { isStaleCapture } from "../App";

describe("isStaleCapture", () => {
  it("retires a success screen the popup has already shown", () => {
    const persisted: PersistedCaptureState = {
      status: "success",
      progress: 100,
      message: "Capture complete!",
      seen: true,
    };
    expect(isStaleCapture(persisted)).toBe(true);
  });

  it("retires an error screen the popup has already shown", () => {
    const persisted: PersistedCaptureState = {
      status: "error",
      progress: 0,
      message: "",
      error: "Capture failed",
      seen: true,
    };
    expect(isStaleCapture(persisted)).toBe(true);
  });

  it("keeps a result nobody has seen yet — capture finished while closed", () => {
    const persisted: PersistedCaptureState = {
      status: "success",
      progress: 100,
      message: "Capture complete!",
    };
    expect(isStaleCapture(persisted)).toBe(false);
  });

  it("never retires an in-flight capture, seen or not", () => {
    const persisted: PersistedCaptureState = {
      status: "capturing",
      progress: 40,
      message: "Extracting DOM...",
      seen: true,
    };
    expect(isStaleCapture(persisted)).toBe(false);
  });

  it("is false when nothing is persisted", () => {
    expect(isStaleCapture(undefined)).toBe(false);
  });
});
