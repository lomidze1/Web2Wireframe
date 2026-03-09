/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import BlockGeneration from "../ui/pages/aiGeneration/blockGeneration/BlockGeneration";

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
            frames: [{ viewport: { width: 1440, height: 600 }, tree: { type: "FRAME", name: "Hero" } }],
          },
          sourceUrl: "ai://hero-block",
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

describe("BlockGeneration", () => {
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
    it("renders block type chips", () => {
      const { getByText } = render(<BlockGeneration onBack={onBack} />);
      expect(getByText("Hero")).toBeTruthy();
      expect(getByText("Header")).toBeTruthy();
      expect(getByText("Footer")).toBeTruthy();
      expect(getByText("Pricing")).toBeTruthy();
      expect(getByText("Testimonials")).toBeTruthy();
      expect(getByText("Faq")).toBeTruthy();
      expect(getByText("Cta")).toBeTruthy();
      expect(getByText("Team")).toBeTruthy();
      expect(getByText("Features")).toBeTruthy();
    });

    it("renders Generate Wireframe button", () => {
      const { getByText } = render(<BlockGeneration onBack={onBack} />);
      expect(getByText("Generate Wireframe")).toBeTruthy();
    });
  });

  describe("button state", () => {
    it("button is disabled when no block is selected", () => {
      const { container } = render(<BlockGeneration onBack={onBack} />);
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(true);
    });

    it("button is enabled when a block is selected", () => {
      const { container } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");
      const button = findGenerateButton(container);
      expect(button.disabled).toBe(false);
    });
  });

  describe("loading state", () => {
    it("shows 'Generating...' text during API call", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      expect(getByText("Generating…")).toBeTruthy();
    });

    it("disables button during loading", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

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

      const { container, findByText } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("API key not configured");
      expect(errorMsg).toBeTruthy();
    });

    it("shows error message on network failure", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.reject(new Error("Network error"))
      ) as unknown as typeof fetch;

      const { container, findByText } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      const errorMsg = await findByText("Network error");
      expect(errorMsg).toBeTruthy();
    });

    it("clears error when starting new generation", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "First error" }),
        })
      ) as unknown as typeof fetch;

      const { container, findByText, queryByText } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

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

      const { container } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      await vi.waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalled();
      });

      const call = postMessageSpy.mock.calls[0];
      const msg = (call[0] as { pluginMessage: { type: string; data: Record<string, unknown> } }).pluginMessage;
      expect(msg.type).toBe("render-wireframe");
      expect(msg.data.sourceUrl).toBe("ai://hero-block");
      expect(msg.data.variableMode).toBe("direct");
      expect(msg.data.layoutMode).toBe("autoLayout");
      expect(msg.data.colorMode).toBe("plugin");
      expect(msg.data.fontMode).toBe("plugin");
      expect(msg.data.textMode).toBe("semantic");
      expect(msg.data.frames).toBeDefined();
    });

    it("sends correct request body to API", async () => {
      mockSuccessResponse();

      const { container } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Features");

      const button = findGenerateButton(container);
      fireEvent.click(button);

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.blockType).toBe("features");
      expect(body.density).toBe("balanced");
      expect(body.viewports).toEqual([1440]);
      expect(body.pluginColors).toBeDefined();
      expect(body.pluginFont).toBe("Montserrat");
      // Block generation should NOT have sections or notes
      expect(body.sections).toBeUndefined();
      expect(body.notes).toBeUndefined();
    });
  });

  describe("message listener", () => {
    it("resets generating state on wireframe-created message", async () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

      const { container, getByText } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

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

      const { container, getByText, findByText } = render(<BlockGeneration onBack={onBack} />);
      clickChip(container, "Hero");

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
      const { container } = render(<BlockGeneration onBack={onBack} />);
      const backBtn = container.querySelector("button[title='Back to AI Generations']") as HTMLButtonElement;
      fireEvent.click(backBtn);
      expect(onBack).toHaveBeenCalledOnce();
    });
  });
});
