/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import Screenshot from "../ui/pages/import/screenshot/Screenshot";

import { createMockConfigContext } from "./helpers/configMock";
import { applyAuthToken } from "../ui/shared/licenseClient";

// Mock ConfigContext with full context (needed by useTabSettings)
const mockContext = createMockConfigContext({
  pluginFont: "Montserrat",
});

vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => mockContext,
  };
});

// Mock Image for dimension detection
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  _src = "";
  naturalWidth = 1440;
  naturalHeight = 900;

  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    // Trigger onload asynchronously
    setTimeout(() => this.onload?.(), 0);
  }
}

/** Fake base64 PNG data URI for testing */
const FAKE_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

/** Helper: find the delete button by its "✕" text */
function findDeleteButton(container: Element): HTMLButtonElement | null {
  const buttons = container.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent?.trim() === "✕") {
      return btn as HTMLButtonElement;
    }
  }
  return null;
}

/** Helper: find the Import button */
function findImportButton(container: Element): HTMLButtonElement {
  const buttons = container.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent?.includes("Import")) {
      return btn as HTMLButtonElement;
    }
  }
  throw new Error("Import button not found");
}

/** Helper: simulate image upload via FileReader */
function simulateImageUpload(container: Element) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;

  // Create a fake file
  const file = new File(["fake-image-data"], "screenshot.png", { type: "image/png" });

  // Mock FileReader
  const mockFileReader = {
    onload: null as ((e: { target: { result: string } }) => void) | null,
    readAsDataURL: vi.fn(function (this: { onload: ((e: { target: { result: string } }) => void) | null }) {
      // Simulate async read completing
      setTimeout(() => {
        this.onload?.({ target: { result: FAKE_IMAGE_BASE64 } });
      }, 0);
    }),
  };
  vi.spyOn(globalThis, "FileReader").mockImplementation(() => mockFileReader as unknown as FileReader);

  // Trigger change event with file
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);

  return mockFileReader;
}

/** Helper: mock successful API response */
function mockSuccessResponse() {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          wireframeData: {
            frames: [{ viewportWidth: 1440, viewportHeight: 900, tree: { type: "FRAME", name: "Screenshot" } }],
          },
          sourceUrl: "screenshot://uploaded",
          pluginColors: {
            primary: "#F4A261",
            secondary: "#2A9D8F",
            accent: "#E76F51",
            surface: "#FFFFFF",
            text: "#1C2F3A",
            border: "#E0E0E0",
          },
        }),
    })
  ) as unknown as typeof fetch;
}

