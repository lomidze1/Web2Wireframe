/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import AreaSelection from "../ui/pages/import/areaSelection/AreaSelection";

/**
 * Bug fix verification (P0 #1): AreaSelection must forward `fontDownloads` and
 * `extractedFonts` props to <FontFallbackModal>, otherwise the
 * "Download fonts (.zip)" button never appears in this import path.
 *
 * Sister components Web.tsx (line 380-381) and HTML.tsx (line 403-404) already
 * pass these props; AreaSelection.tsx:708 was missing them entirely.
 */

// ============================================================================
// Mocks
// ============================================================================

// Mock ConfigContext
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => ({
      config: {
        pluginColors: {
          primary: "#F4A261",
          secondary: "#2A9D8F",
          accent: "#E76F51",
          surface: "#FFFFFF",
          text: "#1C2F3A",
          border: "#E0E0E0",
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
    localTextMode: "semantic" as const,
    localCssVariablesMode: "direct" as const,
    localLayoutMode: "autoLayout" as const,
    localAssetMode: "real" as const,
    localInteractionMode: "default" as const,
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

// Capture FontFallbackModal props for assertions
const mockFontModalProps: { current: Record<string, unknown> | null } = {
  current: null,
};
vi.mock("../ui/components/modalPopup/FontFallbackModal", () => ({
  default: (props: Record<string, unknown>) => {
    mockFontModalProps.current = props;
    return null;
  },
}));

// Provide a valid auth header — the .w2w import now POSTs to the quota-count
// endpoint, and authHeader() throws without a stored token.
vi.mock("../ui/shared/licenseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return { ...actual, authHeader: () => "Bearer test-token" };
});

// Stub heavy renderers so the test stays focused on prop wiring
vi.mock("../ui/components/renderingLoader/RenderingLoader", () => ({
  default: () => null,
}));

vi.mock("../ui/shared/transformData", () => ({
  transformFramesData: vi.fn(() => []),
  transformW2WTreeText: vi.fn(),
}));

vi.mock("../ui/shared/absoluteModeRenderer", () => ({
  prepareFramesForRendering: vi.fn(() => []),
}));

// Decode the uploaded `.w2w` deterministically — this test covers font prop
// wiring AFTER decode, not the codec itself (the codec has its own round-trip
// tests in @w2w/shared). detectFormat → "w2w" and decodeW2W → the payload that
// buildCaptureFile last stashed.
let lastPayload: unknown = null;
vi.mock("@w2w/shared/w2w-codec", () => ({
  detectFormat: () => "w2w" as const,
  decodeW2W: async () => lastPayload,
}));

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a minimal `.w2w` capture file. The bytes are inert (decoding is mocked
 * above); we stash the intended payload so the mocked `decodeW2W` returns it.
 * Includes fonts so we can assert they're surfaced.
 */
function buildCaptureFile(fonts: unknown[]): File {
  lastPayload = {
    url: "https://example.com",
    title: "example",
    timestamp: Date.now(),
    frames: [
      {
        viewport: { width: 1440, height: 900 },
        tree: { tag: "BODY", children: [] },
      },
    ],
    fonts,
    assets: [],
    stylesheets: [],
  };
  // Valid W2W2 magic so the (real) length checks in upload handling pass.
  const bytes = new Uint8Array([0x57, 0x32, 0x57, 0x32, 0x02, 0x00]);
  return new File([bytes], "capture.w2w", { type: "application/octet-stream" });
}

/** Open the font fallback modal by dispatching a `fonts-not-available` message */
function triggerMissingFonts(missing: string[] = ["CustomFont"]) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        pluginMessage: {
          type: "fonts-not-available",
          data: {
            missingFonts: missing,
            defaultMapping: { CustomFont: "Arial" },
            pluginFont: "Montserrat",
            pluginFontOptions: ["Montserrat", "Roboto"],
          },
        },
      },
    })
  );
}

/** Find the hidden file input rendered inside AreaSelection */
function findFileInput(container: Element): HTMLInputElement {
  const input = container.querySelector(
    "input[type='file']"
  ) as HTMLInputElement | null;
  if (!input) throw new Error("file input not found");
  return input;
}

/** Find the Import button by text content */
function findImportButton(container: Element): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  for (const btn of buttons) {
    if (btn.textContent?.includes("Import")) {
      return btn as HTMLButtonElement;
    }
  }
  throw new Error("Import button not found");
}

// ============================================================================
// Tests
// ============================================================================

describe("AreaSelection — Font download prop wiring (P0 #1)", () => {
  beforeEach(() => {
    mockFontModalProps.current = null;
    vi.clearAllMocks();
    // The .w2w import now counts against quota via POST /api/import-w2w-file
    // before rendering. Stub a successful (within-quota) response so the flow
    // proceeds to processAndRender.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ success: true, importRemaining: 5 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      )
    );
  });

  it("forwards extractedFonts to FontFallbackModal after a .w2w capture is processed", async () => {
    const fonts = [
      {
        family: "CustomFont",
        style: "normal",
        weight: "400",
        format: "woff2",
        src: 'url("https://example.com/CustomFont.woff2") format("woff2")',
      },
    ];

    const { container } = render(<AreaSelection />);

    // Simulate file selection
    const input = findFileInput(container);
    Object.defineProperty(input, "files", {
      value: [buildCaptureFile(fonts)],
      configurable: true,
    });
    fireEvent.change(input);

    // Trigger handleGenerate
    fireEvent.click(findImportButton(container));

    // Wait for the file to be parsed and processAndRender to run
    await waitFor(() => {
      // After processing, ConfigContext + processAndRender complete; we don't
      // need to assert intermediate state, only that the eventual modal opens
      // with the right data.
    });

    // Now simulate the sandbox saying fonts are missing
    triggerMissingFonts(["CustomFont"]);

    await waitFor(() => {
      expect(mockFontModalProps.current?.isOpen).toBe(true);
    });

    // The bug: fontDownloads / extractedFonts were undefined here.
    expect(mockFontModalProps.current?.extractedFonts).toBeDefined();
    expect(
      Array.isArray(mockFontModalProps.current?.extractedFonts)
        ? (mockFontModalProps.current?.extractedFonts as unknown[]).length
        : 0
    ).toBe(1);

    // fontDownloads should be a non-empty array since the missing font has a URL
    expect(mockFontModalProps.current?.fontDownloads).toBeDefined();
    const fd = mockFontModalProps.current?.fontDownloads as
      | Array<{ family: string; urls: string[] }>
      | undefined;
    expect(fd?.length).toBe(1);
    expect(fd?.[0].family).toBe("CustomFont");
    expect(fd?.[0].urls).toContain("https://example.com/CustomFont.woff2");
  });

  it("passes empty extractedFonts when capture has no fonts", async () => {
    const { container } = render(<AreaSelection />);

    const input = findFileInput(container);
    Object.defineProperty(input, "files", {
      value: [buildCaptureFile([])],
      configurable: true,
    });
    fireEvent.change(input);
    fireEvent.click(findImportButton(container));

    await waitFor(() => {
      // wait for parse
    });

    triggerMissingFonts(["UnknownFont"]);

    await waitFor(() => {
      expect(mockFontModalProps.current?.isOpen).toBe(true);
    });

    expect(mockFontModalProps.current?.extractedFonts).toEqual([]);
    // buildFontDownloads returns undefined for empty input
    expect(mockFontModalProps.current?.fontDownloads).toBeUndefined();
  });
});
