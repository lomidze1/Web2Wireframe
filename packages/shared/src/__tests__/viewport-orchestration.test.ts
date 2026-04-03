/**
 * Viewport Orchestration Tests (Layer #1)
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 * ფუნქციები შეიქმნება viewport-orchestration.ts მოდულში.
 */

import { describe, it, expect } from "vitest";
import {
  createViewportConfig,
  calculateScrollbarWidth,
  getStabilizationConfig,
  prepareStabilization,
  captureViewportMetrics,
  cleanupViewportCapture,
} from "../viewport-orchestration";
import type {
  ViewportMetadata,
  StabilizationClient,
} from "../viewport-orchestration";

// ============================================================================
// #1: createViewportConfig — default 1440px
// ============================================================================

describe("createViewportConfig", () => {
  it("should create default config with 1440px width and 900px height", () => {
    const config = createViewportConfig(1440);

    expect(config.width).toBe(1440);
    expect(config.height).toBe(900);
    expect(config.mobile).toBe(false);
    expect(config.screenWidth).toBe(1440);
    expect(config.screenHeight).toBe(900);
  });

  // ==========================================================================
  // #2: createViewportConfig — mobile 375px
  // ==========================================================================

  it("should set mobile=true for viewports <= 768px", () => {
    const config = createViewportConfig(375);

    expect(config.width).toBe(375);
    expect(config.mobile).toBe(true);
  });

  it("should set mobile=false for viewports > 768px", () => {
    const config = createViewportConfig(1024);

    expect(config.mobile).toBe(false);
  });

  it("should set mobile=true for exactly 768px (tablet breakpoint)", () => {
    const config = createViewportConfig(768);

    expect(config.mobile).toBe(true);
  });

  // ==========================================================================
  // browserDpr counter-scaling
  // ==========================================================================

  it("should default deviceScaleFactor to 1 when browserDpr is not provided", () => {
    const config = createViewportConfig(1440);

    expect(config.deviceScaleFactor).toBe(1);
  });

  it("should set deviceScaleFactor to 0.5 for browserDpr=2 (Retina/200% zoom)", () => {
    const config = createViewportConfig(1440, 2);

    expect(config.deviceScaleFactor).toBe(0.5);
  });

  it("should set deviceScaleFactor to 0.8 for browserDpr=1.25 (125% zoom)", () => {
    const config = createViewportConfig(1440, 1.25);

    expect(config.deviceScaleFactor).toBeCloseTo(0.8);
  });

  it("should set deviceScaleFactor to 1 for browserDpr=1 (no zoom)", () => {
    const config = createViewportConfig(1440, 1);

    expect(config.deviceScaleFactor).toBe(1);
  });

  it("should handle browserDpr=3 (high-density mobile)", () => {
    const config = createViewportConfig(375, 3);

    expect(config.deviceScaleFactor).toBeCloseTo(1 / 3);
    expect(config.mobile).toBe(true);
  });
});

// ============================================================================
// ViewportMetadata — content/layout/visual viewport fields
// ============================================================================

describe("ViewportMetadata", () => {
  it("should contain all required viewport measurement fields", () => {
    const metadata: ViewportMetadata = {
      contentWidth: 1440,
      contentHeight: 5200,
      layoutViewport: {
        clientWidth: 1440,
        clientHeight: 900,
      },
      visualViewport: {
        width: 1440,
        height: 900,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      },
    };

    expect(metadata.contentWidth).toBe(1440);
    expect(metadata.contentHeight).toBe(5200);
    expect(metadata.layoutViewport.clientWidth).toBe(1440);
    expect(metadata.layoutViewport.clientHeight).toBe(900);
    expect(metadata.visualViewport.width).toBe(1440);
    expect(metadata.visualViewport.height).toBe(900);
    expect(metadata.visualViewport.scale).toBe(1);
  });

  it("should reflect scrollbar presence via contentWidth < layoutWidth", () => {
    const metadata: ViewportMetadata = {
      contentWidth: 1423,
      contentHeight: 3000,
      layoutViewport: {
        clientWidth: 1423,
        clientHeight: 900,
      },
      visualViewport: {
        width: 1440,
        height: 900,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      },
    };

    expect(metadata.layoutViewport.clientWidth).toBeLessThan(
      metadata.visualViewport.width
    );
  });
});

