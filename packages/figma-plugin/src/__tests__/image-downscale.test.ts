import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downscaleImage, MAX_IMAGE_DIMENSION } from "../ui/shared/imageDownscale";

// ============================================================================
// Mocks — happy-dom has no real image decoding or canvas rasterization, so
// Image and <canvas> are stubbed.
// ============================================================================

/** dataUrl → [naturalWidth, naturalHeight]; absent = decode error */
const imageRegistry = new Map<string, [number, number]>();

class MockImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    queueMicrotask(() => {
      const dims = imageRegistry.get(value);
      if (!dims) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = dims[0];
      this.naturalHeight = dims[1];
      this.onload?.();
    });
  }
}

const fakeCtx = {
  fillStyle: "",
  fillRect: vi.fn(),
  drawImage: vi.fn(),
};
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => fakeCtx),
  toDataURL: vi.fn(() => "data:image/jpeg;base64,SCALED"),
};

const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  imageRegistry.clear();
  fakeCtx.fillRect.mockClear();
  fakeCtx.drawImage.mockClear();
  fakeCanvas.getContext.mockClear();
  fakeCanvas.toDataURL.mockClear();
  fakeCanvas.getContext.mockImplementation(() => fakeCtx);
  vi.stubGlobal("Image", MockImage);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas"
      ? (fakeCanvas as unknown as HTMLElement)
      : realCreateElement(tag),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe("downscaleImage", () => {
  it("returns the original data URL when the image is within the limit", async () => {
    imageRegistry.set("data:image/png;base64,SMALL", [800, 600]);

    const result = await downscaleImage("data:image/png;base64,SMALL");
    expect(result).toEqual({ dataUrl: "data:image/png;base64,SMALL", width: 800, height: 600 });
    expect(fakeCanvas.toDataURL).not.toHaveBeenCalled();
  });

  it("downscales a wide image so the longest side equals MAX_IMAGE_DIMENSION", async () => {
    imageRegistry.set("data:image/png;base64,BIG", [3000, 1500]);

    const result = await downscaleImage("data:image/png;base64,BIG");
    expect(result.width).toBe(MAX_IMAGE_DIMENSION);
    expect(result.height).toBe(Math.round(1500 * (MAX_IMAGE_DIMENSION / 3000)));
    expect(result.dataUrl).toBe("data:image/jpeg;base64,SCALED");
    expect(fakeCanvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.9);
  });

  it("downscales a tall image by its height", async () => {
    imageRegistry.set("data:image/png;base64,TALL", [1000, 4000]);

    const result = await downscaleImage("data:image/png;base64,TALL");
    expect(result.height).toBe(MAX_IMAGE_DIMENSION);
    expect(result.width).toBe(Math.round(1000 * (MAX_IMAGE_DIMENSION / 4000)));
  });

  it("paints a white background before drawing (JPEG has no alpha)", async () => {
    imageRegistry.set("data:image/png;base64,BIG", [3000, 1500]);

    await downscaleImage("data:image/png;base64,BIG");
    expect(fakeCtx.fillRect).toHaveBeenCalled();
    expect(fakeCtx.drawImage).toHaveBeenCalled();
  });

  it("rejects on undecodable input (HEIC/corrupted file)", async () => {
    await expect(downscaleImage("data:image/heic;base64,NOPE")).rejects.toThrow(
      /unsupported|corrupted/i,
    );
  });

  it("falls back to the original when canvas 2d context is unavailable", async () => {
    imageRegistry.set("data:image/png;base64,BIG", [3000, 1500]);
    fakeCanvas.getContext.mockImplementation(() => null as unknown as typeof fakeCtx);

    const result = await downscaleImage("data:image/png;base64,BIG");
    expect(result).toEqual({ dataUrl: "data:image/png;base64,BIG", width: 3000, height: 1500 });
  });
});
