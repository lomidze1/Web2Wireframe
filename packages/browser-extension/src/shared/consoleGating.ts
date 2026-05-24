/**
 * Silence non-essential console output in production extension builds.
 *
 * Vite replaces `import.meta.env.PROD` at build time, so this entire
 * branch is dead code in dev and a constant `true` in production builds.
 * `console.warn` / `console.error` remain live for operational visibility.
 *
 * Call once from each isolated JS context: background service worker,
 * content script entry, popup, and options page.
 */
export function gateConsoleInProduction(): void {
  if (import.meta.env.PROD) {
    const noop = (): void => undefined;
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.trace = noop;
  }
}