// ============================================================================
// calculateScrollbarWidth — scrollbar compensation
// ============================================================================

describe("calculateScrollbarWidth", () => {
  it("should return 0 when no scrollbar present", () => {
    expect(calculateScrollbarWidth(1440, 1440)).toBe(0);
  });

  it("should detect standard 17px scrollbar", () => {
    expect(calculateScrollbarWidth(1440, 1423)).toBe(17);
  });

  it("should detect 15px scrollbar (macOS classic style)", () => {
    expect(calculateScrollbarWidth(1440, 1425)).toBe(15);
  });

  it("should return 0 for negative difference (edge case)", () => {
    expect(calculateScrollbarWidth(1440, 1450)).toBe(0);
  });

  it("should cap at reasonable maximum (e.g., 30px)", () => {
    expect(calculateScrollbarWidth(1440, 1380)).toBe(0);
  });
});

// ============================================================================
// getStabilizationConfig — default timeouts
// ============================================================================

describe("getStabilizationConfig", () => {
  it("should return default stabilization timeouts", () => {
    const config = getStabilizationConfig();

    expect(config.loadEventTimeout).toBeGreaterThan(0);
    expect(config.loadEventTimeout).toBeLessThanOrEqual(10000);
    expect(config.networkIdleTimeout).toBeGreaterThan(0);
    expect(config.networkIdleTimeout).toBeLessThanOrEqual(10000);
    expect(config.fontLoadTimeout).toBeGreaterThan(0);
    expect(config.fontLoadTimeout).toBeLessThanOrEqual(5000);
  });

  it("should allow custom timeout overrides", () => {
    const config = getStabilizationConfig({
      loadEventTimeout: 8000,
      networkIdleTimeout: 5000,
    });

    expect(config.loadEventTimeout).toBe(8000);
    expect(config.networkIdleTimeout).toBe(5000);
    expect(config.fontLoadTimeout).toBeGreaterThan(0);
  });
});

// ============================================================================
// CapturedFrame.viewportMetadata — enriched export contract
// ============================================================================

describe("CapturedFrame viewportMetadata enrichment", () => {
  it("should support viewportMetadata field in CapturedFrame", () => {
    const frame = {
      viewport: { width: 1440, height: 5200 },
      tree: {} as never,
      viewportMetadata: {
        contentWidth: 1440,
        contentHeight: 5200,
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1440,
          height: 900,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      } satisfies ViewportMetadata,
    };

    expect(frame.viewportMetadata).toBeDefined();
    expect(frame.viewportMetadata.contentWidth).toBe(1440);
    expect(frame.viewportMetadata.contentHeight).toBe(5200);
    expect(frame.viewportMetadata.layoutViewport.clientWidth).toBe(1440);
    expect(frame.viewportMetadata.visualViewport.scale).toBe(1);
  });
});

// ============================================================================
// MOCK CDP CLIENT
// ============================================================================

