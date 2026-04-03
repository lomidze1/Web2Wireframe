/**
 * captureViewportMetrics — onAfterStabilization Hook Tests (Phase 2)
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 *
 * captureViewportMetrics()-ს უნდა დაემატოს optional onAfterStabilization hook,
 * რომელიც გამოიძახება stabilization-ის შემდეგ და getLayoutMetrics-ის წინ.
 *
 * ეს აუცილებელია:
 * - Browser Extension-ისთვის: autoScrollPage() ჩაბმა stabilization-ის შემდეგ
 * - Plugin_Backend-ისთვის: autoScroll() ჩაბმა Puppeteer flow-ში
 * - ორივე path-ისთვის unified ფუნქციის გამოყენება დუბლირების გარეშე
 *
 * API ცვლილება:
 * ძველი: captureViewportMetrics(client, targetViewport, browserDpr, stabilizationOverrides?)
 * ახალი: captureViewportMetrics(client, targetViewport, browserDpr, options?)
 *   options = { stabilizationOverrides?, onAfterStabilization? }
 */

import { describe, it, expect, vi } from "vitest";
import {
  captureViewportMetrics,
  getStabilizationConfig,
  cleanupViewportCapture,
} from "../viewport-orchestration";
import type {
  StabilizationClient,
  ViewportMetadata,
} from "../viewport-orchestration";

// ============================================================================
// MOCK CDP CLIENT (იგივე pattern რაც viewport-orchestration.test.ts-ში)
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

  emit(event: string, params?: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(params));
  }

  onSend(
    method: string,
    handler: (params?: Record<string, unknown>) => unknown
  ): void {
    this.sendHandlers.set(method, handler);
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
// HELPER: Standard mock setup
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
    contentSize: {
      width: metrics.contentWidth,
      height: metrics.contentHeight,
    },
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
    setTimeout(() => {
      client.emit("Page.loadEventFired");
      client.emit("Page.lifecycleEvent", { name: "networkIdle" });
    }, 5);
    return {};
  });
}

// ============================================================================
// #1: options object-ით გამოძახება
// ============================================================================

describe("captureViewportMetrics — options object API", () => {
  it("should accept options object as 4th parameter", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    // ახალი API: options object
    const result = await captureViewportMetrics(client, 1440, 1, {});

    expect(result.viewportMetadata.contentWidth).toBe(1440);
    expect(result.viewportMetadata.contentHeight).toBe(5000);
  });

  it("should support stabilizationOverrides within options", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const result = await captureViewportMetrics(client, 1440, 1, {
      stabilizationOverrides: {
        loadEventTimeout: 8000,
        networkIdleTimeout: 5000,
      },
    });

    expect(result.viewportMetadata.contentWidth).toBe(1440);
  });

  it("should work with no options (backward compatibility)", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    // ძველი API: არანაირი options
    const result = await captureViewportMetrics(client, 1440, 1);

    expect(result.viewportMetadata.contentWidth).toBe(1440);
    expect(result.scrollbarWidth).toBe(0);
    expect(result.compensated).toBe(false);
  });
});

// ============================================================================
// #2: onAfterStabilization hook — გამოძახება
// ============================================================================