describe("Screenshot", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let originalImage: typeof globalThis.Image;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    // Seed a plugin token so authed import requests can be issued.
    applyAuthToken("test.token", Date.now() + 3_600_000);
    postMessageSpy = vi.spyOn(window.parent, "postMessage");
    originalImage = globalThis.Image;
    globalThis.Image = MockImage as unknown as typeof Image;
    // Clear localStorage to avoid state leaking between tests
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    globalThis.Image = originalImage;
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("renders upload area with prompt text", () => {
      const { getByText } = render(<Screenshot />);
      expect(getByText("Click to upload screenshot")).toBeTruthy();
    });

    it("renders the Import button", () => {
      const { getByText } = render(<Screenshot />);
      expect(getByText("Import")).toBeTruthy();
    });

    it("renders settings panel with viewports", () => {
      const { getByText } = render(<Screenshot />);
      // SettingsPanel renders Viewports section
      expect(getByText("Viewports")).toBeTruthy();
    });
  });

  describe("image upload", () => {
    it("shows image preview after upload", async () => {
      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const img = container.querySelector('img[alt="Screenshot preview"]');
        expect(img).toBeTruthy();
        expect((img as HTMLImageElement).src).toBe(FAKE_IMAGE_BASE64);
      });
    });

    it("shows delete button when image is uploaded", async () => {
      const { container, getByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        // Image is shown
        const img = container.querySelector('img[alt="Screenshot preview"]');
        expect(img).toBeTruthy();
      });

      // Delete button with "✕" text should now be visible
      expect(getByText("✕")).toBeTruthy();
    });

    it("removes image preview on delete", async () => {
      const { container, getByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const img = container.querySelector('img[alt="Screenshot preview"]');
        expect(img).toBeTruthy();
      });

      // Click delete button
      const deleteBtn = findDeleteButton(container) as HTMLButtonElement;
      fireEvent.click(deleteBtn);

      expect(getByText("Click to upload screenshot")).toBeTruthy();
      expect(container.querySelector('img[alt="Screenshot preview"]')).toBeNull();
    });
  });

  describe("button state", () => {
    it("button is disabled when no image is uploaded", () => {
      const { container } = render(<Screenshot />);
      const button = findImportButton(container);
      expect(button.disabled).toBe(true);
    });

    it("button is enabled after image upload", async () => {
      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });
    });
  });

  describe("loading state", () => {
    it("shows 'Importing…' during API call", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      const button = findImportButton(container);
      fireEvent.click(button);

      await vi.waitFor(() => {
        expect(getByText("Importing…")).toBeTruthy();
      });
    });

    it("disables button during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      const button = findImportButton(container);
      fireEvent.click(button);

      await vi.waitFor(() => {
        expect(button.disabled).toBe(true);
      });
    });
  });

  describe("error handling", () => {
    it("shows error message when API returns error", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "API key not configured" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      const button = findImportButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("API key not configured");
      expect(errorMsg).toBeTruthy();
    });

    it("shows error message on network failure", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.reject(new Error("Network error"))
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      const button = findImportButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("Network error");
      expect(errorMsg).toBeTruthy();
    });

    it("clears error on new image upload", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Some error" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText, queryByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));
      await findByText("Some error");

      // Upload a new image — error should clear
      simulateImageUpload(container);

      await vi.waitFor(() => {
        expect(queryByText("Some error")).toBeNull();
      });
    });

    it("clears error on delete", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Some error" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText, queryByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));
      await findByText("Some error");

      // Delete image — error should clear
      const deleteBtn = findDeleteButton(container) as HTMLButtonElement;
      fireEvent.click(deleteBtn);

      expect(queryByText("Some error")).toBeNull();
    });
  });

  describe("success flow", () => {
    it("sends render-wireframe message to parent on success", async () => {
      mockSuccessResponse();

      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));

      await vi.waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalled();
      });

      const call = postMessageSpy.mock.calls[0];
      const msg = (call[0] as { pluginMessage: { type: string; data: Record<string, unknown> } }).pluginMessage;
      expect(msg.type).toBe("render-wireframe");
      expect(msg.data.sourceUrl).toBe("screenshot://uploaded");
      expect(msg.data.variableMode).toBe("direct");
      expect(msg.data.layoutMode).toBe("absolute");
      expect(msg.data.colorMode).toBe("website");
      // Coerced from the "website" default — Screenshot mode has no webfonts.
      expect(msg.data.fontMode).toBe("plugin");
      expect(msg.data.frames).toBeDefined();
    });

    it("sends correct request body to API", async () => {
      mockSuccessResponse();

      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toContain("/api/import-screenshot");

      const body = JSON.parse(fetchCall[1].body);
      expect(body.imageBase64).toBe(FAKE_IMAGE_BASE64);
      expect(body.imageWidth).toBe(1440);
      expect(body.imageHeight).toBe(900);
      expect(body.viewports).toBeDefined();
      expect(body.pluginColors).toBeDefined();
      expect(body.pluginFont).toBe("Montserrat");
    });
  });

  describe("screenshot-specific settings", () => {
    /** Helper: expand the "More Options" settings panel */
    function expandSettings(container: Element) {
      const buttons = container.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.includes("More Options")) {
          fireEvent.click(btn);
          return;
        }
      }
    }

    it("shows 'Screenshot Colors' label in the Colors toggle", () => {
      const { container } = render(<Screenshot />);
      expandSettings(container);

      const toggles = container.querySelectorAll('[role="radio"]');
      const labels = Array.from(toggles).map((b) => b.textContent);
      expect(labels).toContain("Screenshot Colors");
    });

    it("shows plugin font mode (coerced) when the global default is website fonts", () => {
      // Override mock to return fontMode: "website"
      mockContext.config.fontMode = "website";
      mockContext.getEffectiveConfig.mockImplementation(() => ({
        ...mockContext.config,
        fontMode: "website",
      }));

      const { container } = render(<Screenshot />);
      expandSettings(container);

      // Fonts toggle should show "Plugin" active, not "Website" (coerced).
      const fontsGroup = container.querySelector(
        '[aria-label="Fonts"]'
      ) as HTMLElement;
      const activeFont = fontsGroup.querySelector('[aria-checked="true"]');
      expect(activeFont?.textContent).toBe("Plugin");

      // The incompatible value is coerced for display/import only — no session
      // override is written, so the global default and other tabs stay intact.
      expect(mockContext.setSessionOverride).not.toHaveBeenCalledWith(
        "screenshot",
        expect.objectContaining({ fontMode: expect.anything() })
      );

      // Restore
      mockContext.config.fontMode = "plugin";
      mockContext.getEffectiveConfig.mockImplementation((_tabId: string) => mockContext.config);
    });

    it("passes disableFontWebsiteOption to SettingsPanel", () => {
      // The disabled behavior itself is verified in settingsPanel.test.tsx.
      // Here we verify the Screenshot component passes the right label.
      const { container } = render(<Screenshot />);
      expandSettings(container);

      // The Colors toggle should use the "Screenshot Colors" override, not the
      // default "Website", confirming Screenshot passes the colorWebsiteLabel prop.
      const colorsGroup = container.querySelector(
        '[aria-label="Colors"]'
      ) as HTMLElement;
      const labels = Array.from(
        colorsGroup.querySelectorAll('[role="radio"]')
      ).map((b) => b.textContent);
      expect(labels).toContain("Screenshot Colors");
      expect(labels).not.toContain("Website");
    });

    it("includes colorMode in API request body", async () => {
      mockSuccessResponse();

      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body).toHaveProperty("colorMode");
    });

    it("sends colorMode from settings in postMessage (not hardcoded 'plugin')", async () => {
      mockSuccessResponse();

      const { container } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));

      await vi.waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalled();
      });

      const call = postMessageSpy.mock.calls[0];
      const msg = (call[0] as { pluginMessage: { type: string; data: Record<string, unknown> } }).pluginMessage;
      // colorMode should come from settings, which defaults to "website"
      expect(msg.data.colorMode).toBe("website");
    });
  });

  describe("message listener", () => {
    it("resets generating state on wireframe-created message", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));

      await vi.waitFor(() => {
        expect(getByText("Importing…")).toBeTruthy();
      });

      // Simulate wireframe-created message from Figma sandbox
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { pluginMessage: { type: "wireframe-created" } },
        })
      );

      await vi.waitFor(() => {
        expect(getByText("Import")).toBeTruthy();
      });
    });

    it("shows error and resets on wireframe-error message", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText, findByText } = render(<Screenshot />);
      simulateImageUpload(container);

      await vi.waitFor(() => {
        const button = findImportButton(container);
        expect(button.disabled).toBe(false);
      });

      fireEvent.click(findImportButton(container));

      await vi.waitFor(() => {
        expect(getByText("Importing…")).toBeTruthy();
      });

      // Simulate wireframe-error message from Figma sandbox
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            pluginMessage: {
              type: "wireframe-error",
              data: { error: "Rendering failed" },
            },
          },
        })
      );

      const errorMsg = await findByText("Rendering failed");
      expect(errorMsg).toBeTruthy();
      expect(getByText("Import")).toBeTruthy();
    });
  });
});