class MockCDPClient implements StabilizationClient {
  private listeners = new Map<string, Set<(params?: unknown) => void>>();
  private _sendLog: Array<{
    method: string;
    params?: Record<string, unknown>;
  }> = [];
  private sendHandlers = new Map<
    string,
    (params?: Record<string, unknown>) => unknown
  >();

  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    this._sendLog.push({ method, params });
    const handler = this.sendHandlers.get(method);
    if (handler) return handler(params) as T;
    return undefined as T;
  }

  on(event: string, callback: (params?: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  // --- Test helpers ---

  emit(event: string, params?: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(params));
  }

  onSend(
    method: string,
    handler: (params?: Record<string, unknown>) => unknown
  ): void {
    this.sendHandlers.set(method, handler);
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  getTotalListenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  getSendLog(): Array<{
    method: string;
    params?: Record<string, unknown>;
  }> {
    return [...this._sendLog];
  }

  getSendMethods(): string[] {
    return this._sendLog.map((e) => e.method);
  }
}

// ============================================================================
// #4: prepareStabilization — success path
// ============================================================================

describe("prepareStabilization", () => {
  it("should resolve when loadEventFired → networkIdle → fonts.ready complete", async () => {
    const client = new MockCDPClient();
    const config = getStabilizationConfig({
      loadEventTimeout: 1000,
      networkIdleTimeout: 1000,
      fontLoadTimeout: 1000,
    });

    // fonts.ready resolves immediately
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));

    const { promise } = prepareStabilization(client, config);

    // Simulate events (after listeners registered, before await)
    client.emit("Page.loadEventFired");
    await Promise.resolve(); // microtask yield
    client.emit("Page.lifecycleEvent", { name: "networkIdle" });

    await promise; // should resolve without hitting timeouts
  });

  // ============================================================================
  // #5: prepareStabilization — no-event timeout path
  // ============================================================================

  it("should resolve (not reject) when no events fire, and clean up all listeners", async () => {
    const client = new MockCDPClient();
    const config = getStabilizationConfig({
      loadEventTimeout: 50,
      networkIdleTimeout: 50,
      fontLoadTimeout: 50,
    });

    // fonts.ready never resolves
    client.onSend("Runtime.evaluate", () => new Promise(() => {}));

    const { promise } = prepareStabilization(client, config);

    // No events emitted — all phases timeout
    await promise; // should resolve, NOT reject

    // All listeners must be cleaned up after completion
    expect(client.getListenerCount("Page.loadEventFired")).toBe(0);
    expect(client.getListenerCount("Page.lifecycleEvent")).toBe(0);
    expect(client.getTotalListenerCount()).toBe(0);
  });

  // ============================================================================
  // #6: prepareStabilization — race test (listeners before reload)
  // ============================================================================

  it("should register listeners synchronously before promise is returned", () => {
    const client = new MockCDPClient();
    const config = getStabilizationConfig();

    const { cleanup } = prepareStabilization(client, config);

    // Listeners exist immediately — BEFORE any reload happens
    expect(client.getListenerCount("Page.loadEventFired")).toBeGreaterThanOrEqual(
      1
    );
    expect(client.getListenerCount("Page.lifecycleEvent")).toBeGreaterThanOrEqual(
      1
    );

    cleanup();
  });

  it("should catch early-fired events that happen before await", async () => {
    const client = new MockCDPClient();
    const config = getStabilizationConfig({
      loadEventTimeout: 2000,
      networkIdleTimeout: 2000,
      fontLoadTimeout: 2000,
    });

    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));

    const { promise } = prepareStabilization(client, config);

    // Events fire IMMEDIATELY (simulates fast-loading cached page)
    client.emit("Page.loadEventFired");
    client.emit("Page.lifecycleEvent", { name: "networkIdle" });

    // Should resolve quickly — NOT wait for 2000ms timeouts
    const start = Date.now();
    await promise;
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("should cleanup listeners via returned cleanup function", () => {
    const client = new MockCDPClient();
    const config = getStabilizationConfig();

    const { cleanup } = prepareStabilization(client, config);

    expect(client.getTotalListenerCount()).toBeGreaterThan(0);

    cleanup();

    expect(client.getListenerCount("Page.loadEventFired")).toBe(0);
    expect(client.getListenerCount("Page.lifecycleEvent")).toBe(0);
  });

  it("should enable Page.setLifecycleEventsEnabled immediately", async () => {
    const client = new MockCDPClient();
    const config = getStabilizationConfig({
      loadEventTimeout: 50,
      networkIdleTimeout: 50,
      fontLoadTimeout: 50,
    });

    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));

    const { promise } = prepareStabilization(client, config);

    // Fire events so it doesn't wait for full timeouts
    client.emit("Page.loadEventFired");
    client.emit("Page.lifecycleEvent", { name: "networkIdle" });

    await promise;

    // setLifecycleEventsEnabled should be called
    const methods = client.getSendMethods();
    expect(methods).toContain("Page.setLifecycleEventsEnabled");
  });
});

