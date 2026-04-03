/**
 * Puppeteer Viewport Orchestration Adapter
 *
 * Bridges shared-extraction's captureViewportMetrics (CDP-based)
 * with Puppeteer's page object. Replaces the legacy inline approach
 * (page.setViewport + setTimeout + clientWidth) with deterministic
 * CDP orchestration.
 */

import type { Page } from "puppeteer";
import { createCDPClient } from "./client.js";
import {
  captureViewportMetrics,
  cleanupViewportCapture,
} from "@w2w/shared";
import type {
  StabilizationClient,
  StabilizationConfig,
  ViewportMetadata,
} from "@w2w/shared";

export interface ViewportOrchestrationOptions {
  /** Hook for auto-scrolling after stabilization */
  autoScrollFn?: (client: StabilizationClient) => Promise<void>;
  /** Custom navigation (page.goto/setContent). Defaults to Page.reload. */
  navigationFn?: (client: StabilizationClient) => Promise<void>;
  /** Timeout overrides */
  stabilizationOverrides?: Partial<StabilizationConfig>;
}

export interface ViewportOrchestrationResult {
  viewportMetadata: ViewportMetadata;
  scrollbarWidth: number;
  compensated: boolean;
  cleanup: () => Promise<void>;
}

/**
 * Orchestrate viewport setup for a Puppeteer page using CDP.
 *
 * Replaces the legacy flow:
 *   page.setViewport() -> setTimeout(1000) -> clientWidth -> page.setViewport(compensated) -> setTimeout(300)
 *
 * With the deterministic CDP flow:
 *   Emulation.setDeviceMetricsOverride -> prepareStabilization -> navigate ->
 *   [autoScrollFn hook] -> Page.getLayoutMetrics -> scrollbar compensation -> final metrics
 *
 * Returns a cleanup function that must be called after extraction is complete.
 */
export async function orchestratePuppeteerViewport(
  page: Page,
  viewportWidth: number,
  options: ViewportOrchestrationOptions = {}
): Promise<ViewportOrchestrationResult> {
  const { autoScrollFn, stabilizationOverrides, navigationFn } = options;

  const client = await createCDPClient(page, {
    domains: ["DOM", "CSS", "DOMSnapshot", "Runtime", "Page"],
  });

  try {
    const result = await captureViewportMetrics(client, viewportWidth, 1, {
      stabilizationOverrides,
      onAfterStabilization: autoScrollFn
        ? async (c) => await autoScrollFn(c as StabilizationClient)
        : undefined,
      navigationFn: navigationFn || undefined,
    });

    return {
      ...result,
      cleanup: async () => await cleanupViewportCapture(client),
    };
  } catch (error) {
    // Cleanup on failure
    await cleanupViewportCapture(client);
    throw error;
  }
}
