import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import HTML from "../ui/pages/import/html/HTML";

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
    collapseSettings: vi.fn(),
  }),
}));

// Mock FontFallbackModal
vi.mock("../ui/components/modalPopup/FontFallbackModal", () => ({
  default: () => null,
}));

// Mock RenderingLoader
vi.mock("../ui/components/renderingLoader/RenderingLoader", () => ({
  default: () => null,
}));

// Mock transformData and absoluteModeRenderer
vi.mock("../ui/shared/transformData", () => ({
  transformFramesData: vi.fn(() => []),
}));

vi.mock("../ui/shared/absoluteModeRenderer", () => ({
  prepareFramesForRendering: vi.fn(() => []),
}));

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

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(getByText("Generating...")).toBeTruthy();
    });

    it("disables textareas during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });

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

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("Network error");
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
  });

  describe("status message display", () => {
    it("shows loading status message during generation", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, findByText } = render(<HTML />);
      const textarea = container.querySelectorAll("textarea")[0];
      fireEvent.input(textarea, { target: { value: "<h1>Test</h1>" } });

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const msg = await findByText("Generating wireframe from HTML...");
      expect(msg).toBeTruthy();
    });
  });
});
