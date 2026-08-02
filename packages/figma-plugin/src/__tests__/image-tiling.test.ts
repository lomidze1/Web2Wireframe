import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  planTiles,
  chooseSeams,
  sliceTiles,
  TARGET_TILE_AREA,
  MAX_TILE_EDGE,
  MAX_TILES,
  MIN_TILE_HEIGHT,
  TILE_OVERLAP_RATIO,
} from "../ui/shared/imageTiling";

describe("planTiles — trigger", () => {
  it("returns null for images the legacy path handles well", () => {
    // Height under 1.25 × 1568 — legacy downscale keeps ≥80% of the pixels.
    expect(planTiles(1425, 900)).toBeNull();
    expect(planTiles(1425, 1568)).toBeNull();
    expect(planTiles(1425, 1900)).toBeNull();
  });

  it("activates for tall pages", () => {
    expect(planTiles(1425, 4178)).not.toBeNull();
  });
});

describe("planTiles — geometry", () => {
  it("keeps full resolution for a desktop-width page (no scaling)", () => {
    const plan = planTiles(1425, 4178)!;
    expect(plan.scale).toBe(1);
    expect(plan.width).toBe(1425);
    expect(plan.height).toBe(4178);
  });

  it("targets the full-resolution ceiling per tile", () => {
    const plan = planTiles(1425, 4178)!;
    for (const tile of plan.tiles) {
      // Every tile fits the vision API's full-res budget…
      expect(plan.width * tile.height).toBeLessThanOrEqual(TARGET_TILE_AREA * 1.1);
      expect(tile.height).toBeLessThanOrEqual(MAX_TILE_EDGE);
      // …and no tile is uselessly thin.
      expect(tile.height).toBeGreaterThanOrEqual(MIN_TILE_HEIGHT * 0.5);
    }
  });

  it("caps the width at 1568 for ultra-wide screenshots", () => {
    const plan = planTiles(3000, 9000)!;
    expect(plan.width).toBeLessThanOrEqual(MAX_TILE_EDGE);
    expect(plan.scale).toBeLessThan(1);
  });

  it("gives a narrow mobile screenshot taller tiles", () => {
    const plan = planTiles(800, 3000)!;
    // 1.15MP / 800 ≈ 1437 — the tile budget stretches vertically.
    const tallest = Math.max(...plan.tiles.map((t) => t.height));
    expect(tallest).toBeGreaterThan(1200);
  });

  it("never exceeds MAX_TILES, scaling down instead", () => {
    const plan = planTiles(1440, 20000)!;
    expect(plan.tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(plan.scale).toBeLessThan(1);
    // Even scaled, this beats the legacy 1568-longest-side factor by far.
    expect(plan.width).toBeGreaterThan((1568 / 20000) * 1440 * 2);
  });

  it("covers the full height with no gaps and with overlaps between neighbours", () => {
    const plan = planTiles(1425, 4178)!;
    const tiles = plan.tiles;

    expect(tiles[0].offsetY).toBe(0);
    expect(tiles[tiles.length - 1].offsetY + tiles[tiles.length - 1].height)
      .toBeGreaterThanOrEqual(plan.height);

    for (let i = 1; i < tiles.length; i++) {
      const prevBottom = tiles[i - 1].offsetY + tiles[i - 1].height;
      // Ascending, no gap, and a real overlap for the ownership rule.
      expect(tiles[i].offsetY).toBeGreaterThan(tiles[i - 1].offsetY);
      expect(tiles[i].offsetY).toBeLessThan(prevBottom);
      expect(prevBottom - tiles[i].offsetY).toBeGreaterThanOrEqual(
        Math.floor(tiles[i - 1].height * TILE_OVERLAP_RATIO * 0.5),
      );
    }
  });
});

describe("chooseSeams", () => {
  it("snaps each cut to the quietest row near its target", () => {
    // Noisy page with two silent bands at 480–500 and 1010–1030.
    const activity = new Float32Array(1500).fill(50);
    for (let y = 480; y < 500; y++) activity[y] = 0;
    for (let y = 1010; y < 1030; y++) activity[y] = 0;

    const seams = chooseSeams(activity, [520, 990], 120);

    expect(seams[0]).toBeGreaterThanOrEqual(480);
    expect(seams[0]).toBeLessThan(500);
    expect(seams[1]).toBeGreaterThanOrEqual(1010);
    expect(seams[1]).toBeLessThan(1030);
  });

  it("stays within the search window even when quieter rows exist beyond it", () => {
    const activity = new Float32Array(1500).fill(50);
    activity[100] = 0; // very quiet, but far from the target

    const seams = chooseSeams(activity, [700], 150);

    expect(seams[0]).toBeGreaterThanOrEqual(550);
    expect(seams[0]).toBeLessThanOrEqual(850);
  });

  it("keeps seams strictly ascending", () => {
    const activity = new Float32Array(2000).fill(10);
    const seams = chooseSeams(activity, [600, 620], 300);
    expect(seams[1]).toBeGreaterThan(seams[0]);
  });
});

describe("sliceTiles", () => {
  let drawCalls: number[][];

  beforeEach(() => {
    drawCalls = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          drawImage: (
            _img: unknown,
            sx: number,
            sy: number,
            sw: number,
            sh: number,
          ) => {
            drawCalls.push([sx, sy, sw, sh]);
          },
          fillRect: () => {},
          set fillStyle(_v: string) {},
        }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      () => "data:image/jpeg;base64,TILE",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cuts each tile from the source at inverse scale", () => {
    const plan = {
      scale: 0.5,
      width: 700,
      height: 2000,
      cuts: [900],
      tiles: [
        { offsetY: 0, height: 1000 },
        { offsetY: 900, height: 1100 },
      ],
    };
    const img = { naturalWidth: 1400, naturalHeight: 4000 } as HTMLImageElement;

    const tiles = sliceTiles(img, plan);

    expect(tiles).toHaveLength(2);
    // Source rects are in the ORIGINAL bitmap's space (÷ scale).
    expect(drawCalls[0]).toEqual([0, 0, 1400, 2000]);
    expect(drawCalls[1]).toEqual([0, 1800, 1400, 2200]);
    // Output geometry is in tiled space.
    expect(tiles[0]).toMatchObject({ offsetY: 0, width: 700, height: 1000 });
    expect(tiles[1]).toMatchObject({ offsetY: 900, width: 700, height: 1100 });
    expect(tiles[0].imageBase64).toContain("data:image/jpeg");
  });
});
