/**
 * Stage timing for the server-side capture pipeline.
 *
 * Why: the plugin measures `/api/import-url` end-to-end (43.9s on stripe.com),
 * but the server never said where that time goes. The existing `[W2W]` logs
 * account for ~19s of it (two network settles + the hover budget); the rest —
 * browser launch, navigation, auto-scroll, DOM extraction, ~760 sequential
 * CDP font lookups, asset harvesting, serialization — was invisible.
 *
 * Output is one `[W2W-PERF] <stage> <ms>` line per stage, matching the
 * existing `[W2W] …` log style. It rides `console.log`, which
 * `gateConsoleInProduction()` already silences on Render unless DEBUG=1 —
 * so this is free in production and readable in local Docker.
 *
 * Usage — chain the returned timestamp so each call measures one span:
 *
 *   let t = Date.now();
 *   t = perfMark("launch", t);
 *   t = perfMark("goto", t);
 */
export function perfMark(stage: string, since: number): number {
  const now = Date.now();
  console.log(`[W2W-PERF] ${stage} ${now - since}ms`);
  return now;
}
