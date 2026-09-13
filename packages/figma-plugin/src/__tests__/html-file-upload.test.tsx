/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, act, waitFor, fireEvent } from "@testing-library/preact";
import HTML from "../ui/pages/import/html/HTML";
import { applyAuthToken } from "../ui/shared/licenseClient";

/**
 * The HTML tab only ever accepted pasted code. Users who already have an
 * .html file on disk had to open it and copy the whole thing across, so the
 * tab now offers a Files mode with two drop zones (HTML + CSS) next to the
 * existing Code mode.
 */

/**
 * happy-dom omits the `ondrop`/`ondragover`/`ondragleave` element properties
 * that every real browser exposes; Preact probes for them to decide an
 * event's registered name. Same stub as areaSelection-drag-drop.test.tsx.
 */
beforeAll(() => {
  for (const prop of ["ondrop", "ondragover", "ondragleave"]) {
    if (!(prop in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        value: null,
        writable: true,
        configurable: true,
      });
    }
  }
});

vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../ui/shared/ConfigContext")>();
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
    localOriginLinks: true,
    toggleViewport: vi.fn(),
    setColorMode: vi.fn(),
    setFontMode: vi.fn(),
    setTextMode: vi.fn(),
    setCssVariablesMode: vi.fn(),
    setLayoutMode: vi.fn(),
    setAssetMode: vi.fn(),
    setInteractionMode: vi.fn(),
    setOriginLinks: vi.fn(),
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

// Capture the warning modal's props — used to assert the "Missing CSS" gate.
const mockHtmlWarningModalProps: { current: any } = { current: null };
vi.mock("../ui/components/modalPopup/HtmlWarningModal", () => ({
  default: (props: any) => {
    mockHtmlWarningModalProps.current = props;
    return null;
  },
}));

vi.mock("../utils/validateHtml", () => ({
  validateHtml: vi.fn(() => ({ isValid: true, errorCount: 0, errors: [] })),
}));

function findButton(container: Element, label: string): HTMLButtonElement {
  for (const btn of Array.from(container.querySelectorAll("button"))) {
    if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
  }
  throw new Error(`${label} button not found`);
}

function byAriaLabel(container: Element, label: string): HTMLElement {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`element with aria-label "${label}" not found`);
  return el as HTMLElement;
}

const importButton = (container: Element): HTMLButtonElement =>
  findButton(container, "Import");

const switchToFiles = (container: Element): void => {
  fireEvent.click(findButton(container, "Files"));
};

