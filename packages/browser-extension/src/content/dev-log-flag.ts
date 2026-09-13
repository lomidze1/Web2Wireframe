/**
 * Dev-log build flag — see `src/shared/devLog.ts` for the bridge it gates.
 *
 * Lives in `src/content`, not next to the bridge, because the API image ships
 * only this folder and bundles `extractor.ts` from it: an import that climbs out
 * breaks the image build (import-boundary.test.ts). Outside the extension's
 * vite builds `__W2W_DEV_LOG__` is simply undefined, so the flag reads false.
 */

declare const __W2W_DEV_LOG__: boolean | undefined;

export const DEV_LOG_ENABLED: boolean =
  typeof __W2W_DEV_LOG__ !== "undefined" && __W2W_DEV_LOG__ === true;
