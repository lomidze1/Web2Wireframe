/**
 * Raster images whose CSS color filter has to be baked into their pixels.
 *
 * `rendering/cssFilter.ts` recolours vector, text and solid paints at render
 * time, but a raster IMAGE paint can't be recoloured in the sandbox (no canvas)
 * — notion.com's white customer logos (`brightness(0) invert(1)` on black PNGs)
 * stayed black. Filtered images ride the UI-iframe conversion that already
 * handles WebP/AVIF and oversized images (main.ts → ui/App.tsx): each one gets a
 * filtered key, the conversion stores the recoloured pixels under it, and
 * anything that fails rolls back to the original image.
 *
 * Grayscale/saturate-only chains stay on Figma's editable saturation
 * adjustment (cssFilter.ts), so they are not planned here.
 * Pure module: imported by the sandbox.
 */

import { parseColorFilter } from "../rendering/cssFilter";
import type { WireframeFrame, WireframeNode } from "../types";

export interface FilteredImageJob {
  /** Asset key the renderer will look up — original url + filter chain. */
  key: string;
  dataUri: string;
  /** CSS filter chain, innermost element first. */
  filter: string;
  frameIdxs: number[];
}

interface Rewrite {
  restore: () => void;
  key: string;
}

export interface FilteredImagePlan {
  jobs: FilteredImageJob[];
  rewrites: Rewrite[];
  /** Nodes carrying a filter → the keys planned under them. */
  owners: Map<WireframeNode, Set<string>>;
}

const KEY_MARKER = "#w2w-filter=";

function needsPixelBake(filter: string): boolean {
  const ops = parseColorFilter(filter).filter((op) => op.name !== "opacity");
  return ops.some((op) => op.name !== "grayscale" && op.name !== "saturate");
}

/**
 * `pending` = images queued for format conversion (WebP/AVIF), which are not in
 * `frame.assets` yet — the filtered job decodes and recolours them in one pass.
 */
export function planFilteredImages(
  frames: WireframeFrame[],
  pending: ReadonlyMap<string, string> = new Map(),
): FilteredImagePlan {
  const plan: FilteredImagePlan = { jobs: [], rewrites: [], owners: new Map() };
  const jobs = new Map<string, FilteredImageJob>();

  frames.forEach((frame, frameIdx) => {
    const consider = (
      url: unknown,
      filter: string,
      chainOwners: WireframeNode[],
      apply: (key: string) => void,
      restore: () => void,
    ): void => {
      if (typeof url !== "string" || !url || url.includes(KEY_MARKER)) return;
      if (!filter || !needsPixelBake(filter)) return;
      const dataUri =
        frame.assets?.[url] ?? pending.get(url) ?? (url.startsWith("data:") ? url : undefined);
      if (!dataUri || dataUri.startsWith("data:image/svg")) return;

      const key = url + KEY_MARKER + filter;
      const existing = jobs.get(key);
      if (existing) {
        if (!existing.frameIdxs.includes(frameIdx)) existing.frameIdxs.push(frameIdx);
      } else {
        const job = { key, dataUri, filter, frameIdxs: [frameIdx] };
        jobs.set(key, job);
        plan.jobs.push(job);
      }
      apply(key);
      plan.rewrites.push({ key, restore });
      for (const owner of chainOwners) {
        const keys = plan.owners.get(owner) ?? new Set<string>();
        keys.add(key);
        plan.owners.set(owner, keys);
      }
    };

    const walk = (node: WireframeNode, inherited: string, inheritedOwners: WireframeNode[]): void => {
      const own = node.cssColorFilter ?? "";
      const filter = [own, inherited].filter(Boolean).join(" ");
      const owners = own ? [node, ...inheritedOwners] : inheritedOwners;

      const originalUrl = node.imageUrl;
      consider(
        originalUrl,
        filter,
        owners,
        (key) => { node.imageUrl = key; },
        () => { node.imageUrl = originalUrl; },
      );
      if (Array.isArray(node.fills)) {
        for (const fill of node.fills as Array<{ type?: string; imageUrl?: string }>) {
          if (fill.type !== "IMAGE_PLACEHOLDER") continue;
          const fillUrl = fill.imageUrl;
          consider(
            fillUrl,
            filter,
            owners,
            (key) => { fill.imageUrl = key; },
            () => { fill.imageUrl = fillUrl; },
          );
        }
      }
      for (const child of node.children ?? []) walk(child, filter, owners);
    };

    if (frame.tree) walk(frame.tree, "", []);
  });

  return plan;
}

/**
 * Roll back the images whose conversion never arrived and mark the filter
 * owners whose images all got baked — the render then neither re-filters nor
 * reports them.
 */
export function finishFilteredImages(plan: FilteredImagePlan, convertedKeys: Set<string>): void {
  for (const rewrite of plan.rewrites) {
    if (!convertedKeys.has(rewrite.key)) rewrite.restore();
  }
  plan.owners.forEach((keys, owner) => {
    if (keys.size > 0 && Array.from(keys).every((key) => convertedKeys.has(key))) {
      owner.imageFilterBaked = true;
    }
  });
}