// ============================================================================
// HELPER: Setup mock for captureViewportMetrics
// ============================================================================

function setupStandardMock(
  client: MockCDPClient,
  metrics: {
    contentWidth: number;
    contentHeight: number;
    clientWidth: number;
    clientHeight: number;
  }
): void {
  client.onSend("Page.getLayoutMetrics", () => ({
    contentSize: { width: metrics.contentWidth, height: metrics.contentHeight },
    layoutViewport: {
      clientWidth: metrics.clientWidth,
      clientHeight: metrics.clientHeight,
    },
    visualViewport: {
      width: metrics.clientWidth,
      height: metrics.clientHeight,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
  }));
  client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
  client.onSend("Page.setLifecycleEventsEnabled", () => ({}));
  client.onSend("Page.reload", () => {
    // Emit stabilization events after a short delay (simulates page load)
    setTimeout(() => {
      client.emit("Page.loadEventFired");
      client.emit("Page.lifecycleEvent", { name: "networkIdle" });
    }, 5);
    return {};
  });
}

// ============================================================================
// #7: viewport capture integration test
// ============================================================================

describe("captureViewportMetrics", () => {
  it("should follow correct sequence: setDeviceMetrics → reload → stabilize → getLayoutMetrics", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 1440, 1);

    const methods = client.getSendMethods();

    // Verify critical sequence
    const setMetricsIdx = methods.indexOf("Emulation.setDeviceMetricsOverride");
    const reloadIdx = methods.indexOf("Page.reload");
    const getMetricsIdx = methods.indexOf("Page.getLayoutMetrics");

    expect(setMetricsIdx).toBeGreaterThanOrEqual(0);
    expect(reloadIdx).toBeGreaterThan(setMetricsIdx);
    expect(getMetricsIdx).toBeGreaterThan(reloadIdx);
  });

  it("should return correct viewportMetadata for no-scrollbar case", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const result = await captureViewportMetrics(client, 1440, 1);

    expect(result.viewportMetadata.contentWidth).toBe(1440);
    expect(result.viewportMetadata.contentHeight).toBe(5000);
    expect(result.scrollbarWidth).toBe(0);
    expect(result.compensated).toBe(false);
  });

  // ============================================================================
  // #8: scrollbar compensation integration test
  // ============================================================================

  it("should compensate viewport width when scrollbar detected", async () => {
    const client = new MockCDPClient();
    let metricsCallCount = 0;

    // First call: scrollbar present (clientWidth=1423 < 1440)
    // Second call: after compensation (clientWidth=1440)
    client.onSend("Page.getLayoutMetrics", () => {
      metricsCallCount++;
      if (metricsCallCount === 1) {
        return {
          contentSize: { width: 1423, height: 5000 },
          layoutViewport: { clientWidth: 1423, clientHeight: 900 },
          visualViewport: {
            width: 1440,
            height: 900,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
          },
        };
      }
      // Post-compensation metrics
      return {
        contentSize: { width: 1440, height: 5000 },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1457,
          height: 900,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      };
    });
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
    client.onSend("Page.setLifecycleEventsEnabled", () => ({}));
    client.onSend("Page.reload", () => {
      setTimeout(() => {
        client.emit("Page.loadEventFired");
        client.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
      return {};
    });

    const result = await captureViewportMetrics(client, 1440, 1);

    expect(result.scrollbarWidth).toBe(17);
    expect(result.compensated).toBe(true);

    // Should have called setDeviceMetricsOverride twice
    const setMetricsCalls = client
      .getSendLog()
      .filter((e) => e.method === "Emulation.setDeviceMetricsOverride");
    expect(setMetricsCalls.length).toBe(2);

    // Second call has compensated width (1440 + 17 = 1457)
    expect(setMetricsCalls[1].params?.width).toBe(1457);
  });

  // ============================================================================
  // #9: post-compensation metrics refresh test
  // ============================================================================

  it("should re-fetch Page.getLayoutMetrics after compensation and use final values", async () => {
    const client = new MockCDPClient();
    let metricsCallCount = 0;

    client.onSend("Page.getLayoutMetrics", () => {
      metricsCallCount++;
      if (metricsCallCount === 1) {
        // Pre-compensation: scrollbar present
        return {
          contentSize: { width: 1423, height: 3000 },
          layoutViewport: { clientWidth: 1423, clientHeight: 900 },
          visualViewport: {
            width: 1440,
            height: 900,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
          },
        };
      }
      // Post-compensation: final correct values
      return {
        contentSize: { width: 1440, height: 4200 },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1457,
          height: 900,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      };
    });
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
    client.onSend("Page.setLifecycleEventsEnabled", () => ({}));
    client.onSend("Page.reload", () => {
      setTimeout(() => {
        client.emit("Page.loadEventFired");
        client.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
      return {};
    });

    const result = await captureViewportMetrics(client, 1440, 1);

    // viewportMetadata must use FINAL (post-compensation) values
    expect(result.viewportMetadata.contentWidth).toBe(1440);
    expect(result.viewportMetadata.contentHeight).toBe(4200);
    expect(result.viewportMetadata.layoutViewport.clientWidth).toBe(1440);

    // Page.getLayoutMetrics should have been called twice
    const getMetricsCalls = client
      .getSendLog()
      .filter((e) => e.method === "Page.getLayoutMetrics");
    expect(getMetricsCalls.length).toBe(2);
  });
});

// ============================================================================
// #10: cleanup test
// ============================================================================

describe("cleanupViewportCapture", () => {
  it("should call Emulation.clearDeviceMetricsOverride and remove scrollbar style", async () => {
    const client = new MockCDPClient();

    await cleanupViewportCapture(client);

    const methods = client.getSendMethods();
    expect(methods).toContain("Emulation.clearDeviceMetricsOverride");

    // Should remove injected scrollbar-hide style
    const evalCalls = client
      .getSendLog()
      .filter((e) => e.method === "Runtime.evaluate");
    const removeStyleCall = evalCalls.find(
      (e) =>
        typeof e.params?.expression === "string" &&
        (e.params.expression as string).includes("__w2w_hide_scrollbar")
    );
    expect(removeStyleCall).toBeDefined();
  });

  it("should not throw even if client calls fail", async () => {
    const client = new MockCDPClient();
    client.onSend("Emulation.clearDeviceMetricsOverride", () => {
      throw new Error("already detached");
    });

    // Should not throw
    await expect(cleanupViewportCapture(client)).resolves.toBeUndefined();
  });
});

// ============================================================================
// #11: downstream contract test
// ============================================================================

describe("downstream viewportMetadata contract", () => {
  it("should produce viewportMetadata matching CapturedFrame/WireframeFrame shape", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5200,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const result = await captureViewportMetrics(client, 1440, 1);
    const vm = result.viewportMetadata;

    // Full ViewportMetadata shape check
    expect(vm).toHaveProperty("contentWidth");
    expect(vm).toHaveProperty("contentHeight");
    expect(vm).toHaveProperty("layoutViewport.clientWidth");
    expect(vm).toHaveProperty("layoutViewport.clientHeight");
    expect(vm).toHaveProperty("visualViewport.width");
    expect(vm).toHaveProperty("visualViewport.height");
    expect(vm).toHaveProperty("visualViewport.offsetX");
    expect(vm).toHaveProperty("visualViewport.offsetY");
    expect(vm).toHaveProperty("visualViewport.scale");

    // Simulate backend mapping (Plugin_Backend frame mapping)
    const backendFrame = {
      viewportWidth: 1440,
      viewportHeight: 900,
      tree: {} as never,
      assets: {},
      viewportMetadata: vm,
    };

    // viewportMetadata survives backend passthrough
    expect(backendFrame.viewportMetadata).toBe(vm);
    expect(backendFrame.viewportMetadata.contentWidth).toBe(1440);
    expect(backendFrame.viewportMetadata.contentHeight).toBe(5200);
  });
});

// ============================================================================
// #12: skipNavigation — no-reload path (Layer #5)
// ============================================================================

describe("captureViewportMetrics with skipNavigation", () => {
  it("should NOT call Page.reload when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 1440, 1, { skipNavigation: true });

    const methods = client.getSendMethods();
    expect(methods).not.toContain("Page.reload");
  });

  it("should still call Emulation.setDeviceMetricsOverride when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 768,
      contentHeight: 3000,
      clientWidth: 768,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 768, 1, { skipNavigation: true });

    const setMetricsCalls = client
      .getSendLog()
      .filter((e) => e.method === "Emulation.setDeviceMetricsOverride");
    expect(setMetricsCalls.length).toBeGreaterThanOrEqual(1);
    expect(setMetricsCalls[0].params?.width).toBe(768);
  });

  it("should NOT register Page.loadEventFired or Page.lifecycleEvent listeners when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 1440, 1, { skipNavigation: true });

    const methods = client.getSendMethods();
    // Should NOT call prepareStabilization (no Page.setLifecycleEventsEnabled)
    expect(methods).not.toContain("Page.setLifecycleEventsEnabled");
  });

  it("should still wait for layout settle (double rAF) when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 1440, 1, { skipNavigation: true });

    // Runtime.evaluate should be called for layout settle + fonts ready
    const evalCalls = client
      .getSendLog()
      .filter((e) => e.method === "Runtime.evaluate");
    expect(evalCalls.length).toBeGreaterThanOrEqual(1);

    // Should include requestAnimationFrame expression (layout settle)
    const layoutSettleCall = evalCalls.find(
      (e) =>
        typeof e.params?.expression === "string" &&
        (e.params.expression as string).includes("requestAnimationFrame")
    );
    expect(layoutSettleCall).toBeDefined();
  });

  it("should still wait for fonts.ready when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 1440, 1, { skipNavigation: true });

    const evalCalls = client
      .getSendLog()
      .filter((e) => e.method === "Runtime.evaluate");

    const fontsReadyCall = evalCalls.find(
      (e) =>
        typeof e.params?.expression === "string" &&
        (e.params.expression as string).includes("document.fonts.ready")
    );
    expect(fontsReadyCall).toBeDefined();
  });

  it("should still call onAfterStabilization hook when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    let hookCalled = false;
    await captureViewportMetrics(client, 1440, 1, {
      skipNavigation: true,
      onAfterStabilization: async () => {
        hookCalled = true;
      },
    });

    expect(hookCalled).toBe(true);
  });

  it("should still perform scrollbar compensation when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    let metricsCallCount = 0;

    client.onSend("Page.getLayoutMetrics", () => {
      metricsCallCount++;
      if (metricsCallCount === 1) {
        return {
          contentSize: { width: 1423, height: 5000 },
          layoutViewport: { clientWidth: 1423, clientHeight: 900 },
          visualViewport: { width: 1440, height: 900, offsetX: 0, offsetY: 0, scale: 1 },
        };
      }
      return {
        contentSize: { width: 1440, height: 5000 },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: { width: 1457, height: 900, offsetX: 0, offsetY: 0, scale: 1 },
      };
    });
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));

    const result = await captureViewportMetrics(client, 1440, 1, { skipNavigation: true });

    expect(result.scrollbarWidth).toBe(17);
    expect(result.compensated).toBe(true);
  });

  it("should return correct viewportMetadata when skipNavigation is true", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 375,
      contentHeight: 2000,
      clientWidth: 375,
      clientHeight: 900,
    });

    const result = await captureViewportMetrics(client, 375, 1, { skipNavigation: true });

    expect(result.viewportMetadata.contentWidth).toBe(375);
    expect(result.viewportMetadata.contentHeight).toBe(2000);
    expect(result.viewportMetadata.layoutViewport.clientWidth).toBe(375);
    expect(result.scrollbarWidth).toBe(0);
    expect(result.compensated).toBe(false);
  });
});

