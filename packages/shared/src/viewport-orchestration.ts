/**
 * Viewport Orchestration (Layer #1)
 *
 * Deterministic viewport setup, stabilization, and metadata for CDP capture.
 *
 * Fixes applied:
 * - Event listeners registered BEFORE Page.reload (prepareStabilization pattern)
 * - Page.setLifecycleEventsEnabled enabled at setup, not after load
 * - Timeout path cleans up all listeners
 * - viewportMetadata captured AFTER scrollbar compensation (final state)
 * - Explicit re-stabilization after compensation (not fixed 300ms)
 * - Scrollbar-hide style cleanup in cleanupViewportCapture
 */

// ============================================================================
// TYPES
// ============================================================================

/** Viewport emulation config for Emulation.setDeviceMetricsOverride */
export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  screenWidth: number;
  screenHeight: number;
}

/** Full viewport metadata from Page.getLayoutMetrics */
export interface ViewportMetadata {
  /** Full scrollable content width */
  contentWidth: number;
  /** Full scrollable content height */
  contentHeight: number;
  /** CSS layout viewport (affected by scrollbars) */
  layoutViewport: {
    clientWidth: number;
    clientHeight: number;
  };
  /** Visual viewport (pinch-zoom aware) */
  visualViewport: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  };
}

/** Stabilization timeouts config */
export interface StabilizationConfig {
  /** Max wait for Page load event (ms) */
  loadEventTimeout: number;
  /** Max wait for network idle (ms) */
  networkIdleTimeout: number;
  /** Max wait for fonts to load (ms) */
  fontLoadTimeout: number;
}

/** CDP client interface for stabilization (send + event listening) */
export interface StabilizationClient {
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T>;
  on(event: string, callback: (params?: unknown) => void): () => void;
}

/** Page.getLayoutMetrics result shape */
interface LayoutMetricsResult {
  contentSize: { width: number; height: number };
  layoutViewport: { clientWidth: number; clientHeight: number };
  visualViewport: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_HEIGHT = 900;
const MOBILE_BREAKPOINT = 768;
const MAX_SCROLLBAR_WIDTH = 30;
const LAYOUT_SETTLE_TIMEOUT = 1000;
const SCROLLBAR_SETTLE_TIMEOUT = 500;

const DEFAULT_STABILIZATION: StabilizationConfig = {
  loadEventTimeout: 5000,
  networkIdleTimeout: 3000,
  fontLoadTimeout: 2000,
};

const SCROLLBAR_HIDE_CSS = `(() => {
  const existing = document.getElementById('__w2w_hide_scrollbar');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = '__w2w_hide_scrollbar';
  style.textContent = 'html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }';
  document.head.appendChild(style);
})()`;

const SCROLLBAR_REMOVE_CSS =
  "document.getElementById('__w2w_hide_scrollbar')?.remove()";

const LAYOUT_SETTLE_EXPRESSION =
  "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))";

const FONTS_READY_EXPRESSION =
  "document.fonts.ready.then(() => true)";

// ============================================================================
// VIEWPORT CONFIG
// ============================================================================

/**
 * Create viewport emulation config for CDP Emulation.setDeviceMetricsOverride.
 * Sets mobile=true for viewports <= 768px.
 *
 * @param browserDpr - Browser's devicePixelRatio. When provided, deviceScaleFactor
 *   is set to `1 / browserDpr` to counter-scale the browser zoom and capture at 1x.
 *   Defaults to 1 (no scaling) for Puppeteer/headless where DPR is already controlled.
 */
export function createViewportConfig(width: number, browserDpr = 1): ViewportConfig {
  return {
    width,
    height: DEFAULT_HEIGHT,
    deviceScaleFactor: 1 / browserDpr,
    mobile: width <= MOBILE_BREAKPOINT,
    screenWidth: width,
    screenHeight: DEFAULT_HEIGHT,
  };
}

/**
 * Calculate scrollbar width from viewport vs actual layout width.
 * Returns 0 if no scrollbar or difference is unreasonable (> 30px).
 */
export function calculateScrollbarWidth(
  targetViewport: number,
  actualLayoutWidth: number
): number {
  const diff = targetViewport - actualLayoutWidth;

  if (diff <= 0 || diff > MAX_SCROLLBAR_WIDTH) {
    return 0;
  }

  return diff;
}

/**
 * Get stabilization config with defaults and optional overrides.
 */
export function getStabilizationConfig(
  overrides?: Partial<StabilizationConfig>
): StabilizationConfig {
  return {
    ...DEFAULT_STABILIZATION,
    ...overrides,
  };
}

// ============================================================================
// STABILIZATION
// ============================================================================

/**
 * Race a promise against a timeout.
 * On timeout, resolve (never reject) — stabilization is best-effort.
 * Cleans up timer when promise wins.
 */
function raceWithTimeout(
  promise: Promise<unknown>,
  timeoutMs: number,
  label: string
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        // Stabilization timeout means the page never fired the expected
        // events — this matters operationally (capture may be incomplete),
        // so surface it as a warn so it survives prod log gating.
        console.warn(`[W2W] Stabilization timeout: ${label} (${timeoutMs}ms)`);
        resolve();
      }
    }, timeoutMs);

    promise
      .then(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      })
      .catch(() => {
        // If promise rejects, treat as timeout (best-effort)
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      });
  });
}

