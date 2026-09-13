/**
 * The UI conversion only scans pixels for alpha when the source can carry it.
 *
 * The scan (`getImageData` over every pixel) is what decides PNG vs JPEG, and on
 * a 6016×1384 photo it is ~8M pixel reads per image. A JPEG has no alpha
 * channel, so it can go straight back to JPEG — which also keeps an oversized
 * multi-viewport import inside the 30s conversion window.
 */
import { describe, expect, it } from "vitest";
import { mayHaveAlpha } from "../ui/shared/figmaImageConvert";

describe("mayHaveAlpha", () => {
  it("is false for JPEG sources", () => {
    expect(mayHaveAlpha("data:image/jpeg;base64,/9j/4AAQ")).toBe(false);
    expect(mayHaveAlpha("data:image/jpg;base64,/9j/4AAQ")).toBe(false);
  });

  it("is true for formats that can carry transparency", () => {
    expect(mayHaveAlpha("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(mayHaveAlpha("data:image/webp;base64,UklGRgAAAABXRUJQ")).toBe(true);
    expect(mayHaveAlpha("data:image/avif;base64,AAAAHGZ0eXBhdmlm")).toBe(true);
    expect(mayHaveAlpha("data:image/gif;base64,R0lGODlh")).toBe(true);
  });
});