// ============================================================================
// #13: multi-viewport test
// ============================================================================

describe("multi-viewport capture", () => {
  it("should produce distinct viewportMetadata per viewport without cross-contamination", async () => {
    const viewports = [1440, 768, 375];
    const results: Array<{
      viewport: number;
      metadata: ViewportMetadata;
    }> = [];

    for (const vp of viewports) {
      const client = new MockCDPClient();

      client.onSend("Page.getLayoutMetrics", () => ({
        contentSize: { width: vp, height: vp * 3 },
        layoutViewport: { clientWidth: vp, clientHeight: 900 },
        visualViewport: {
          width: vp,
          height: 900,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      }));
      client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
      client.onSend("Page.setLifecycleEventsEnabled", () => ({}));
      client.onSend("Page.reload", () => {
        setTimeout(() => {
          client.emit("Page.loadEventFired");
          client.emit("Page.lifecycleEvent", { name: "networkIdle" });
        }, 5);
        return {};
      });

      const result = await captureViewportMetrics(client, vp, 1);
      results.push({ viewport: vp, metadata: result.viewportMetadata });
    }

    // Each viewport has its own correct metadata
    expect(results[0].metadata.contentWidth).toBe(1440);
    expect(results[0].metadata.contentHeight).toBe(4320);

    expect(results[1].metadata.contentWidth).toBe(768);
    expect(results[1].metadata.contentHeight).toBe(2304);

    expect(results[2].metadata.contentWidth).toBe(375);
    expect(results[2].metadata.contentHeight).toBe(1125);

    // No cross-contamination
    expect(results[0].metadata.contentWidth).not.toBe(
      results[1].metadata.contentWidth
    );
    expect(results[1].metadata.contentWidth).not.toBe(
      results[2].metadata.contentWidth
    );
  });

  it("should produce correct mobile flag per viewport", async () => {
    const viewports = [1440, 375];

    for (const vp of viewports) {
      const client = new MockCDPClient();
      client.onSend("Page.getLayoutMetrics", () => ({
        contentSize: { width: vp, height: 2000 },
        layoutViewport: { clientWidth: vp, clientHeight: 900 },
        visualViewport: {
          width: vp,
          height: 900,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      }));
      client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
      client.onSend("Page.setLifecycleEventsEnabled", () => ({}));
      client.onSend("Page.reload", () => {
        setTimeout(() => {
          client.emit("Page.loadEventFired");
          client.emit("Page.lifecycleEvent", { name: "networkIdle" });
        }, 5);
        return {};
      });

      await captureViewportMetrics(client, vp, 1);

      // Verify setDeviceMetricsOverride was called with correct mobile flag
      const setMetricsCalls = client
        .getSendLog()
        .filter((e) => e.method === "Emulation.setDeviceMetricsOverride");
      expect(setMetricsCalls.length).toBeGreaterThanOrEqual(1);
      expect(setMetricsCalls[0].params?.mobile).toBe(vp <= 768);
    }
  });
});
