/**
 * Ambient type declaration for `wawoff2` (pure-JS WOFF2 codec).
 *
 * The package ships without `.d.ts` files; we only use the two top-level
 * functions and they work uniformly with Node `Buffer` (which extends
 * `Uint8Array`).
 */
declare module "wawoff2" {
  /** Decompress a WOFF2 buffer into the underlying SFNT (TTF/OTF) bytes. */
  export function decompress(input: Uint8Array | Buffer): Promise<Uint8Array>;
  /** Encode an SFNT buffer back into WOFF2. Not currently used. */
  export function compress(input: Uint8Array | Buffer): Promise<Uint8Array>;
  const _default: {
    decompress: typeof decompress;
    compress: typeof compress;
  };
  export default _default;
}
