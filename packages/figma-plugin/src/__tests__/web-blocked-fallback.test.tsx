/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/preact";
import Web from "../ui/pages/import/web/Web";
import { onImportTabRequest } from "../ui/shared/importTabEvents";

// Mock ConfigContext
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => ({
      config: {
        figmaUserId: "user-1",
        pluginColors: {
          accent: "#E76F51",
          surface: "#FFFFFF",
          text: "#1C2F3A",
          background: "#FAFAFA",
          secondary: "#2A9D8F",
        },
        pluginFont: "Montserrat",
      },
      setConfig: vi.fn(),
    }),
  };
});

// Mock useTabSettings
vi.mock("../ui/hooks/useTabSettings", () => ({
  useTabSettings: () => ({
    isExpanded: false,
    toggleExpanded: vi.fn(),
    localViewports: ["1440"],
    localColorMode: "plugin" as const,
    localFontMode: "plugin" as const,
    localTextMode: "lorem" as const,
    localCssVariablesMode: "direct" as const,
    localLayoutMode: "absolute" as const,
    localAssetMode: "placeholders" as const,
    localInteractionMode: "none" as const,
    toggleViewport: vi.fn(),
    setColorMode: vi.fn(),
    setFontMode: vi.fn(),
    setTextMode: vi.fn(),
    setCssVariablesMode: vi.fn(),
    setLayoutMode: vi.fn(),
    setAssetMode: vi.fn(),
    setInteractionMode: vi.fn(),
    handleReset: vi.fn(),
    handleSaveAsDefault: vi.fn(),
    hasOverrides: false,
    openSettings: vi.fn(),
    collapseSettings: vi.fn(),
  }),
}));

// Mock LicenseContext
vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => ({ refresh: vi.fn() }),
}));

// authHeader throws without a stored plugin token — stub it.
vi.mock("../ui/shared/licenseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return {
    ...actual,
    authHeader: () => "Bearer test-token",
  };
});

// SettingsPanel is exercised by its own tests — keep this suite focused.
vi.mock("../ui/components/settingsPanel", () => ({
  default: () => null,
}));

const TARGET_URL = "https://www.tesla.com/";

/** Minimal shape of what /api/import-url returns for an Akamai block page. */
function blockPageResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      wireframeData: {
        frames: [
          {
            viewportWidth: 1440,
            tree: {
              type: "FRAME",
              children: [
                { type: "TEXT", value: "Access Denied" },
                {
                  type: "TEXT",
                  value: "You don't have permission to access this page.",
                },
              ],
            },
          },
        ],
      },
    }),
  } as unknown as Response;
}

function errorResponse(message: string) {
  return {
    ok: false,
    status: 500,
    clone: () => ({ json: async () => ({ error: message }) }),
    json: async () => ({ error: message }),
  } as unknown as Response;
}

/** Types the URL and clicks Import. */
async function runImport(container: Element) {
  const input = container.querySelector("#w2w-url-input") as HTMLInputElement;
  fireEvent.input(input, { target: { value: TARGET_URL } });

  const importBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Import",
  ) as HTMLButtonElement;
  fireEvent.click(importBtn);
}

function findByText(container: Element, selector: string, text: string) {
  return Array.from(container.querySelectorAll(selector)).find((el) =>
    el.textContent?.toLowerCase().includes(text.toLowerCase()),
  ) as HTMLElement | undefined;
}

let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Web tab — bot-protection fallback", () => {
  it("offers to open the blocked site in the browser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(blockPageResponse()));
    const { container } = render(<Web />);

    await runImport(container);

    await waitFor(() => {
      expect(container.textContent).toMatch(/bot protection/i);
    });
    expect(findByText(container, "button", "Open site in your browser")).toBeTruthy();
  });

  it("opens the submitted URL — not whatever the input holds later", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(blockPageResponse()));
    const { container } = render(<Web />);

    await runImport(container);

    const btn = await waitFor(() => {
      const b = findByText(container, "button", "Open site in your browser");
      expect(b).toBeTruthy();
      return b!;
    });

    // User edits the field after the failure — the button must still open the
    // URL that was actually blocked.
    const input = container.querySelector("#w2w-url-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "https://example.com/" } });

    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith(TARGET_URL, "_blank");
  });

  it("falls back to a manual link when the popup is blocked", async () => {
    openSpy.mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(blockPageResponse()));
    const { container } = render(<Web />);

    await runImport(container);

    const btn = await waitFor(() => {
      const b = findByText(container, "button", "Open site in your browser");
      expect(b).toBeTruthy();
      return b!;
    });
    fireEvent.click(btn);

    await waitFor(() => {
      const link = container.querySelector(`a[href="${TARGET_URL}"]`);
      expect(link).not.toBeNull();
    });
  });

  it("switches to the Screenshot tab on request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(blockPageResponse()));
    const handler = vi.fn();
    const unsubscribe = onImportTabRequest(handler);
    const { container } = render(<Web />);

    await runImport(container);

    const link = await waitFor(() => {
      const l = findByText(container, "button", "Try Screenshot import");
      expect(l).toBeTruthy();
      return l!;
    });
    fireEvent.click(link);

    expect(handler).toHaveBeenCalledWith("screenshot");
    unsubscribe();
  });

  it("survives a previous import's pending reset timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(blockPageResponse()));
    const { container } = render(<Web />);

    // An earlier import finished rendering — that schedules a 10s reset which
    // clears the status message and the URL field.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          pluginMessage: {
            type: "render-progress",
            data: { step: "Done", percent: 100, isComplete: true },
          },
        },
      }),
    );

    // Burn most of the 10s window before the new import starts, so the stale
    // timer would land right on top of the fresh error message.
    vi.advanceTimersByTime(9_000);

    await runImport(container);
    await waitFor(() => {
      expect(container.textContent).toMatch(/bot protection/i);
    });

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(container.textContent).toMatch(/bot protection/i);
    const input = container.querySelector("#w2w-url-input") as HTMLInputElement;
    expect(input.value).toBe(TARGET_URL);
  });

  it("dismisses the blocked panel via the close button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(blockPageResponse()));
    const { container } = render(<Web />);

    await runImport(container);

    const close = await waitFor(() => {
      const b = container.querySelector('button[aria-label="Dismiss"]');
      expect(b).not.toBeNull();
      return b as HTMLButtonElement;
    });
    fireEvent.click(close);

    await waitFor(() => {
      expect(container.textContent).not.toMatch(/bot protection/i);
    });
  });

  it("dismisses ordinary errors via the close button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("Server exploded")));
    const { container } = render(<Web />);

    await runImport(container);

    const close = await waitFor(() => {
      const b = container.querySelector('button[aria-label="Dismiss"]');
      expect(b).not.toBeNull();
      return b as HTMLButtonElement;
    });
    fireEvent.click(close);

    await waitFor(() => {
      expect(container.textContent).not.toContain("Server exploded");
    });
  });

  it("shows no close button while loading", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise<Response>((r) => (resolveFetch = r))),
    );
    const { container } = render(<Web />);

    await runImport(container);

    await waitFor(() => {
      expect(container.textContent).toMatch(/Importing the website/i);
    });
    expect(container.querySelector('button[aria-label="Dismiss"]')).toBeNull();

    resolveFetch(blockPageResponse());
  });

  it("leaves ordinary import errors as plain text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("Server exploded")));
    const { container } = render(<Web />);

    await runImport(container);

    await waitFor(() => {
      expect(container.textContent).toContain("Server exploded");
    });
    expect(container.textContent).not.toMatch(/bot protection/i);
    expect(findByText(container, "button", "Open site in your browser")).toBeUndefined();
  });
});
