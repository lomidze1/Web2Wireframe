/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/preact";
import Web from "../ui/pages/import/web/Web";

/**
 * The loader used to open AFTER the API round-trip — i.e. after 44 of
 * stripe.com's 51.5 seconds had already passed, with nothing but a 12px
 * spinner to show for them. It now covers the whole import, which makes two
 * things load-bearing: it must appear on click, and it must be escapable.
 */

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

vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => ({ refresh: vi.fn() }),
}));

vi.mock("../ui/shared/licenseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return { ...actual, authHeader: () => "Bearer test-token" };
});

vi.mock("../ui/components/settingsPanel", () => ({ default: () => null }));

const loaderProps: { current: any } = { current: null };
vi.mock("../ui/components/renderingLoader/RenderingLoader", () => ({
  default: (props: any) => {
    loaderProps.current = props;
    return null;
  },
}));

const TARGET_URL = "https://stripe.com/";

function successResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      wireframeData: {
        frames: [
          {
            viewportWidth: 1440,
            tree: { type: "FRAME", children: [{ type: "TEXT", value: "Payments" }] },
          },
        ],
      },
      fonts: [],
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

function runImport(container: Element) {
  const input = container.querySelector("#w2w-url-input") as HTMLInputElement;
  fireEvent.input(input, { target: { value: TARGET_URL } });
  const importBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Import"
  ) as HTMLButtonElement;
  fireEvent.click(importBtn);
}

beforeEach(() => {
  loaderProps.current = null;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Web tab — loader lifecycle", () => {
  it("opens the loader on click, while the request is still in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => {
      expect(loaderProps.current?.isVisible).toBe(true);
    });
    expect(loaderProps.current.progress.phase).toBe("capture");
    expect(loaderProps.current.progress.startedAt).toBeGreaterThan(0);
  });

  it("passes the fetch an abort signal and closes on cancel", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Web />);

    runImport(container);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

    expect(typeof loaderProps.current.onCancel).toBe("function");
    await act(async () => {
      loaderProps.current.onCancel();
    });

    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await waitFor(() => expect(loaderProps.current.isVisible).toBe(false));
    expect(container.textContent).toMatch(/cancel/i);
  });

  it("closes the loader on failure so the inline error panel is readable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("boom")));
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => {
      expect(container.textContent).toMatch(/boom/i);
    });
    expect(loaderProps.current.isVisible).toBe(false);
  });

  it("records how long the capture took, for the next import's estimate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => {
      const saved = postSpy.mock.calls.find(
        (c: any) => c[0]?.pluginMessage?.type === "save-timing"
      );
      expect(saved).toBeTruthy();
      expect(
        (saved as any)[0].pluginMessage.data.captureMs
      ).toBeGreaterThanOrEqual(0);
    });
  });

  it("asks the sandbox for previous timings and estimates from them", async () => {
    const postSpy = vi.spyOn(parent, "postMessage");
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<Web />);

    expect(
      postSpy.mock.calls.some((c: any) => c[0]?.pluginMessage?.type === "load-timing")
    ).toBe(true);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            pluginMessage: {
              type: "timing-loaded",
              // Per-kind history: the Web tab reads the "url" bucket.
              data: { url: [30_000, 40_000, 50_000], file: [1_000] },
            },
          },
        })
      );
    });

    runImport(container);
    await waitFor(() => expect(loaderProps.current?.isVisible).toBe(true));
    expect(loaderProps.current.progress.estimateMs).toBe(40_000);
  });
});

/**
 * `fontFaceStyles` is what stops the font modal re-opening on a page whose
 * every file is already installed (goodwill.ge: 90 layers reported as "still
 * showing Inter"). `buildFontFaceStyles` and its consumer `allFaceFilesInstalled`
 * are both unit-tested — but nothing proved the value travels between them.
 * Drop the key from this payload and every other test still passes while the
 * false alarm returns in full.
 */
describe("Web tab — font metadata reaches the sandbox", () => {
  const FONTS = [
    {
      family: "HelveticaNeue",
      weight: "400",
      realFamily: "Helvetica Neue LT GEO",
      realSubfamily: "55 Roman",
    },
    {
      family: "HelveticaNeue",
      weight: "500",
      realFamily: "Helvetica Neue LT GEO",
      realSubfamily: "75 Bold",
    },
  ];

  function responseWithFonts() {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        wireframeData: {
          frames: [
            {
              viewportWidth: 1440,
              tree: { type: "FRAME", children: [{ type: "TEXT", value: "გუდვილი" }] },
            },
          ],
        },
        fonts: FONTS,
      }),
    } as unknown as Response;
  }

  async function renderPayload(container: Element, postSpy: any) {
    runImport(container);
    return await waitFor(() => {
      const call = postSpy.mock.calls.find(
        (c: any) => c[0]?.pluginMessage?.type === "render-wireframe"
      );
      expect(call).toBeTruthy();
      return (call as any)[0].pluginMessage.data;
    });
  }

  it("sends every name a face answers to, mapped onto the styles it installs as", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWithFonts()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    const data = await renderPayload(container, postSpy);

    expect(data.fontFaceStyles).toBeDefined();
    // The CSS name, the real (SFNT) family, and the full name all resolve to
    // the same style list — the sandbox may look the face up under any of them.
    expect(data.fontFaceStyles["HelveticaNeue"]).toEqual(["55 Roman", "75 Bold"]);
    expect(data.fontFaceStyles["Helvetica Neue LT GEO"]).toEqual(["55 Roman", "75 Bold"]);
  });

  it("sends the real names and declared cuts alongside it", async () => {
    // The three font maps are read together by checkFontsAvailability; one
    // arriving without the others re-opens the modal just as surely.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWithFonts()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    const data = await renderPayload(container, postSpy);

    expect(data.fontRealNames["HelveticaNeue"]).toBe("Helvetica Neue LT GEO");
    expect(data.fontDeclaredCuts["HelveticaNeue"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ weight: 400 }),
        expect.objectContaining({ weight: 500 }),
      ]),
    );
  });
});