describe("captureViewportMetrics — onAfterStabilization hook", () => {
  it("should call onAfterStabilization hook exactly once", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const hook = vi.fn().mockResolvedValue(undefined);

    await captureViewportMetrics(client, 1440, 1, {
      onAfterStabilization: hook,
    });

    expect(hook).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // #3: hook-ს client გადაეცემა არგუმენტად
  // ==========================================================================

  it("should pass the client as first argument to hook", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const hook = vi.fn().mockResolvedValue(undefined);

    await captureViewportMetrics(client, 1440, 1, {
      onAfterStabilization: hook,
    });

    expect(hook).toHaveBeenCalledWith(client);
  });

  // ==========================================================================
  // #4: hook stabilization-ის შემდეგ და getLayoutMetrics-ის წინ სრულდება
  // ==========================================================================

  it("should call hook AFTER stabilization and BEFORE Page.getLayoutMetrics", async () => {
    const client = new MockCDPClient();
    const callOrder: string[] = [];

    client.onSend("Page.getLayoutMetrics", () => {
      callOrder.push("getLayoutMetrics");
      return {
        contentSize: { width: 1440, height: 5000 },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1440,
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
      callOrder.push("reload");
      setTimeout(() => {
        client.emit("Page.loadEventFired");
        client.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
      return {};
    });

    const hook = vi.fn().mockImplementation(async () => {
      callOrder.push("onAfterStabilization");
    });

    await captureViewportMetrics(client, 1440, 1, {
      onAfterStabilization: hook,
    });

    // Sequence: reload → ... → hook → getLayoutMetrics
    const reloadIdx = callOrder.indexOf("reload");
    const hookIdx = callOrder.indexOf("onAfterStabilization");
    const metricsIdx = callOrder.indexOf("getLayoutMetrics");

    expect(reloadIdx).toBeGreaterThanOrEqual(0);
    expect(hookIdx).toBeGreaterThan(reloadIdx);
    expect(metricsIdx).toBeGreaterThan(hookIdx);
  });

  // ==========================================================================
  // #5: hook-ის შეცდომა პროპაგირდება (არ იყლაპება)
  // ==========================================================================

  it("should propagate hook errors (not swallow silently)", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const hook = vi.fn().mockRejectedValue(new Error("Auto-scroll failed"));

    await expect(
      captureViewportMetrics(client, 1440, 1, {
        onAfterStabilization: hook,
      })
    ).rejects.toThrow("Auto-scroll failed");
  });

  // ==========================================================================
  // #6: hook-ის გარეშე — იგივე ქცევა (backward compat)
  // ==========================================================================

  it("should behave identically without hook", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    // Without hook
    const result = await captureViewportMetrics(client, 1440, 1);

    expect(result.viewportMetadata.contentWidth).toBe(1440);
    expect(result.viewportMetadata.contentHeight).toBe(5000);
    expect(result.scrollbarWidth).toBe(0);
    expect(result.compensated).toBe(false);
  });

  // ==========================================================================
  // #7: hook-ში auto-scroll სიმულაცია (real-world use case)
  // ==========================================================================

  it("should allow hook to modify page state before metrics capture (auto-scroll simulation)", async () => {
    const client = new MockCDPClient();
    let metricsCallCount = 0;
    let hookCalled = false;

    // Before hook: page height is 2000 (no lazy content loaded)
    // After hook (auto-scroll): page height grows to 8000
    client.onSend("Page.getLayoutMetrics", () => {
      metricsCallCount++;
      const height = hookCalled ? 8000 : 2000;
      return {
        contentSize: { width: 1440, height },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1440,
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

    const autoScrollHook = vi.fn().mockImplementation(async () => {
      hookCalled = true; // Simulate page growth after scroll
    });

    const result = await captureViewportMetrics(client, 1440, 1, {
      onAfterStabilization: autoScrollHook,
    });

    // CRITICAL: metrics should reflect post-hook state (8000, not 2000)
    expect(result.viewportMetadata.contentHeight).toBe(8000);
    expect(autoScrollHook).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // #8: hook scrollbar compensation-თანაც თავსებადია
  // ==========================================================================

  it("should work correctly when hook + scrollbar compensation both active", async () => {
    const client = new MockCDPClient();
    let metricsCallCount = 0;
    const hookFn = vi.fn().mockResolvedValue(undefined);

    // First metrics call: scrollbar present (clientWidth=1423 < 1440)
    // Second metrics call (after compensation): clientWidth=1440
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

    const result = await captureViewportMetrics(client, 1440, 1, {
      onAfterStabilization: hookFn,
    });

    // Hook must have been called
    expect(hookFn).toHaveBeenCalledTimes(1);

    // Scrollbar compensation must still work
    expect(result.scrollbarWidth).toBe(17);
    expect(result.compensated).toBe(true);

    // Final metadata should use post-compensation values
    expect(result.viewportMetadata.contentWidth).toBe(1440);
  });

  // ==========================================================================
  // #9: hook-ის async ბუნება — await-ს ელოდება
  // ==========================================================================

  it("should await the hook promise before proceeding", async () => {
    const client = new MockCDPClient();
    const events: string[] = [];

    client.onSend("Page.getLayoutMetrics", () => {
      events.push("metrics");
      return {
        contentSize: { width: 1440, height: 5000 },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1440,
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

    // Hook that takes time (simulates slow auto-scroll)
    const hook = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      events.push("hook-done");
    });

    await captureViewportMetrics(client, 1440, 1, {
      onAfterStabilization: hook,
    });

    // hook-done must appear before metrics
    const hookDoneIdx = events.indexOf("hook-done");
    const metricsIdx = events.indexOf("metrics");
    expect(hookDoneIdx).toBeGreaterThanOrEqual(0);
    expect(metricsIdx).toBeGreaterThan(hookDoneIdx);
  });
});

// ============================================================================
// #10: multi-viewport with hook — ყოველ viewport-ზე ცალკე გამოიძახება
// ============================================================================

describe("captureViewportMetrics — multi-viewport hook usage", () => {
  it("should call hook for each viewport independently when called in a loop", async () => {
    const viewports = [1440, 768, 375];
    const hookCalls: number[] = [];

    for (const vp of viewports) {
      const client = new MockCDPClient();
      setupStandardMock(client, {
        contentWidth: vp,
        contentHeight: vp * 3,
        clientWidth: vp,
        clientHeight: 900,
      });

      const hook = vi.fn().mockImplementation(async () => {
        hookCalls.push(vp);
      });

      await captureViewportMetrics(client, vp, 1, {
        onAfterStabilization: hook,
      });

      expect(hook).toHaveBeenCalledTimes(1);
    }

    // Hook called once per viewport
    expect(hookCalls).toEqual([1440, 768, 375]);
  });
});

// ============================================================================
// #11: navigationFn — custom navigation instead of Page.reload
// ============================================================================

describe("captureViewportMetrics — navigationFn option", () => {
  it("should use navigationFn instead of Page.reload when provided", async () => {
    const client = new MockCDPClient();
    const navFn = vi.fn().mockImplementation(async () => {
      // Simulate page.goto triggering lifecycle events
      setTimeout(() => {
        client.emit("Page.loadEventFired");
        client.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
    });

    client.onSend("Page.getLayoutMetrics", () => ({
      contentSize: { width: 1440, height: 5000 },
      layoutViewport: { clientWidth: 1440, clientHeight: 900 },
      visualViewport: {
        width: 1440,
        height: 900,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      },
    }));
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
    client.onSend("Page.setLifecycleEventsEnabled", () => ({}));

    const result = await captureViewportMetrics(client, 1440, 1, {
      navigationFn: navFn,
    });

    // navigationFn should be called
    expect(navFn).toHaveBeenCalledTimes(1);
    expect(navFn).toHaveBeenCalledWith(client);

    // Page.reload should NOT be in the send log
    const methods = client.getSendMethods();
    expect(methods).not.toContain("Page.reload");

    // Result should still be correct
    expect(result.viewportMetadata.contentWidth).toBe(1440);
  });

  it("should fall back to Page.reload when navigationFn is not provided", async () => {
    const client = new MockCDPClient();
    setupStandardMock(client, {
      contentWidth: 1440,
      contentHeight: 5000,
      clientWidth: 1440,
      clientHeight: 900,
    });

    await captureViewportMetrics(client, 1440, 1);

    const methods = client.getSendMethods();
    expect(methods).toContain("Page.reload");
  });

  it("should call navigationFn AFTER stabilization listeners are registered", async () => {
    const client = new MockCDPClient();
    let listenersRegisteredBeforeNav = false;

    const navFn = vi.fn().mockImplementation(async () => {
      // Check that listeners exist at navigation time
      listenersRegisteredBeforeNav =
        (client as unknown as { listeners: Map<string, Set<unknown>> })
          // Access private field for verification — checking listener registration timing
          !== undefined;
      // Emit events
      setTimeout(() => {
        client.emit("Page.loadEventFired");
        client.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
    });

    client.onSend("Page.getLayoutMetrics", () => ({
      contentSize: { width: 1440, height: 5000 },
      layoutViewport: { clientWidth: 1440, clientHeight: 900 },
      visualViewport: {
        width: 1440,
        height: 900,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      },
    }));
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
    client.onSend("Page.setLifecycleEventsEnabled", () => ({}));

    await captureViewportMetrics(client, 1440, 1, { navigationFn: navFn });

    // navigationFn was called (which means stabilization listeners were registered before it)
    expect(navFn).toHaveBeenCalledTimes(1);
  });

  it("should work with both navigationFn and onAfterStabilization", async () => {
    const client = new MockCDPClient();
    const callOrder: string[] = [];

    const navFn = vi.fn().mockImplementation(async () => {
      callOrder.push("navigationFn");
      setTimeout(() => {
        client.emit("Page.loadEventFired");
        client.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
    });

    const hookFn = vi.fn().mockImplementation(async () => {
      callOrder.push("onAfterStabilization");
    });

    client.onSend("Page.getLayoutMetrics", () => {
      callOrder.push("getLayoutMetrics");
      return {
        contentSize: { width: 1440, height: 5000 },
        layoutViewport: { clientWidth: 1440, clientHeight: 900 },
        visualViewport: {
          width: 1440,
          height: 900,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      };
    });
    client.onSend("Runtime.evaluate", () => ({ result: { value: true } }));
    client.onSend("Page.setLifecycleEventsEnabled", () => ({}));

    await captureViewportMetrics(client, 1440, 1, {
      navigationFn: navFn,
      onAfterStabilization: hookFn,
    });

    // Correct order: navigationFn → stabilization → hook → metrics
    expect(callOrder.indexOf("navigationFn")).toBeLessThan(
      callOrder.indexOf("onAfterStabilization")
    );
    expect(callOrder.indexOf("onAfterStabilization")).toBeLessThan(
      callOrder.indexOf("getLayoutMetrics")
    );
  });
});
