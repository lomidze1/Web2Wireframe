const IMPORT_TAB_EVENT = "w2w:import-tab";

export type ImportTab = "web" | "screenshot" | "html" | "area";

/**
 * Ask App to switch the active import tab. Mirrors shared/quotaEvents.ts —
 * the tab state lives in App, and a window-level event lets a deep tab
 * component request a switch without prop drilling.
 */
export function requestImportTab(tab: ImportTab): void {
  window.dispatchEvent(new CustomEvent(IMPORT_TAB_EVENT, { detail: tab }));
}

/**
 * Subscribe to import-tab requests. Returns an unsubscribe function.
 */
export function onImportTabRequest(handler: (tab: ImportTab) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ImportTab>).detail);
  window.addEventListener(IMPORT_TAB_EVENT, listener);
  return () => window.removeEventListener(IMPORT_TAB_EVENT, listener);
}