/**
 * Two failures that only appear once the response has landed.
 *
 * `finishCapture()` fires the moment `fetch` resolves — before the auth,
 * quota and `response.ok` guards, and long before the post-response work
 * (JSON parse, SFNT name decode, asset cutting) is done. That left two holes:
 *
 *   1. a 200 ms 401/403/500 was banked as a capture SAMPLE. With five samples
 *      and a median, three quick rejections pull the estimate to ~200 ms and
 *      the next real import's ring saturates at the 64% ceiling in the first
 *      second, then sits frozen for the remaining 40 — the exact stall the
 *      estimate curve exists to prevent. It persists in clientStorage, so a
 *      Free-tier user who keeps hitting the 10-import cap keeps it.
 *   2. it nulled the abort controller while the loader stayed in `capture`
 *      phase, i.e. while the Cancel button was still on screen. Clicking it
 *      aborted nothing: the overlay closed, the tab wrote "Import canceled",
 *      and then the wireframe rendered anyway.
 */
describe("Web tab — the window after the response lands", () => {
  const savedTimings = (spy: any) =>
    spy.mock.calls.filter((c: any) => c[0]?.pluginMessage?.type === "save-timing");

  function quotaResponse() {
    const body = { error: "limit_exceeded" };
    return {
      ok: false,
      status: 403,
      clone: () => ({ json: async () => body }),
      json: async () => body,
    } as unknown as Response;
  }

  function authExpiredResponse() {
    return {
      ok: false,
      status: 401,
      clone: () => ({ json: async () => ({}) }),
      json: async () => ({}),
    } as unknown as Response;
  }

  it("banks a sample for an import that actually rendered", async () => {
    // The control: the estimate has to keep learning from real captures.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => expect(savedTimings(postSpy)).toHaveLength(1));
    expect(savedTimings(postSpy)[0][0].pluginMessage.data.kind).toBe("url");
  });

  it("banks nothing for a server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("boom")));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => expect(container.textContent).toMatch(/boom/i));
    expect(savedTimings(postSpy)).toEqual([]);
  });

  it("banks nothing for a quota rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(quotaResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => expect(loaderProps.current?.isVisible).toBe(false));
    expect(savedTimings(postSpy)).toEqual([]);
  });

  it("banks nothing for an expired token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authExpiredResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => expect(loaderProps.current?.isVisible).toBe(false));
    expect(savedTimings(postSpy)).toEqual([]);
  });

  it("still cancels while the response is being processed", async () => {
    // The response has landed but its body has not been read yet — the loader
    // is still in `capture` phase, so Cancel is still offered. It must still
    // mean something.
    let releaseBody: (v: unknown) => void = () => {};
    const stalled = {
      ok: true,
      status: 200,
      json: () => new Promise((res) => { releaseBody = res; }),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(stalled);
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    runImport(container);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    // Still offering Cancel at this point — that is the premise.
    await waitFor(() => expect(loaderProps.current?.progress?.phase).toBe("capture"));

    await act(async () => {
      loaderProps.current.onCancel();
    });
    expect(signal.aborted).toBe(true);

    // Let the body resolve: the import must NOT proceed to the sandbox.
    await act(async () => {
      releaseBody({
        wireframeData: { frames: [{ viewportWidth: 1440, tree: { type: "FRAME" } }] },
        fonts: [],
      });
    });

    expect(
      postSpy.mock.calls.some(
        (c: any) => c[0]?.pluginMessage?.type === "render-wireframe"
      )
    ).toBe(false);
    expect(loaderProps.current.isVisible).toBe(false);
  });
});

/**
 * An expired token must not brick the tab.
 *
 * Every failure branch resets `importState` — except the auth one, which does
 * `hideLoader(); return;` and leaves it at `{ status: "loading" }`. The Import
 * button's own disabled rule is `importState.status === "loading"`, so after a
 * 401 the overlay closes and the user is left looking at a dead "Importing…"
 * button with nothing on screen explaining why. The quota branch immediately
 * below it gets this right; only auth was missed.
 */
describe("Web tab — expired token", () => {
  function authExpired() {
    return {
      ok: false,
      status: 401,
      clone: () => ({ json: async () => ({}) }),
      json: async () => ({}),
    } as unknown as Response;
  }

  /** The submit button, under either label ("Import" / "Importing…"). */
  const importButton = (container: Element) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      /^Import/i.test(b.textContent?.trim() ?? "")
    ) as HTMLButtonElement | undefined;

  it("re-enables the Import button after a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authExpired()));
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => expect(loaderProps.current?.isVisible).toBe(false));
    // The button may be re-labelled once the state resets — find it either way.
    await waitFor(() => {
      const btn = importButton(container);
      expect(btn && btn.disabled).toBe(false);
    });
  });

  it("closes the overlay so the reconnect UI is reachable", async () => {
    // ConnectionGate listens for the auth-expired event and swaps in the
    // Connect screen; a full-screen overlay left up would sit over it.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authExpired()));
    const { container } = render(<Web />);

    runImport(container);

    await waitFor(() => expect(loaderProps.current?.isVisible).toBe(false));
    expect(container.textContent).not.toMatch(/Importing/i);
  });
});

