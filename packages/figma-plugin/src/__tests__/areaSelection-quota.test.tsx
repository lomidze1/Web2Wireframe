/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import AreaSelection from "../ui/pages/import/areaSelection/AreaSelection";

/**
 * Quota enforcement for the `.w2w` import path. Extension captures are counted
 * at import time via POST /api/import-w2w-file. When the Free quota is
 * exhausted the endpoint returns 403 limit_exceeded — the import must be
 * BLOCKED (no render) and the global quota-exceeded event dispatched so the
 * upgrade modal appears.
 */

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

vi.mock("../ui/components/modalPopup/FontFallbackModal", () => ({
  default: () => null,
}));

vi.mock("../ui/components/renderingLoader/RenderingLoader", () => ({
  default: () => null,
}));

vi.mock("../ui/shared/licenseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return { ...actual, authHeader: () => "Bearer test-token" };
});

vi.mock("../ui/shared/transformData", () => ({
  transformFramesData: vi.fn(() => []),
  transformW2WTreeText: vi.fn(),
}));

vi.mock("../ui/shared/absoluteModeRenderer", () => ({
  prepareFramesForRendering: vi.fn(() => []),
}));

// Decode is mocked — a valid capture so the flow reaches the quota gate.
vi.mock("@w2w/shared/w2w-codec", () => ({
  detectFormat: () => "w2w" as const,
  decodeW2W: async () => ({
    url: "https://example.com",
    title: "example",
    timestamp: Date.now(),
    frames: [{ viewport: { width: 1440, height: 900 }, tree: { tag: "BODY", children: [] } }],
    fonts: [],
    assets: [],
    stylesheets: [],
  }),
}));

function buildCaptureFile(): File {
  const bytes = new Uint8Array([0x57, 0x32, 0x57, 0x32, 0x02, 0x00]); // W2W2 magic
  return new File([bytes], "capture.w2w", { type: "application/octet-stream" });
}

function findFileInput(container: Element): HTMLInputElement {
  const input = container.querySelector("input[type='file']") as HTMLInputElement | null;
  if (!input) throw new Error("file input not found");
  return input;
}

function findImportButton(container: Element): HTMLButtonElement {
  for (const btn of Array.from(container.querySelectorAll("button"))) {
    if (btn.textContent?.includes("Import")) return btn as HTMLButtonElement;
  }
  throw new Error("Import button not found");
}

describe("AreaSelection — quota enforcement on .w2w import", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    postMessageSpy = vi.spyOn(window.parent, "postMessage");
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
  });

  it("blocks render and dispatches quota-exceeded when the endpoint returns 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "limit_exceeded", upgradeUrl: "/api/checkout/create" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
      )
    );

    let quotaEventFired = false;
    const onQuota = () => {
      quotaEventFired = true;
    };
    window.addEventListener("w2w:quota-exceeded", onQuota);

    try {
      const { container } = render(<AreaSelection />);
      const input = findFileInput(container);
      Object.defineProperty(input, "files", {
        value: [buildCaptureFile()],
        configurable: true,
      });
      fireEvent.change(input);
      fireEvent.click(findImportButton(container));

      await waitFor(() => {
        expect(quotaEventFired).toBe(true);
      });

      // The import must NOT render — no render-wireframe message posted.
      const renderCall = postMessageSpy.mock.calls.find(
        ([msg]) =>
          (msg as { pluginMessage?: { type?: string } })?.pluginMessage?.type ===
          "render-wireframe"
      );
      expect(renderCall).toBeUndefined();
    } finally {
      window.removeEventListener("w2w:quota-exceeded", onQuota);
    }
  });

  it("renders when the endpoint allows the import (200)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ success: true, importRemaining: 3 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      )
    );

    const { container } = render(<AreaSelection />);
    const input = findFileInput(container);
    Object.defineProperty(input, "files", {
      value: [buildCaptureFile()],
      configurable: true,
    });
    fireEvent.change(input);
    fireEvent.click(findImportButton(container));

    await waitFor(() => {
      const renderCall = postMessageSpy.mock.calls.find(
        ([msg]) =>
          (msg as { pluginMessage?: { type?: string } })?.pluginMessage?.type ===
          "render-wireframe"
      );
      expect(renderCall).toBeDefined();
    });
  });
});
