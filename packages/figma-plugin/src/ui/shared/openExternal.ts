/**
 * Open a link in the user's browser via the sandbox's `figma.openExternal`.
 * `window.open` from the plugin iframe is unreliable in Figma — it can return
 * null even when the link did open, which made us show a raw-URL "fallback".
 */
export function openExternal(url: string): void {
  parent.postMessage({ pluginMessage: { type: "open-external", data: { url } } }, "*");
}