const textFile = (name: string, content: string, size?: number): File => {
  const file = new File([content], name, { type: "text/plain" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
};

/**
 * `dataTransfer` is attached by hand because happy-dom exposes it as a
 * read-only getter that fireEvent's event init cannot populate. Dispatching
 * at the zone's Browse button lets the event bubble to the zone handler.
 */
function drop(container: Element, browseLabel: string, files: File[]): void {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  act(() => {
    byAriaLabel(container, browseLabel).dispatchEvent(event);
  });
}

/** Fires the hidden input's change with a file list happy-dom can read. */
function pick(container: Element, inputLabel: string, file: File): void {
  const input = byAriaLabel(container, inputLabel) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("HTML tab — file upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ wireframeData: { frames: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as unknown as typeof fetch;
    applyAuthToken("test.token", Date.now() + 3_600_000);
    mockHtmlWarningModalProps.current = null;
  });

  describe("mode switch", () => {
    it("starts in Code mode with both textareas visible", () => {
      const { container } = render(<HTML />);

      expect(container.querySelectorAll("textarea")).toHaveLength(2);
      expect(container.textContent).not.toContain("Drag-and-drop your .html");
    });

    it("swaps the textareas for two drop zones in Files mode", () => {
      const { container } = render(<HTML />);

      switchToFiles(container);

      expect(container.querySelectorAll("textarea")).toHaveLength(0);
      expect(container.textContent).toContain("Drag-and-drop your .html file");
      expect(container.textContent).toContain("Drag-and-drop your .css file");
    });

    it("keeps the Settings panel in Files mode", () => {
      const { container } = render(<HTML />);

      switchToFiles(container);

      expect(container.textContent).toContain("Viewports");
    });
  });

  describe("accepting files", () => {
    it("loads a browsed .html file and enables Import", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);
      expect(importButton(container).disabled).toBe(true);

      pick(container, "Choose an HTML file", textFile("page.html", "<h1>Hi</h1>"));

      await waitFor(() => {
        expect(importButton(container).disabled).toBe(false);
      });
      expect(container.textContent).toContain("page.html");
    });

    it("accepts a dropped .html file the same way", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      drop(container, "Choose an HTML file", [
        textFile("dropped.html", "<main>ok</main>"),
      ]);

      await waitFor(() => {
        expect(container.textContent).toContain("dropped.html");
      });
      expect(importButton(container).disabled).toBe(false);
    });

    it("hands the file's contents to the Code textarea", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      pick(container, "Choose an HTML file", textFile("page.html", "<h1>Hi</h1>"));
      await waitFor(() => {
        expect(importButton(container).disabled).toBe(false);
      });

      fireEvent.click(findButton(container, "Code"));

      const textareas = container.querySelectorAll("textarea");
      expect((textareas[0] as HTMLTextAreaElement).value).toBe("<h1>Hi</h1>");
    });

    it("loads a .css file into the CSS slot so the Missing CSS warning stays shut", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      pick(container, "Choose an HTML file", textFile("page.html", "<h1>Hi</h1>"));
      pick(container, "Choose a CSS file", textFile("site.css", "h1{color:red}"));

      await waitFor(() => {
        expect(container.textContent).toContain("site.css");
      });

      fireEvent.click(importButton(container));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
      expect(mockHtmlWarningModalProps.current.isOpen).toBe(false);
    });

    it("clears the file and its contents via the remove button", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      pick(container, "Choose an HTML file", textFile("page.html", "<h1>Hi</h1>"));
      await waitFor(() => {
        expect(importButton(container).disabled).toBe(false);
      });

      fireEvent.click(byAriaLabel(container, "Remove the HTML file"));

      expect(container.textContent).not.toContain("page.html");
      expect(importButton(container).disabled).toBe(true);
    });
  });

  describe("rejecting files", () => {
    it("rejects a file that is not .html and keeps Import disabled", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      drop(container, "Choose an HTML file", [
        textFile("notes.txt", "<h1>Hi</h1>"),
      ]);

      await waitFor(() => {
        expect(container.textContent).toContain("Only .html files");
      });
      expect(importButton(container).disabled).toBe(true);
    });

    it("rejects a file that is not .css in the CSS zone", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      drop(container, "Choose a CSS file", [textFile("style.scss", "h1{}")]);

      await waitFor(() => {
        expect(container.textContent).toContain("Only .css files");
      });
    });

    it("rejects a file over the 5 MB ceiling", async () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      drop(container, "Choose an HTML file", [
        textFile("huge.html", "<h1>Hi</h1>", 6 * 1024 * 1024),
      ]);

      await waitFor(() => {
        expect(container.textContent).toContain("too large");
      });
      expect(importButton(container).disabled).toBe(true);
    });

    it("ignores a drop that carries no file", () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      drop(container, "Choose an HTML file", []);

      expect(importButton(container).disabled).toBe(true);
    });
  });

  /**
   * Two picks, and the SECOND one must win — whichever read finishes first.
   *
   * `acceptFile` starts a FileReader per pick and never checks, on completion,
   * that its file is still the chosen one. Drop a 5 MB `slow.html` and then a
   * small `fast.html`: fast resolves first and paints, then slow's `onload`
   * arrives and silently replaces both the name and the markup. The user
   * imports a file they already replaced.
   */
  describe("two files in flight", () => {
    class ControllableReader {
      static instances: ControllableReader[] = [];
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsText(): void {
        ControllableReader.instances.push(this);
      }
      /** Deliver this read's text, as the browser would. */
      finish(text: string): void {
        this.result = text;
        act(() => {
          this.onload?.();
        });
      }
      fail(): void {
        act(() => {
          this.onerror?.();
        });
      }
    }

    beforeEach(() => {
      ControllableReader.instances = [];
      vi.stubGlobal("FileReader", ControllableReader);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("keeps the newer file when an older read lands late", () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      pick(container, "Choose an HTML file", textFile("slow.html", "<h1>SLOW</h1>"));
      pick(container, "Choose an HTML file", textFile("fast.html", "<h1>FAST</h1>"));

      const [slow, fast] = ControllableReader.instances;
      fast.finish("<h1>FAST</h1>");
      slow.finish("<h1>SLOW</h1>");

      expect(container.textContent).toContain("fast.html");
      expect(container.textContent).not.toContain("slow.html");

      fireEvent.click(findButton(container, "Code"));
      const textareas = container.querySelectorAll("textarea");
      expect((textareas[0] as HTMLTextAreaElement).value).toBe("<h1>FAST</h1>");
    });

    it("does not let a late failure erase the file that did load", () => {
      const { container } = render(<HTML />);
      switchToFiles(container);

      pick(container, "Choose an HTML file", textFile("slow.html", "<h1>SLOW</h1>"));
      pick(container, "Choose an HTML file", textFile("fast.html", "<h1>FAST</h1>"));

      const [slow, fast] = ControllableReader.instances;
      fast.finish("<h1>FAST</h1>");
      slow.fail();

      expect(container.textContent).toContain("fast.html");
      expect(container.textContent).not.toMatch(/Could not read/i);
    });

    it("still reports a failure for the file the user is waiting on", () => {
      // The control: superseded reads go quiet, the current one still speaks.
      const { container } = render(<HTML />);
      switchToFiles(container);

      pick(container, "Choose an HTML file", textFile("only.html", "<h1>X</h1>"));
      ControllableReader.instances[0].fail();

      expect(container.textContent).toMatch(/Could not read/i);
    });
  });
});
