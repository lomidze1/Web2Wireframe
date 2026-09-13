import { DEV_LOG_ENABLED } from "./devLog";

/**
 * Silence non-essential console output in production extension builds.
 *
 * Vite replaces `import.meta.env.PROD` at build time, so this entire
 * branch is dead code in dev and a constant `true` in production builds.
 * `console.warn` / `console.error` remain live for operational visibility.
 *
 * Call once from each isolated JS context: background service worker,
 * content script entry, popup, and options page.
 *
 * The dev-log build (`W2W_DEV_LOG=1`, see ./devLog) keeps console.log live.
 */
export function gateConsoleInProduction(): void {
  if (import.meta.env.PROD && !DEV_LOG_ENABLED) {
    const noop = (): void => undefined;
    /* eslint-disable no-console -- the helper's whole purpose is to
     * mutate console.{log,debug,info,trace} into no-ops. */
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.trace = noop;
    /* eslint-enable no-console */
  }
}
