/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, act } from "@testing-library/preact";
import AreaSelection from "../ui/pages/import/areaSelection/AreaSelection";

/**
 * The Area tab has always told users to "Drag-and-drop your .w2w file" while
 * wiring up nothing but the Browse button — dropping a file did nothing at all.
 */

/**
 * happy-dom omits the `ondrop`/`ondragover`/`ondragleave` element properties
 * that every real browser exposes. Preact decides an event's registered name by
 * probing for that property, so without them it would attach "Drop" instead of
 * "drop" and no dispatched drop event could ever reach the handler. Declaring
 * them lines the stub up with a real browser (and with the Figma iframe) so the
 * component is exercised the way it actually runs.
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
  const actual =
    await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return { ...actual, authHeader: () => "Bearer test-token" };
});

function findButton(container: Element, label: string): HTMLButtonElement {
  for (const btn of Array.from(container.querySelectorAll("button"))) {
    if (btn.textContent?.includes(label)) return btn as HTMLButtonElement;
  }
  throw new Error(`${label} button not found`);
}

const importButton = (container: Element): HTMLButtonElement =>
  findButton(container, "Import");

/**
 * CSS module imports resolve to an empty string under vitest, so the drop zone
 * has no usable class to select on. Dispatching at the Browse button instead
 * lets the event bubble up to the zone's handler — same code path, stable
 * target. Whether the zone visibly highlights is a styling question, checked
 * in Figma.
 *
 * `dataTransfer` is attached by hand because happy-dom exposes it as a
 * read-only getter that fireEvent's event init cannot populate; the dispatch
 * is wrapped in act() so Preact flushes the resulting state update.
 */
function dispatchDrop(container: Element, files: File[]): void {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  act(() => {
    findButton(container, "Browse").dispatchEvent(event);
  });
}

const drop = (container: Element, file: File): void =>
  dispatchDrop(container, [file]);

const captureFile = (name = "capture.w2w", size?: number): File => {
  const file = new File([new Uint8Array([0x57, 0x32, 0x57, 0x32])], name, {
    type: "application/octet-stream",
  });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("AreaSelection — drag & drop", () => {
  it("accepts a dropped .w2w file and enables Import", () => {
    const { container } = render(<AreaSelection />);
    expect(importButton(container).disabled).toBe(true);

    drop(container, captureFile("header.w2w"));

    expect(container.textContent).toContain("header.w2w");
    expect(importButton(container).disabled).toBe(false);
  });

  it("rejects a file that is not .w2w and keeps Import disabled", () => {
    const { container } = render(<AreaSelection />);

    drop(container, captureFile("screenshot.png"));

    expect(container.textContent).toContain("Only .w2w files");
    expect(importButton(container).disabled).toBe(true);
  });

  it("rejects a file over the 100 MB ceiling", () => {
    const { container } = render(<AreaSelection />);

    drop(container, captureFile("huge.w2w", 101 * 1024 * 1024));

    expect(container.textContent).toContain("too large");
    expect(importButton(container).disabled).toBe(true);
  });

  it("ignores a drop that carries no file", () => {
    const { container } = render(<AreaSelection />);

    dispatchDrop(container, []);

    expect(importButton(container).disabled).toBe(true);
  });
});
