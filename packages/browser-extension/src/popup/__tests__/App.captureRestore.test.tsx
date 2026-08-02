/**
 * Behavioural tests for the popup's capture-lifecycle restore.
 *
 * These render the real <App /> against a stubbed `chrome`, because the bug
 * being fixed lived in the wiring — the "Page captured successfully" screen
 * came back on every reopen — not in any single predicate. Follows the
 * rendering conventions of components/__tests__/ReportIssue.test.tsx: preact's
 * own `render`, plus `tick()` to flush the microtask-scheduled re-render.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "preact";
import type { PersistedCaptureState } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/constants";
import { App } from "../App";

let container: HTMLDivElement;
let sessionStore: Map<string, unknown>;
let sessionRemove: ReturnType<typeof vi.fn>;
let sessionSet: ReturnType<typeof vi.fn>;

/**
 * Flush the whole mount cascade: preact defers `useEffect` to a paint, the
 * mount effect then awaits chrome.storage, and the resulting state change
 * schedules another render + effect pass. Several turns of the timer queue
 * cover all of it.
 */
async function tick(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Minimal stand-in for every chrome API <App /> touches while mounting. */
function installChrome(): void {
  const listeners = {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  sessionRemove = vi.fn(async (key: string) => {
    sessionStore.delete(key);
  });
  sessionSet = vi.fn(async (items: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(items)) sessionStore.set(k, v);
  });

  vi.stubGlobal("chrome", {
    tabs: {
      query: vi.fn((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) =>
        cb([{ id: 1, url: "https://example.com" } as chrome.tabs.Tab]),
      ),
      onActivated: listeners,
    },
    windows: { onBoundsChanged: listeners },
    scripting: {
      executeScript: vi.fn(async () => [{ result: 1440 }]),
    },
    runtime: { onMessage: listeners, sendMessage: vi.fn() },
    storage: {
      onChanged: listeners,
      local: { get: vi.fn(async () => ({})) },
      session: {
        get: vi.fn(async (key: string) => {
          const value = sessionStore.get(key);
          return value === undefined ? {} : { [key]: value };
        }),
        set: sessionSet,
        remove: sessionRemove,
      },
    },
  });
}

function persist(state: PersistedCaptureState): void {
  sessionStore.set(STORAGE_KEYS.LAST_CAPTURE, state);
}

function stored(): PersistedCaptureState | undefined {
  return sessionStore.get(STORAGE_KEYS.LAST_CAPTURE) as
    | PersistedCaptureState
    | undefined;
}

async function mount(): Promise<void> {
  render(<App />, container);
  await tick();
}

const SUCCESS: PersistedCaptureState = {
  status: "success",
  progress: 100,
  message: "Capture complete!",
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  sessionStore = new Map();
  installChrome();
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("capture lifecycle restore", () => {
  it("shows an unseen result once and stamps it as seen", async () => {
    persist(SUCCESS);

    await mount();

    expect(container.textContent).toContain("Page captured successfully");
    expect(stored()?.seen).toBe(true);
  });

  it("starts on the capture form when reopened after showing the result", async () => {
    persist(SUCCESS);

    // First open — the user reads the result, then closes the popup.
    await mount();
    render(null, container);

    // Second open: same storage, fresh popup.
    await mount();

    expect(container.textContent).not.toContain("Page captured successfully");
    expect(container.textContent).toContain("Capture");
    expect(sessionRemove).toHaveBeenCalledWith(STORAGE_KEYS.LAST_CAPTURE);
    expect(stored()).toBeUndefined();
  });

  it("restores an in-flight capture — the infobar closed the popup mid-run", async () => {
    persist({
      status: "capturing",
      progress: 40,
      message: "Extracting DOM...",
      seen: true, // even a stamped one: progress must always come back
    });

    await mount();

    expect(container.textContent).toContain("Extracting DOM...");
    expect(sessionRemove).not.toHaveBeenCalled();
  });

  it("leaves the persisted state alone when there is nothing to restore", async () => {
    await mount();

    expect(container.textContent).not.toContain("Page captured successfully");
    expect(sessionRemove).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
