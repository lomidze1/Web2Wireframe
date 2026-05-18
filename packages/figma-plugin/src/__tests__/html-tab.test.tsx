import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import HTML from "../ui/pages/import/html/HTML";
import { transformFramesData } from "../ui/shared/transformData";
import { prepareFramesForRendering } from "../ui/shared/absoluteModeRenderer";
import { validateHtml } from "../utils/validateHtml";
import { applyAuthToken } from "../ui/shared/licenseClient";

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
    toggleViewport: vi.fn(),
    setColorMode: vi.fn(),
    setFontMode: vi.fn(),
    setTextMode: vi.fn(),
    setCssVariablesMode: vi.fn(),
    setLayoutMode: vi.fn(),
    handleReset: vi.fn(),
    handleSaveAsDefault: vi.fn(),
    hasOverrides: false,
    openSettings: vi.fn(),
    collapseSettings: mockCollapseSettings,
  }),
}));

// Capturable mock for collapseSettings
const mockCollapseSettings = vi.fn();

// Prop-capturing refs for component mocks
const mockFontModalProps: { current: any } = { current: null };
const mockRenderingLoaderProps: { current: any } = { current: null };

// Mock FontFallbackModal — capture props
vi.mock("../ui/components/modalPopup/FontFallbackModal", () => ({
  default: (props: any) => {
    mockFontModalProps.current = props;
    return null;
  },
}));

// Mock RenderingLoader — capture props
vi.mock("../ui/components/renderingLoader/RenderingLoader", () => ({
  default: (props: any) => {
    mockRenderingLoaderProps.current = props;
    return null;
  },
}));

// Mock validateHtml — default: valid HTML (no modal)
vi.mock("../utils/validateHtml", () => ({
  validateHtml: vi.fn(() => ({ isValid: true, errorCount: 0, errors: [] })),
}));

// Mock HtmlWarningModal — capture props
const mockHtmlWarningModalProps: { current: any } = { current: null };
vi.mock("../ui/components/modalPopup/HtmlWarningModal", () => ({
  default: (props: any) => {
    mockHtmlWarningModalProps.current = props;
    return null;
  },
}));

// Mock transformData and absoluteModeRenderer
vi.mock("../ui/shared/transformData", () => ({
  transformFramesData: vi.fn(() => []),
}));

vi.mock("../ui/shared/absoluteModeRenderer", () => ({
  prepareFramesForRendering: vi.fn(() => []),
}));

/** Helper: set default CSS to avoid CSS warning modal */
function addDefaultCss(container: Element) {
  fireEvent.input(container.querySelectorAll("textarea")[1], {
    target: { value: "body{}" },
  });
}

/** Helper: find the Generate button by text content */
function findGenerateButton(container: Element): HTMLButtonElement {
  const buttons = container.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent?.includes("Generate") || btn.textContent?.includes("Generating")) {
      return btn as HTMLButtonElement;
    }
  }
  throw new Error("Generate button not found");
}

