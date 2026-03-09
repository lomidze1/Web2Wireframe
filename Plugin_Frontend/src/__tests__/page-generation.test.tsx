/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import PageGeneration from "../ui/pages/aiGeneration/pageGeneration/PageGeneration";

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
      openSettings: vi.fn(),
      setConfig: vi.fn(),
    }),
  };
});

/** Helper: find the Generate button */
function findGenerateButton(container: Element): HTMLButtonElement {
  const buttons = container.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent?.includes("Generate") || btn.textContent?.includes("Generating")) {
      return btn as HTMLButtonElement;
    }
  }
  throw new Error("Generate button not found");
}

/** Helper: click a chip by label text */
function clickChip(container: Element, label: string) {
  const buttons = container.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent === label) {
      fireEvent.click(btn);
      return;
    }
  }
  throw new Error(`Chip "${label}" not found`);
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
            frames: [{ viewport: { width: 1440, height: 900 }, tree: { type: "FRAME", name: "Home" } }],
          },
          sourceUrl: "ai://home-page",
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

describe("PageGeneration", () => {
  const onBack = vi.fn();
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    postMessageSpy = vi.spyOn(window.parent, "postMessage");
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
  });

  describe("rendering", () => {
    it("renders page type chips", () => {
      const { getByText } = render(<PageGeneration onBack={onBack} />);
      expect(getByText("Home")).toBeTruthy();
      expect(getByText("About")).toBeTruthy();
      expect(getByText("Pricing")).toBeTruthy();
      expect(getByText("Contact")).toBeTruthy();
      expect(getByText("Blog")).toBeTruthy();
      expect(getByText("Login")).toBeTruthy();
      expect(getByText("Register")).toBeTruthy();
      expect(getByText("Faq")).toBeTruthy();
    });

    it("renders Generate Wireframe button", () => {
      const { getByText } = render(<PageGeneration onBack={onBack} />);
      expect(getByText("Generate Wireframe")).toBeTruthy();
    });
  });

  describe("button state", () => {
    it("button is disabled when no page is selected", () => {
      const { container } = render(<PageGeneration onBack={onBack} />);
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(true);
    });

    it("button is enabled when a page is selected", () => {
      const { container } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(false);
    });

    it("button is disabled when customize is open but no sections selected", () => {
      const { container } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      // Open customize panel
      const buttons = container.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.includes("Customize")) {
          fireEvent.click(btn);
          break;
        }
      }

      const generateBtn = findGenerateButton(container);
      expect(generateBtn.disabled).toBe(true);
    });
  });

  describe("loading state", () => {
    it("shows 'Generating...' text during API call", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(getByText("Generating…")).toBeTruthy();
    });

    it("disables button during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(button.disabled).toBe(true);
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

      const { container, findByText } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("API key not configured");
      expect(errorMsg).toBeTruthy();
    });

    it("shows error message on network failure", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.reject(new Error("Network error"))
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("Network error");
      expect(errorMsg).toBeTruthy();
    });

    it("clears error when starting new generation", async () => {
      // First call fails
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "First error" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText, queryByText } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      await findByText("First error");

      // Second call hangs (loading state)
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
      fireEvent.click(button);

      expect(queryByText("First error")).toBeNull();
    });
  });

  describe("success flow", () => {
    it("sends render-wireframe message to parent on success", async () => {
      mockSuccessResponse();

      const { container } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      // Wait for fetch to resolve
      await vi.waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalled();
      });

      const call = postMessageSpy.mock.calls[0];
      const msg = (call[0] as { pluginMessage: { type: string; data: Record<string, unknown> } }).pluginMessage;
      expect(msg.type).toBe("render-wireframe");
      expect(msg.data.sourceUrl).toBe("ai://home-page");
      expect(msg.data.variableMode).toBe("direct");
      expect(msg.data.layoutMode).toBe("autoLayout");
      expect(msg.data.colorMode).toBe("plugin");
      expect(msg.data.fontMode).toBe("plugin");
      expect(msg.data.textMode).toBe("semantic");
      expect(msg.data.frames).toBeDefined();
    });

    it("sends correct request body to API", async () => {
      mockSuccessResponse();

      const { container } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Pricing");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.pageType).toBe("pricing");
      expect(body.density).toBe("balanced");
      expect(body.viewports).toEqual([1440]);
      expect(body.pluginColors).toBeDefined();
      expect(body.pluginFont).toBe("Montserrat");
    });
  });

  describe("message listener", () => {
    it("resets generating state on wireframe-created message", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(getByText("Generating…")).toBeTruthy();

      // Simulate wireframe-created message from Figma sandbox
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { pluginMessage: { type: "wireframe-created" } },
        })
      );

      await vi.waitFor(() => {
        expect(getByText("Generate Wireframe")).toBeTruthy();
      });
    });

    it("shows error and resets on wireframe-error message", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText, findByText } = render(<PageGeneration onBack={onBack} />);
      clickChip(container, "Home");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(getByText("Generating…")).toBeTruthy();

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
      expect(getByText("Generate Wireframe")).toBeTruthy();
    });
  });

  describe("back button", () => {
    it("calls onBack when back button is clicked", () => {
      const { container } = render(<PageGeneration onBack={onBack} />);
      const backBtn = container.querySelector("button[title='Back to AI Generations']") as HTMLButtonElement;
      fireEvent.click(backBtn);
      expect(onBack).toHaveBeenCalledOnce();
    });
  });
});