/**
 * Prepare page stabilization — registers ALL listeners BEFORE returning.
 *
 * Usage pattern (listeners registered before reload):
 *   const { promise, cleanup } = prepareStabilization(client, config);
 *   await client.send("Page.reload", { ignoreCache: false });
 *   await promise;
 *
 * Fixes vs old waitForPageStable:
 * - Listeners registered synchronously (catches fast-loading cached pages)
 * - Page.setLifecycleEventsEnabled enabled immediately (not after Phase 1)
 * - All listeners cleaned up on timeout (no leaks)
 * - Returned cleanup() for manual listener removal
 */
export function prepareStabilization(
  client: StabilizationClient,
  config: StabilizationConfig
): { promise: Promise<void>; cleanup: () => void } {
  const cleanups: Array<() => void> = [];

  // Register listeners SYNCHRONOUSLY (before any reload)
  const loadPromise = new Promise<void>((resolve) => {
    const cleanup = client.on("Page.loadEventFired", () => {
      cleanup();
      resolve();
    });
    cleanups.push(cleanup);
  });

  const networkIdlePromise = new Promise<void>((resolve) => {
    const cleanup = client.on("Page.lifecycleEvent", (params) => {
      const p = params as { name?: string } | undefined;
      if (p?.name === "networkIdle") {
        cleanup();
        resolve();
      }
    });
    cleanups.push(cleanup);
  });

  // Enable lifecycle events immediately (not after Phase 1)
  const enableLifecyclePromise = client.send(
    "Page.setLifecycleEventsEnabled",
    { enabled: true }
  );

  const promise = (async () => {
    try {
      await enableLifecyclePromise;

      // Phase 1: Page load event
      await raceWithTimeout(
        loadPromise,
        config.loadEventTimeout,
        "Page.loadEventFired"
      );

      // Phase 2: Network idle
      await raceWithTimeout(
        networkIdlePromise,
        config.networkIdleTimeout,
        "networkIdle"
      );

      // Phase 3: Font loading
      await raceWithTimeout(
        client.send("Runtime.evaluate", {
          expression: FONTS_READY_EXPRESSION,
          awaitPromise: true,
          returnByValue: true,
        }),
        config.fontLoadTimeout,
        "fonts.ready"
      );
    } finally {
      // Always clean up remaining listeners
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    }
  })();

  const cleanup = () => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };

  return { promise, cleanup };
}

