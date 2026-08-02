import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import Screenshot from "../ui/pages/import/screenshot/Screenshot";

// Mock ConfigContext
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => ({
      config: {
        figmaUserId: "user-1",
        pluginColors: {
          accent: "#E76F51",
          surface: "#FFFFFF",
          text: "#1C2F3A",
          background: "#FAFAFA",
          secondary: "#2A9D8F",
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
    localTextMode: "lorem" as const,
    localCssVariablesMode: "direct" as const,
    localLayoutMode: "absolute" as const,
    localAssetMode: "placeholders" as const,
    localInteractionMode: "none" as const,
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

// Mock LicenseContext
vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => ({ refresh: vi.fn() }),
}));

// authHeader throws without a stored plugin token — stub it.
vi.mock("../ui/shared/licenseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return {
    ...actual,
    authHeader: () => "Bearer test-token",
  };
});

// SettingsPanel is exercised by its own tests — keep this suite focused.
vi.mock("../ui/components/settingsPanel", () => ({
  default: () => null,
}));

// Mock the downscale util — happy-dom cannot decode images.
const mockDownscale = vi.fn();
vi.mock("../ui/shared/imageDownscale", () => ({
  MAX_IMAGE_DIMENSION: 1568,
  downscaleImage: (...args: unknown[]) => mockDownscale(...args),
  // Used to measure the original file for Real Assets cropping.
  loadImageElement: async () => ({ naturalWidth: 2000, naturalHeight: 1000 }),
}));

const DOWNSCALED = {
  dataUrl: "data:image/jpeg;base64,DOWNSCALED",
  width: 1000,
  height: 500,
};

function makeImageFile(name = "shot.png", type = "image/png"): File {
  return new File(["fake-image-bytes"], name, { type });
}

function getDropzone(container: Element): HTMLElement {
  const input = container.querySelector('input[type="file"]');
  const label = input?.closest("label");
  const wrapper = label?.parentElement;
  if (!wrapper) throw new Error("upload dropzone not found");
  return wrapper as HTMLElement;
}

beforeEach(() => {
  mockDownscale.mockReset();
  mockDownscale.mockResolvedValue({ ...DOWNSCALED });
});

describe("Screenshot tab — upload sources", () => {
  it("advertises drag & drop and paste in the caption", () => {
    const { container } = render(<Screenshot />);
    expect(container.textContent).toMatch(/drag/i);
    expect(container.textContent).toMatch(/paste/i);
  });

  it("shows a downscaled preview after file input selection", async () => {
    const { container } = render(<Screenshot />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("src")).toBe(DOWNSCALED.dataUrl);
    });
    expect(mockDownscale).toHaveBeenCalledTimes(1);
  });

  it("accepts an image via drag & drop", async () => {
    const { container } = render(<Screenshot />);
    const dropzone = getDropzone(container);

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeImageFile()] },
    });

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });
  });

  it("accepts an image pasted from the clipboard", async () => {
    const { container } = render(<Screenshot />);

    const pasteEvent = new Event("paste") as Event & {
      clipboardData: { files: File[]; items: unknown[] };
    };
    pasteEvent.clipboardData = {
      files: [makeImageFile()],
      items: [],
    };
    window.dispatchEvent(pasteEvent);

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });
  });

  it("ignores a paste with no image content", async () => {
    const { container } = render(<Screenshot />);

    const pasteEvent = new Event("paste") as Event & {
      clipboardData: { files: File[]; items: unknown[] };
    };
    pasteEvent.clipboardData = { files: [], items: [] };
    window.dispatchEvent(pasteEvent);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector("img")).toBeNull();
    expect(mockDownscale).not.toHaveBeenCalled();
  });

  it("shows a clear error when the image cannot be decoded", async () => {
    mockDownscale.mockRejectedValue(new Error("Unsupported or corrupted image file"));
    const { container } = render(<Screenshot />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [makeImageFile("photo.heic", "image/heic")] } });

    await waitFor(() => {
      expect(container.textContent).toMatch(/unsupported image format/i);
    });
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Screenshot tab — import request", () => {
  it("sends the downscaled image and its dimensions (no re-measuring)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "nope" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<Screenshot />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());

    const importBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Import"),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.imageBase64).toBe(DOWNSCALED.dataUrl);
    expect(body.imageWidth).toBe(DOWNSCALED.width);
    expect(body.imageHeight).toBe(DOWNSCALED.height);

    vi.unstubAllGlobals();
  });
});
