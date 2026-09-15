const PLAN_MODAL_EVENT = "w2w:plan-modal";

/**
 * Ask App to open the Plan modal. Mirrors shared/importTabEvents.ts — the
 * modal state lives in App, and a window-level event lets a deep tab
 * component request it without prop drilling.
 */
export function requestPlanModal(): void {
  window.dispatchEvent(new CustomEvent(PLAN_MODAL_EVENT));
}

/**
 * Subscribe to Plan modal requests. Returns an unsubscribe function.
 */
export function onPlanModalRequest(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(PLAN_MODAL_EVENT, listener);
  return () => window.removeEventListener(PLAN_MODAL_EVENT, listener);
}