// ============================================================================
// VIEWPORT CAPTURE ORCHESTRATION
// ============================================================================

/** Options for captureViewportMetrics */
export interface CaptureViewportOptions {
  /** Stabilization timeout overrides */
  stabilizationOverrides?: Partial<StabilizationConfig>;
  /**
   * Hook called after page stabilization and before layout metrics capture.
   * Use this to inject auto-scroll or other page mutations that must happen
   * after the page is stable but before dimensions are measured.
   */
  onAfterStabilization?: (client: StabilizationClient) => Promise<void>;
  /**
   * Custom navigation function. Replaces the default Page.reload.
   * Use this for initial page load (page.goto) or HTML content (page.setContent).
   * The function is called AFTER stabilization listeners are registered,
   * so lifecycle events (loadEventFired, networkIdle) will be captured.
   */
  navigationFn?: (client: StabilizationClient) => Promise<void>;
  /**
   * Skip navigation (reload) entirely — only resize viewport and wait for
   * layout settle + fonts. Use this for subsequent viewports in multi-viewport
   * capture to preserve live browser state (auth, SPA routing, form data).
   *
   * When true: setDeviceMetricsOverride → layout settle → fonts ready → metrics.
   * When false (default): setDeviceMetricsOverride → reload → stabilize → metrics.
   */
  skipNavigation?: boolean;
}

/**
 * Capture viewport metrics with scrollbar compensation.
 *
 * Full flow:
 * 1. Set viewport (Emulation.setDeviceMetricsOverride)
 * 2. Reload + stabilize (listeners registered before reload)
 * 3. [Hook] onAfterStabilization (e.g., auto-scroll for lazy content)
 * 4. Get initial layout metrics (for scrollbar detection)
 * 5. Compensate scrollbar if needed + re-stabilize (layout settle + fonts)
 * 6. Inject scrollbar-hide CSS + wait for settle
 * 7. Re-fetch FINAL layout metrics (post-adjustment state)
 *
 * ViewportMetadata always reflects the FINAL post-adjustment state.
 */