describe("HTML Tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    // Seed a plugin token so authed import requests can be issued.
    applyAuthToken("test.token", Date.now() + 3_600_000);
    mockFontModalProps.current = null;
    mockRenderingLoaderProps.current = null;
    mockHtmlWarningModalProps.current = null;
    // Default: valid HTML
    (validateHtml as ReturnType<typeof vi.fn>).mockReturnValue({
      isValid: true,
      errorCount: 0,
      errors: [],
    });
  });

  describe("rendering", () => {
    it("renders HTML and CSS textareas", () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      expect(textareas.length).toBe(2);
    });

    it("renders HTML textarea with correct placeholder", () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      expect(textareas[0].getAttribute("placeholder")).toContain("HTML");
    });

    it("renders CSS textarea with correct placeholder", () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      expect(textareas[1].getAttribute("placeholder")).toContain("CSS");
    });

    it("renders Generate Wireframe button", () => {
      const { getByText } = render(<HTML />);
      expect(getByText("Generate Wireframe")).toBeTruthy();
    });
  });

  describe("button state", () => {
    it("button is disabled when HTML textarea is empty", () => {
      const { container } = render(<HTML />);
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(true);
    });

    it("button is enabled when HTML textarea has content", () => {
      const { container } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Hello</h1>" } });
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(false);
    });

    it("button is disabled when text has no HTML tags", () => {
      const { container } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "hello world" } });
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(true);
    });

    it("button is disabled when only whitespace in HTML textarea", () => {
      const { container } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "   " } });
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(true);
    });
  });

  describe("loading state", () => {
    it("shows 'Generating...' text during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(getByText("Generating...")).toBeTruthy();
    });

    it("disables textareas during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const textareas = container.querySelectorAll("textarea");
      expect(textareas[0].disabled).toBe(true);
      expect(textareas[1].disabled).toBe(true);
    });

    it("disables button during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(button.disabled).toBe(true);
    });
  });

  describe("error state", () => {
    it("shows error message when API returns error", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Something went wrong" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("Something went wrong");
      expect(errorMsg).toBeTruthy();
    });

    it("shows error message on network failure", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("Network error"))) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("Network error");
      expect(errorMsg).toBeTruthy();
    });

    it("shows HTTP status when response.json() fails to parse", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error("Invalid JSON")),
        })
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      fireEvent.click(findGenerateButton(container));

      const errorMsg = await findByText("HTTP 500");
      expect(errorMsg).toBeTruthy();
    });

    it("shows errorData.details when error field is missing", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ details: "Validation failed: htmlCode required" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      fireEvent.click(findGenerateButton(container));

      const errorMsg = await findByText("Validation failed: htmlCode required");
      expect(errorMsg).toBeTruthy();
    });

    it("shows default message for non-Error exceptions", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject("string error")) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      fireEvent.click(findGenerateButton(container));

      const errorMsg = await findByText("Failed to generate wireframe from HTML");
      expect(errorMsg).toBeTruthy();
    });
  });

  describe("expand overlay", () => {
    /** Find maximize buttons by title attribute */
    function findMaximizeBtns(container: Element) {
      return Array.from(container.querySelectorAll("button")).filter(
        (btn) => btn.title === "Maximize"
      );
    }

    /** Find close button by title attribute */
    function findCloseBtn(container: Element) {
      return Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.title === "Close"
      ) as HTMLButtonElement | undefined;
    }

    it("opens overlay when HTML maximize button is clicked", () => {
      const { container } = render(<HTML />);
      const maximizeBtns = findMaximizeBtns(container);
      expect(maximizeBtns.length).toBe(2);

      fireEvent.click(maximizeBtns[0]);

      // A third textarea appears (the overlay one) and a Close button
      expect(container.querySelectorAll("textarea").length).toBe(3);
      expect(findCloseBtn(container)).toBeTruthy();
    });

    it("overlay textarea shows htmlCode value", () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<div>hello</div>" } });

      const maximizeBtns = findMaximizeBtns(container);
      fireEvent.click(maximizeBtns[0]);

      // The third textarea (overlay) should have the HTML value
      const allTextareas = container.querySelectorAll("textarea");
      expect(allTextareas[2].value).toBe("<div>hello</div>");
    });

    it("opens CSS overlay when CSS maximize button is clicked", () => {
      const { container, queryAllByText } = render(<HTML />);
      const maximizeBtns = findMaximizeBtns(container);
      fireEvent.click(maximizeBtns[1]);

      // Two "CSS (optional)" labels: section label + overlay label
      const cssLabels = queryAllByText("CSS (optional)");
      expect(cssLabels.length).toBe(2);
      expect(container.querySelectorAll("textarea").length).toBe(3);
    });

    it("closes overlay when close button is clicked", () => {
      const { container } = render(<HTML />);
      const maximizeBtns = findMaximizeBtns(container);
      fireEvent.click(maximizeBtns[0]);

      // Overlay textarea exists (3 textareas total)
      expect(container.querySelectorAll("textarea").length).toBe(3);

      const closeBtn = findCloseBtn(container);
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn!);

      // Back to 2 textareas
      expect(container.querySelectorAll("textarea").length).toBe(2);
    });

    it("typing in overlay updates the state", () => {
      const { container } = render(<HTML />);
      const maximizeBtns = findMaximizeBtns(container);
      fireEvent.click(maximizeBtns[0]);

      // Type in the overlay textarea (third one)
      const overlayTextarea = container.querySelectorAll("textarea")[2];
      fireEvent.input(overlayTextarea, { target: { value: "<p>test</p>" } });

      // Close overlay
      const closeBtn = findCloseBtn(container)!;
      fireEvent.click(closeBtn);

      // The normal HTML textarea should have the updated value
      const textareas = container.querySelectorAll("textarea");
      expect(textareas[0].value).toBe("<p>test</p>");
    });

    it("disables overlay textarea during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      // Start loading
      fireEvent.click(findGenerateButton(container));

      // Open HTML overlay
      const maximizeBtns = findMaximizeBtns(container);
      fireEvent.click(maximizeBtns[0]);

      // Overlay textarea (third one) should be disabled
      const allTextareas = container.querySelectorAll("textarea");
      expect(allTextareas[2].disabled).toBe(true);
    });
  });

  describe("status message display", () => {
    it("shows loading status message during generation", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const msg = await findByText("Generating wireframe from HTML...");
      expect(msg).toBeTruthy();
    });
  });

  describe("handleGenerate success flow", () => {
    const MOCK_API_RESPONSE = {
      success: true,
      sourceUrl: "html-import",
      frameCount: 1,
      wireframeData: {
        frames: [{ viewportWidth: 1440, viewportHeight: 900, tree: { tag: "BODY", children: [] } }],
      },
      localStyles: { colors: [], typography: [] },
      pluginColors: {
        main: "#333333",
        text: "#1C2F3A",
        accent: "#E76F51",
        surface: "#FFFFFF",
        border: "#E0E0E0",
        background: "#F5F5F5",
      },
      cssVariables: [{ name: "--primary", value: "#333" }],
    };

    function mockSuccessFetch() {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_API_RESPONSE),
        })
      ) as unknown as typeof fetch;
    }

    /** Type HTML, optionally CSS, and click Generate */
    async function triggerGenerate(
      container: Element,
      html: string,
      css: string = "body{}"
    ) {
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: html } });
      if (css) {
        fireEvent.input(textareas[1], { target: { value: css } });
      }
      const button = findGenerateButton(container);
      fireEvent.click(button);
      // Wait for fetch to resolve and state to update
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
    }

    beforeEach(() => {
      vi.clearAllMocks();
      mockSuccessFetch();
      // Spy on parent.postMessage
      vi.spyOn(parent, "postMessage");
    });

    it("sends correct fetch payload with HTML and CSS", async () => {
      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Hello</h1>", "h1 { color: red; }");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3002/api/import-html",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test.token",
          },
        })
      );

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.htmlCode).toBe("<h1>Hello</h1>");
      expect(body.cssCode).toBe("h1 { color: red; }");
      expect(body.viewports).toEqual([1440]);
      expect(body.pluginColors).toBeDefined();
    });

    it("sends empty CSS as undefined after CSS warning continue", async () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Hello</h1>" } });
      fireEvent.input(textareas[1], { target: { value: "   " } });
      fireEvent.click(findGenerateButton(container));

      // CSS warning appears
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      });
      mockHtmlWarningModalProps.current.onContinue();

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      // cssCode.trim() || undefined → undefined → not serialized in JSON
      expect(body.cssCode).toBeUndefined();
    });

    it("calls transformFramesData with raw frames and settings", async () => {
      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Hello</h1>");

      await waitFor(() => {
        expect(transformFramesData).toHaveBeenCalled();
      });

      const [rawFrames, settings] = (transformFramesData as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(rawFrames).toEqual(MOCK_API_RESPONSE.wireframeData.frames);
      expect(settings).toEqual({
        colorMode: "plugin",
        fontMode: "plugin",
        textMode: "semantic",
      });
    });

    it("calls prepareFramesForRendering with transformed frames and colors", async () => {
      const mockTransformed = [{ viewport: { width: 1440, height: 900 }, tree: { tag: "BODY" } }];
      (transformFramesData as ReturnType<typeof vi.fn>).mockReturnValue(mockTransformed);

      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Hello</h1>");

      await waitFor(() => {
        expect(prepareFramesForRendering).toHaveBeenCalled();
      });

      const [frames, colors] = (prepareFramesForRendering as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(frames).toEqual(mockTransformed);
      expect(colors).toEqual({
        text: MOCK_API_RESPONSE.pluginColors.text,
        surface: MOCK_API_RESPONSE.pluginColors.surface,
      });
    });

    it("sends render-wireframe postMessage to parent", async () => {
      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Hello</h1>");

      await waitFor(() => {
        expect(parent.postMessage).toHaveBeenCalled();
      });

      const call = (parent.postMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const msg = call[0].pluginMessage;
      expect(msg.type).toBe("render-wireframe");
      expect(msg.data.sourceUrl).toBe("html-import");
      expect(msg.data.colorMode).toBe("plugin");
      expect(msg.data.fontMode).toBe("plugin");
      expect(msg.data.textMode).toBe("semantic");
      expect(msg.data.layoutMode).toBe("autoLayout");
      expect(msg.data.cssVariables).toEqual(MOCK_API_RESPONSE.cssVariables);
      expect(msg.data.variableMode).toBe("direct");
    });

    it("sends colorMode and typographyMode directly to API", async () => {
      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Hello</h1>");

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.colorMode).toBe("plugin");
      expect(body.typographyMode).toBe("plugin");
    });

    it("handles missing wireframeData gracefully", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            pluginColors: { text: "#000", surface: "#FFF" },
          }),
        })
      ) as unknown as typeof fetch;

      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Test</h1>");

      await waitFor(() => {
        expect(transformFramesData).toHaveBeenCalledWith([], expect.any(Object));
      });
    });

    it("falls back to config pluginColors when API response has none", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            wireframeData: { frames: [] },
          }),
        })
      ) as unknown as typeof fetch;

      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Test</h1>");

      await waitFor(() => {
        expect(prepareFramesForRendering).toHaveBeenCalled();
      });

      const [, colors] = (prepareFramesForRendering as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(colors).toEqual({
        text: "#1C2F3A",
        surface: "#FFFFFF",
      });
    });

    it("shows RenderingLoader with initial progress after sendToFigma", async () => {
      const { container } = render(<HTML />);
      await triggerGenerate(container, "<h1>Test</h1>");

      await waitFor(() => {
        expect(parent.postMessage).toHaveBeenCalled();
      });

      expect(mockRenderingLoaderProps.current.isVisible).toBe(true);
      expect(mockRenderingLoaderProps.current.progress).toEqual({
        step: "Creating wireframe...",
        percent: 0,
      });
    });
  });

  describe("message handling", () => {
    function dispatchPluginMessage(type: string, data: any) {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { pluginMessage: { type, data } },
        })
      );
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it("render-progress updates renderingProgress state", async () => {
      render(<HTML />);

      dispatchPluginMessage("render-progress", {
        step: "Creating nodes...",
        percent: 50,
        isComplete: false,
      });

      await waitFor(() => {
        expect(mockRenderingLoaderProps.current.progress).toEqual({
          step: "Creating nodes...",
          percent: 50,
          isComplete: false,
        });
      });
    });

    it("render-progress isComplete resets state after 10 seconds", async () => {
      vi.useFakeTimers();

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Test</h1>" } });

      dispatchPluginMessage("render-progress", {
        step: "Done!",
        percent: 100,
        isComplete: true,
      });

      // Before 10s: textarea still has value
      expect(textareas[0].value).toBe("<h1>Test</h1>");

      // After 10s: state resets
      await vi.advanceTimersByTimeAsync(10000);
      expect(textareas[0].value).toBe("");
    });

    it("fonts-not-available opens font fallback modal", async () => {
      render(<HTML />);

      dispatchPluginMessage("fonts-not-available", {
        missingFonts: ["CustomFont", "AnotherFont"],
        defaultMapping: { CustomFont: "Arial", AnotherFont: "Helvetica" },
        pluginFont: "Montserrat",
        pluginFontOptions: ["Montserrat", "Roboto"],
      });

      await waitFor(() => {
        expect(mockFontModalProps.current.isOpen).toBe(true);
      });
      expect(mockFontModalProps.current.missingFonts).toEqual(["CustomFont", "AnotherFont"]);
      expect(mockFontModalProps.current.defaultMapping).toEqual({
        CustomFont: "Arial",
        AnotherFont: "Helvetica",
      });
    });

    it("wireframe-error shows error message and hides loader", async () => {
      const { findByText } = render(<HTML />);

      dispatchPluginMessage("wireframe-error", {
        error: "Rendering failed: out of memory",
      });

      const errorMsg = await findByText("Rendering failed: out of memory");
      expect(errorMsg).toBeTruthy();
      expect(mockRenderingLoaderProps.current.isVisible).toBe(false);
    });

    it("font-fallback-choice sends postMessage to parent", async () => {
      vi.spyOn(parent, "postMessage");
      render(<HTML />);

      // First open the modal
      dispatchPluginMessage("fonts-not-available", {
        missingFonts: ["CustomFont"],
        defaultMapping: { CustomFont: "Arial" },
        pluginFont: "Montserrat",
        pluginFontOptions: ["Montserrat"],
      });

      await waitFor(() => {
        expect(mockFontModalProps.current.isOpen).toBe(true);
      });

      // Call the onChoice callback
      mockFontModalProps.current.onChoice("use-plugin", { CustomFont: "Montserrat" });

      expect(parent.postMessage).toHaveBeenCalledWith(
        {
          pluginMessage: {
            type: "font-fallback-choice",
            data: {
              choice: "use-plugin",
              fontMapping: { CustomFont: "Montserrat" },
            },
          },
        },
        "*"
      );
    });

    it("shows default error when wireframe-error has no error text", async () => {
      const { findByText } = render(<HTML />);

      dispatchPluginMessage("wireframe-error", {});

      const errorMsg = await findByText("Failed to create wireframe");
      expect(errorMsg).toBeTruthy();
    });

    it("closes font modal after choice is made", async () => {
      render(<HTML />);

      dispatchPluginMessage("fonts-not-available", {
        missingFonts: ["CustomFont"],
        defaultMapping: { CustomFont: "Arial" },
        pluginFont: "Montserrat",
        pluginFontOptions: ["Montserrat"],
      });

      await waitFor(() => {
        expect(mockFontModalProps.current.isOpen).toBe(true);
      });

      mockFontModalProps.current.onChoice("use-plugin", { CustomFont: "Montserrat" });

      await waitFor(() => {
        expect(mockFontModalProps.current.isOpen).toBe(false);
      });
    });

    it("clears resetTimeout on unmount to prevent timer leak", async () => {
      vi.useFakeTimers();

      const { unmount } = render(<HTML />);

      dispatchPluginMessage("render-progress", {
        step: "Done!",
        percent: 100,
        isComplete: true,
      });

      // Unmount before 10s timeout fires
      unmount();

      // Should not throw or cause issues after unmount
      await vi.advanceTimersByTimeAsync(15000);
    });

    it("cancels pending reset timeout when new import starts", async () => {
      vi.useFakeTimers();

      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            wireframeData: { frames: [] },
            pluginColors: { text: "#000", surface: "#FFF" },
          }),
        })
      ) as unknown as typeof fetch;
      vi.spyOn(parent, "postMessage");

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      // Complete rendering → sets 10s reset timeout
      dispatchPluginMessage("render-progress", {
        step: "Done!",
        percent: 100,
        isComplete: true,
      });

      // Before 10s passes, start new generate → sendToFigma cancels old timeout
      fireEvent.click(findGenerateButton(container));

      // Flush promises and advance past the original 10s
      await vi.advanceTimersByTimeAsync(15000);

      // RenderingLoader should still be visible (new import in progress, not reset)
      expect(mockRenderingLoaderProps.current.isVisible).toBe(true);
    });
  });

  describe("edge cases", () => {
    const MOCK_API_RESPONSE = {
      success: true,
      sourceUrl: "html-import",
      frameCount: 1,
      wireframeData: {
        frames: [{ viewportWidth: 1440, viewportHeight: 900, tree: { tag: "BODY", children: [] } }],
      },
      localStyles: { colors: [], typography: [] },
      pluginColors: {
        main: "#333333", text: "#1C2F3A", accent: "#E76F51",
        surface: "#FFFFFF", border: "#E0E0E0", background: "#F5F5F5",
      },
      cssVariables: [],
    };

    function mockSuccessFetch() {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_API_RESPONSE),
        })
      ) as unknown as typeof fetch;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      mockSuccessFetch();
    });

    it("includes CSS textarea value in API request body", async () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");

      fireEvent.input(textareas[0], { target: { value: "<div>Test</div>" } });
      fireEvent.input(textareas[1], { target: { value: ".container { padding: 20px; }" } });

      const button = findGenerateButton(container);
      fireEvent.click(button);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.cssCode).toBe(".container { padding: 20px; }");
    });

    it("sends whitespace-only CSS as undefined after CSS warning continue", async () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");

      fireEvent.input(textareas[0], { target: { value: "<p>Hello</p>" } });
      fireEvent.input(textareas[1], { target: { value: "   \n  \t  " } });

      fireEvent.click(findGenerateButton(container));

      // CSS warning appears
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      });
      mockHtmlWarningModalProps.current.onContinue();

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.cssCode).toBeUndefined();
    });

    it("calls collapseSettings on generate", async () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");

      fireEvent.input(textareas[0], { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(mockCollapseSettings).toHaveBeenCalled();
    });

    it("clears error state on new generate attempt", async () => {
      // First: mock a failed fetch
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Server error" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Test</h1>" } });
      addDefaultCss(container);

      // Trigger first generate → error
      fireEvent.click(findGenerateButton(container));
      await findByText("Server error");

      // Now mock a successful fetch
      mockSuccessFetch();

      // Trigger second generate → should show loading, not error
      fireEvent.click(findGenerateButton(container));
      const loadingMsg = await findByText("Generating wireframe from HTML...");
      expect(loadingMsg).toBeTruthy();
    });

    it("RenderingLoader onClose resets all state", async () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");

      // Type some content
      fireEvent.input(textareas[0], { target: { value: "<h1>Test</h1>" } });
      fireEvent.input(textareas[1], { target: { value: "h1 { color: red; }" } });

      // Simulate onClose callback from RenderingLoader
      mockRenderingLoaderProps.current.onClose();

      // Textareas should be cleared after state update
      await waitFor(() => {
        expect(textareas[0].value).toBe("");
      });
      expect(textareas[1].value).toBe("");

      // Loader should be hidden
      expect(mockRenderingLoaderProps.current.isVisible).toBe(false);
    });
  });

  describe("HTML validation warning", () => {
    const MOCK_API_RESPONSE = {
      success: true,
      wireframeData: { frames: [] },
      pluginColors: { text: "#000", surface: "#FFF" },
    };

    function mockSuccessFetch() {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_API_RESPONSE),
        })
      ) as unknown as typeof fetch;
    }

    it("proceeds directly to fetch when HTML is valid and CSS is provided", async () => {
      mockSuccessFetch();
      vi.spyOn(parent, "postMessage");

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Valid</h1>" } });
      addDefaultCss(container);
      fireEvent.click(findGenerateButton(container));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // Warning modal should NOT be open
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
    });

    it("shows warning modal instead of fetching when HTML is invalid", async () => {
      (validateHtml as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        errorCount: 2,
        errors: ["Unclosed tag: <div>", "Unclosed tag: <p>"],
      });

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<div><p>Bad" } });
      fireEvent.click(findGenerateButton(container));

      // Should NOT have called fetch
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // Warning modal should be open with correct data
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      });
      expect(mockHtmlWarningModalProps.current.errorCount).toBe(2);
      expect(mockHtmlWarningModalProps.current.errors).toEqual([
        "Unclosed tag: <div>",
        "Unclosed tag: <p>",
      ]);
    });

    it("proceeds with generation when user clicks Continue Anyway", async () => {
      mockSuccessFetch();
      vi.spyOn(parent, "postMessage");

      (validateHtml as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        errorCount: 1,
        errors: ["Unclosed tag: <div>"],
      });

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<div>Bad" } });
      fireEvent.click(findGenerateButton(container));

      // Modal should be open
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      });

      // Click Continue Anyway
      mockHtmlWarningModalProps.current.onContinue();

      // Now fetch should be called
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // Modal should be closed
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
    });

    it("returns to editing when user clicks Go Back", async () => {
      (validateHtml as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        errorCount: 1,
        errors: ["Unclosed tag: <div>"],
      });

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<div>Bad" } });
      fireEvent.click(findGenerateButton(container));

      // Modal should be open
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      });

      // Click Go Back
      mockHtmlWarningModalProps.current.onCancel();

      // Fetch should NOT have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // Modal should be closed
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
      });

      // HTML textarea should still have the value (user can edit)
      expect(textareas[0].value).toBe("<div>Bad");
    });

    it("does not generate or show modal when textarea is empty", () => {
      const { container } = render(<HTML />);
      fireEvent.click(findGenerateButton(container));

      // No fetch, no modal
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(validateHtml).not.toHaveBeenCalled();
    });

    it("does not generate when textarea has only whitespace", () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "   \n\t  " } });
      fireEvent.click(findGenerateButton(container));

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(validateHtml).not.toHaveBeenCalled();
    });

    it("calls validateHtml with trimmed HTML code", () => {
      (validateHtml as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: true,
        errorCount: 0,
        errors: [],
      });
      mockSuccessFetch();

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "  <h1>Test</h1>  " } });
      addDefaultCss(container);
      fireEvent.click(findGenerateButton(container));

      expect(validateHtml).toHaveBeenCalledWith("<h1>Test</h1>");
    });
  });

  describe("CSS missing warning", () => {
    const MOCK_API_RESPONSE = {
      success: true,
      wireframeData: { frames: [] },
      pluginColors: { text: "#000", surface: "#FFF" },
    };

    function mockSuccessFetch() {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_API_RESPONSE),
        })
      ) as unknown as typeof fetch;
    }

    it("shows CSS warning modal when CSS textarea is empty", () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Hello</h1>" } });
      fireEvent.click(findGenerateButton(container));

      // Should NOT have called fetch
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // Warning modal should be open with CSS-specific content
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      expect(mockHtmlWarningModalProps.current.title).toBe("Missing CSS");
      expect(mockHtmlWarningModalProps.current.errorCount).toBe(1);
      expect(mockHtmlWarningModalProps.current.errors[0]).toContain("without CSS");
    });

    it("proceeds with generation when user clicks Continue Anyway on CSS warning", async () => {
      mockSuccessFetch();
      vi.spyOn(parent, "postMessage");

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Hello</h1>" } });
      fireEvent.click(findGenerateButton(container));

      // CSS warning appears
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      expect(mockHtmlWarningModalProps.current.title).toBe("Missing CSS");

      // Click Continue Anyway
      mockHtmlWarningModalProps.current.onContinue();

      // Now fetch should be called
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // Modal should be closed
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
    });

    it("returns to editing when user clicks Go Back on CSS warning", async () => {
      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Hello</h1>" } });
      fireEvent.click(findGenerateButton(container));

      // CSS warning appears
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);

      // Click Go Back
      mockHtmlWarningModalProps.current.onCancel();

      // Fetch should NOT have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // Modal should be closed
      await waitFor(() => {
        expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
      });

      // HTML textarea should still have the value
      expect(textareas[0].value).toBe("<h1>Hello</h1>");
    });

    it("does NOT show CSS warning when CSS textarea has content", async () => {
      mockSuccessFetch();

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<h1>Hello</h1>" } });
      fireEvent.input(textareas[1], { target: { value: "h1 { color: red; }" } });
      fireEvent.click(findGenerateButton(container));

      // Should proceed directly to fetch
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // Modal should NOT be open
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
    });

    it("shows HTML warning first when both HTML is invalid and CSS is empty", () => {
      (validateHtml as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        errorCount: 1,
        errors: ["Unclosed tag: <div>"],
      });

      const { container } = render(<HTML />);
      const textareas = container.querySelectorAll("textarea");
      fireEvent.input(textareas[0], { target: { value: "<div>Bad" } });
      // CSS is empty too
      fireEvent.click(findGenerateButton(container));

      // Should show HTML warning, not CSS warning
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(true);
      expect(mockHtmlWarningModalProps.current.title).toBe("HTML Quality Warning");
      expect(mockHtmlWarningModalProps.current.errors).toEqual(["Unclosed tag: <div>"]);
    });
  });
});
