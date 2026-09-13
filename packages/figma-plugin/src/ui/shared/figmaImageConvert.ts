/**
 * Helpers for the UI-side image conversion (App.tsx `convert-assets`).
 */

/**
 * Whether a source can carry transparency, i.e. whether the per-pixel scan
 * that picks PNG over JPEG is worth running. A JPEG has no alpha channel, and
 * scanning a 6016×1384 photo is ~8M pixel reads for nothing.
 */
export function mayHaveAlpha(dataUri: string): boolean {
  return !/^data:image\/jpe?g[;,]/i.test(dataUri);
}