export async function captureViewportMetrics(
  client: StabilizationClient,
  targetViewport: number,
  browserDpr: number,
  options?: CaptureViewportOptions
): Promise<{
  viewportMetadata: ViewportMetadata;
  scrollbarWidth: number;
  compensated: boolean;
}> {
  const config = getStabilizationConfig(options?.stabilizationOverrides);

  // 1. Set viewport emulation
  const vpConfig = createViewportConfig(targetViewport, browserDpr);
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...vpConfig,
    positionX: 0,
    positionY: 0,
    screenOrientation: { angle: 0, type: "landscapePrimary" },
  });

  if (options?.skipNavigation) {
    // --- No-reload path (Layer #5: Live Browser State) ---
    // Skip Page.reload entirely. CSS media queries re-evaluate after
    // Emulation.setDeviceMetricsOverride without reload. Wait only for
    // layout settle (double rAF) and fonts ready.
    await raceWithTimeout(
      client.send("Runtime.evaluate", {
        expression: LAYOUT_SETTLE_EXPRESSION,
        awaitPromise: true,
      }),
      LAYOUT_SETTLE_TIMEOUT,
      "layout-settle-no-reload"
    );
    await raceWithTimeout(
      client.send("Runtime.evaluate", {
        expression: FONTS_READY_EXPRESSION,
        awaitPromise: true,
        returnByValue: true,
      }),
      config.fontLoadTimeout,
      "fonts.ready-no-reload"
    );

    // Hook: onAfterStabilization (e.g., auto-scroll for lazy content)
    if (options.onAfterStabilization) {
      await options.onAfterStabilization(client);
    }
  } else {
    // --- Standard reload path ---
    // 2. Prepare stabilization (register listeners BEFORE reload)
    const { promise: stablePromise } = prepareStabilization(client, config);

    // 3. Navigate (custom navigationFn or default Page.reload)
    if (options?.navigationFn) {
      await options.navigationFn(client);
    } else {
      await client.send("Page.reload", { ignoreCache: false });
    }

    // 4. Wait for stabilization
    await stablePromise;

    // 4.5. Hook: onAfterStabilization (e.g., auto-scroll for lazy content)
    if (options?.onAfterStabilization) {
      await options.onAfterStabilization(client);
    }
  }

  // 5. Get initial layout metrics (for scrollbar detection)
  const initialMetrics = await client.send<LayoutMetricsResult>(
    "Page.getLayoutMetrics",
    {}
  );

  // 6. Scrollbar compensation
  const scrollbarWidth = calculateScrollbarWidth(
    targetViewport,
    initialMetrics.layoutViewport.clientWidth
  );

  let compensated = false;
  if (scrollbarWidth > 0) {
    compensated = true;
    const compensatedConfig = createViewportConfig(
      targetViewport + scrollbarWidth,
      browserDpr
    );
    await client.send("Emulation.setDeviceMetricsOverride", {
      ...compensatedConfig,
      positionX: 0,
      positionY: 0,
      screenOrientation: { angle: 0, type: "landscapePrimary" },
    });

    // Re-stabilize after compensation (layout settle + fonts — NOT fixed 300ms)
    await raceWithTimeout(
      client.send("Runtime.evaluate", {
        expression: LAYOUT_SETTLE_EXPRESSION,
        awaitPromise: true,
      }),
      LAYOUT_SETTLE_TIMEOUT,
      "layout-settle"
    );
    await raceWithTimeout(
      client.send("Runtime.evaluate", {
        expression: FONTS_READY_EXPRESSION,
        awaitPromise: true,
        returnByValue: true,
      }),
      config.fontLoadTimeout,
      "fonts.ready-post-compensation"
    );
  }

  // 7. Inject scrollbar-hide CSS
  await client.send("Runtime.evaluate", {
    expression: SCROLLBAR_HIDE_CSS,
    awaitPromise: false,
  });

  // Wait for scrollbar-hide to take effect
  await raceWithTimeout(
    client.send("Runtime.evaluate", {
      expression: LAYOUT_SETTLE_EXPRESSION,
      awaitPromise: true,
    }),
    SCROLLBAR_SETTLE_TIMEOUT,
    "scrollbar-hide-settle"
  );

  // 8. Re-fetch FINAL layout metrics (after ALL adjustments)
  const finalMetrics = await client.send<LayoutMetricsResult>(
    "Page.getLayoutMetrics",
    {}
  );

  const viewportMetadata: ViewportMetadata = {
    contentWidth: finalMetrics.contentSize.width,
    contentHeight: finalMetrics.contentSize.height,
    layoutViewport: {
      clientWidth: finalMetrics.layoutViewport.clientWidth,
      clientHeight: finalMetrics.layoutViewport.clientHeight,
    },
    visualViewport: {
      width: finalMetrics.visualViewport.width,
      height: finalMetrics.visualViewport.height,
      offsetX: finalMetrics.visualViewport.offsetX,
      offsetY: finalMetrics.visualViewport.offsetY,
      scale: finalMetrics.visualViewport.scale,
    },
  };

  return { viewportMetadata, scrollbarWidth, compensated };
}

/**
 * Clean up viewport capture artifacts.
 * Removes scrollbar-hide style and clears device metrics override.
 * Safe to call even if client is detached — errors are silently caught.
 */
export async function cleanupViewportCapture(
  client: StabilizationClient
): Promise<void> {
  try {
    await client.send("Runtime.evaluate", {
      expression: SCROLLBAR_REMOVE_CSS,
      awaitPromise: false,
    });
  } catch {
    // Ignore — page may have navigated or client detached
  }

  try {
    await client.send("Emulation.clearDeviceMetricsOverride", {});
  } catch {
    // Ignore — client may already be detached
  }
}
