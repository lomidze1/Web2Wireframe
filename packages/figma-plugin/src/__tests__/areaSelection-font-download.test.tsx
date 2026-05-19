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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a minimal MultiFrameCaptureResult JSON file (the format `toUnifiedFormat`
 * recognizes). Includes fonts so we can assert they're surfaced.
 */
function buildJsonFile(fonts: unknown[]): File {
  const payload = {
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
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  return new File([blob], "capture.json", { type: "application/json" });
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
  });

  it("forwards extractedFonts to FontFallbackModal after a JSON capture is processed", async () => {
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
      value: [buildJsonFile(fonts)],
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
      value: [buildJsonFile([])],
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
