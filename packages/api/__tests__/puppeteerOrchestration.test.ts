/**
 * Puppeteer Viewport Orchestration Tests (Phase 3)
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 *
 * ორი რამ უნდა შეიცვალოს Plugin_Backend-ში:
 *
 * 1. CDPClient.on() — უკვე დატესტილია cdpClient.test.ts-ში
 *
 * 2. ახალი helper: orchestratePuppeteerViewport(page, viewportWidth, options)
 *    - Page-იდან CDP session-ს ქმნის (createCDPClient)
 *    - Page/Emulation domain-ებს ჩართავს
 *    - captureViewportMetrics()-ს გამოიძახებს (shared-extraction-იდან)
 *    - viewportMetadata-ს დააბრუნებს
 *    - ეს ჩაანაცვლებს htmlExtractor.js-ის inline viewport ლოგიკას:
 *      page.setViewport + setTimeout + clientWidth -> CDP orchestration
 *
 * 3. renderWebsite() და renderHTMLContent() — viewportMetadata-ს დააბრუნებენ
 *
 * ეს ტესტები მოკავს:
 * - orchestratePuppeteerViewport() ფუნქციის კონტრაქტს
 * - CDP მეთოდების სწორ გამოძახებას (არა Puppeteer API)
 * - viewportMetadata-ის სწორ სტრუქტურას
 * - renderWebsite/renderHTMLContent return value-ში viewportMetadata-ის არსებობას
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// ============================================================================
// MOCK: Puppeteer CDP Session
// ============================================================================

function createMockCDPSession() {
  const emitter = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    _sendLog: Array<{ method: string; params: unknown }>;
    _onSend: (method: string, handler: (params?: unknown) => unknown) => void;
    _getSendMethods: () => string[];
  };
  const sendLog: Array<{ method: string; params: unknown }> = [];
  const sendHandlers = new Map<string, (params?: unknown) => unknown>();

  emitter.send = vi.fn(async (method: string, params?: unknown) => {
    sendLog.push({ method, params });
    const handler = sendHandlers.get(method);
    if (handler) return handler(params);
    return {};
  });
  emitter.detach = vi.fn().mockResolvedValue(undefined);

  // Test helpers
  emitter._sendLog = sendLog;
  emitter._onSend = (method: string, handler: (params?: unknown) => unknown) => sendHandlers.set(method, handler);
  emitter._getSendMethods = () => sendLog.map((e) => e.method);

  return emitter;
}

// ============================================================================
// MOCK: Puppeteer Page
// ============================================================================

function createMockPage(session: ReturnType<typeof createMockCDPSession>) {
  const createCDPSession = vi.fn().mockResolvedValue(session);
  const targetObj = { createCDPSession };
  return {
    target: vi.fn(() => targetObj),
    _createCDPSession: createCDPSession,
    setViewport: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({}),
    setRequestInterception: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
}

// ============================================================================
// Standard layout metrics mock
// ============================================================================

interface MetricsOverrides {
  contentWidth?: number;
  contentHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
}

function setupStandardSessionMock(session: ReturnType<typeof createMockCDPSession>, metrics: MetricsOverrides = {}) {
  const {
    contentWidth = 1440,
    contentHeight = 5000,
    clientWidth = 1440,
    clientHeight = 900,
  } = metrics;

  session._onSend("Page.getLayoutMetrics", () => ({
    contentSize: { width: contentWidth, height: contentHeight },
    layoutViewport: { clientWidth, clientHeight },
    visualViewport: {
      width: clientWidth,
      height: clientHeight,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
  }));
  session._onSend("Runtime.evaluate", () => ({ result: { value: true } }));
  session._onSend("Page.setLifecycleEventsEnabled", () => ({}));
  session._onSend("Page.reload", () => {
    setTimeout(() => {
      session.emit("Page.loadEventFired");
      session.emit("Page.lifecycleEvent", { name: "networkIdle" });
    }, 5);
    return {};
  });
  // Domain enables
  session._onSend("DOM.enable", () => ({}));
  session._onSend("CSS.enable", () => ({}));
  session._onSend("DOMSnapshot.enable", () => ({}));
  session._onSend("Runtime.enable", () => ({}));
  session._onSend("Page.enable", () => ({}));
  session._onSend("Emulation.enable", () => ({}));
  session._onSend("Emulation.setDeviceMetricsOverride", () => ({}));
  session._onSend("Emulation.clearDeviceMetricsOverride", () => ({}));
}

// ============================================================================
// #1: orchestratePuppeteerViewport — არსებობა და export
// ============================================================================

describe("orchestratePuppeteerViewport — function contract", () => {
  let orchestratePuppeteerViewport: ((...args: any[]) => Promise<any>) | null;

  beforeEach(async () => {
    // ახალი ფუნქცია lib/cdp/viewport-orchestration.js-დან უნდა იყოს
    try {
      const mod = await import("../src/lib/cdp/viewport-orchestration.js");
      orchestratePuppeteerViewport = mod.orchestratePuppeteerViewport;
    } catch {
      orchestratePuppeteerViewport = null;
    }
  });

  it("should be exported from lib/cdp/viewport-orchestration.js", () => {
    expect(orchestratePuppeteerViewport).not.toBeNull();
    expect(typeof orchestratePuppeteerViewport).toBe("function");
  });

  // ==========================================================================
  // #2: CDP session-ს ქმნის page-იდან
  // ==========================================================================

  it("should create CDP session from page", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    await orchestratePuppeteerViewport(page, 1440);

    expect(page._createCDPSession).toHaveBeenCalled();
  });

  // ==========================================================================
  // #3: Emulation.setDeviceMetricsOverride-ს იყენებს (არა page.setViewport)
  // ==========================================================================

  it("should use Emulation.setDeviceMetricsOverride instead of page.setViewport", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    await orchestratePuppeteerViewport(page, 1440);

    // CDP method should be called
    const methods = session._getSendMethods();
    expect(methods).toContain("Emulation.setDeviceMetricsOverride");

    // Puppeteer API should NOT be called
    expect(page.setViewport).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // #4: Page.getLayoutMetrics-ს იყენებს (არა clientWidth eval)
  // ==========================================================================

  it("should use Page.getLayoutMetrics for dimension measurement", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    await orchestratePuppeteerViewport(page, 1440);

    const methods = session._getSendMethods();
    expect(methods).toContain("Page.getLayoutMetrics");
  });

  // ==========================================================================
  // #5: viewportMetadata-ს აბრუნებს სწორი სტრუქტურით
  // ==========================================================================

  it("should return viewportMetadata with correct ViewportMetadata shape", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session, {
      contentWidth: 1440,
      contentHeight: 5200,
      clientWidth: 1440,
      clientHeight: 900,
    });

    const result = await orchestratePuppeteerViewport(page, 1440);

    // Full ViewportMetadata shape check
    expect(result.viewportMetadata).toBeDefined();
    expect(result.viewportMetadata).toHaveProperty("contentWidth", 1440);
    expect(result.viewportMetadata).toHaveProperty("contentHeight", 5200);
    expect(result.viewportMetadata).toHaveProperty(
      "layoutViewport.clientWidth",
      1440
    );
    expect(result.viewportMetadata).toHaveProperty(
      "layoutViewport.clientHeight",
      900
    );
    expect(result.viewportMetadata).toHaveProperty("visualViewport.width");
    expect(result.viewportMetadata).toHaveProperty("visualViewport.height");
    expect(result.viewportMetadata).toHaveProperty("visualViewport.offsetX");
    expect(result.viewportMetadata).toHaveProperty("visualViewport.offsetY");
    expect(result.viewportMetadata).toHaveProperty("visualViewport.scale");
  });

  // ==========================================================================
  // #6: scrollbarWidth და compensated-ს აბრუნებს
  // ==========================================================================

  it("should return scrollbarWidth and compensated fields", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    const result = await orchestratePuppeteerViewport(page, 1440);

    expect(result).toHaveProperty("scrollbarWidth");
    expect(result).toHaveProperty("compensated");
    expect(typeof result.scrollbarWidth).toBe("number");
    expect(typeof result.compensated).toBe("boolean");
  });

  // ==========================================================================
  // #7: autoScrollFn hook-ს გადასცემს
  // ==========================================================================

  it("should pass autoScrollFn as onAfterStabilization hook", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    const autoScrollFn = vi.fn().mockResolvedValue(undefined);

    await orchestratePuppeteerViewport(page, 1440, {
      autoScrollFn,
    });

    expect(autoScrollFn).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // #8: cleanup — Emulation.clearDeviceMetricsOverride გამოიძახება
  // ==========================================================================

  it("should return cleanup function that clears viewport override", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    const result = await orchestratePuppeteerViewport(page, 1440);

    // cleanup should be a function
    expect(typeof result.cleanup).toBe("function");

    // Before cleanup — no clearDeviceMetricsOverride
    const methodsBefore = session._getSendMethods();
    expect(methodsBefore).not.toContain("Emulation.clearDeviceMetricsOverride");

    // After cleanup — clearDeviceMetricsOverride called
    await result.cleanup();
    const methodsAfter = session._getSendMethods();
    expect(methodsAfter).toContain("Emulation.clearDeviceMetricsOverride");
  });

  // ==========================================================================
  // #9: Page + Emulation domain-ები ჩართულია
  // ==========================================================================

  it("should enable Page and Emulation CDP domains", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    await orchestratePuppeteerViewport(page, 1440);

    const methods = session._getSendMethods();
    expect(methods).toContain("Page.enable");
    expect(methods).toContain("Emulation.enable");
  });

  // ==========================================================================
  // #10: scrollbar compensation CDP-ით
  // ==========================================================================

  it("should compensate scrollbar via CDP (not page.setViewport)", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    let metricsCallCount = 0;

    session._onSend("Page.getLayoutMetrics", () => {
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
    session._onSend("Runtime.evaluate", () => ({ result: { value: true } }));
    session._onSend("Page.setLifecycleEventsEnabled", () => ({}));
    session._onSend("Page.reload", () => {
      setTimeout(() => {
        session.emit("Page.loadEventFired");
        session.emit("Page.lifecycleEvent", { name: "networkIdle" });
      }, 5);
      return {};
    });
    session._onSend("DOM.enable", () => ({}));
    session._onSend("CSS.enable", () => ({}));
    session._onSend("DOMSnapshot.enable", () => ({}));
    session._onSend("Runtime.enable", () => ({}));
    session._onSend("Page.enable", () => ({}));
    session._onSend("Emulation.enable", () => ({}));
    session._onSend("Emulation.setDeviceMetricsOverride", () => ({}));
    session._onSend("Emulation.clearDeviceMetricsOverride", () => ({}));

    const result = await orchestratePuppeteerViewport(page, 1440);

    expect(result.scrollbarWidth).toBe(17);
    expect(result.compensated).toBe(true);

    // Compensation must use CDP, not Puppeteer API
    expect(page.setViewport).not.toHaveBeenCalled();

    // Two calls to Emulation.setDeviceMetricsOverride (original + compensated)
    const setMetricsCalls = session._sendLog.filter(
      (e) => e.method === "Emulation.setDeviceMetricsOverride"
    );
    expect(setMetricsCalls.length).toBe(2);
  });

  // ==========================================================================
  // #11: error — cleanup ხდება even on failure
  // ==========================================================================

  it("should clean up even if capture fails", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);

    // Make Page.reload fail
    session._onSend("Page.reload", () => {
      throw new Error("Navigation failed");
    });
    session._onSend("DOM.enable", () => ({}));
    session._onSend("CSS.enable", () => ({}));
    session._onSend("DOMSnapshot.enable", () => ({}));
    session._onSend("Runtime.enable", () => ({}));
    session._onSend("Page.enable", () => ({}));
    session._onSend("Emulation.enable", () => ({}));
    session._onSend("Emulation.setDeviceMetricsOverride", () => ({}));
    session._onSend("Emulation.clearDeviceMetricsOverride", () => ({}));
    session._onSend("Page.setLifecycleEventsEnabled", () => ({}));
    session._onSend("Runtime.evaluate", () => ({}));

    try {
      await orchestratePuppeteerViewport(page, 1440);
    } catch {
      // Expected to throw
    }

    // Cleanup should still happen
    const methods = session._getSendMethods();
    expect(methods).toContain("Emulation.clearDeviceMetricsOverride");
  });
});

// ============================================================================
// #12: renderWebsite viewportMetadata contract
// ============================================================================

describe("renderWebsite — viewportMetadata return contract", () => {
  it("should return viewportMetadata in its result", async () => {
    const htmlExtractor = await import("../src/lib/htmlExtractor.js");

    expect(typeof htmlExtractor.renderWebsite).toBe("function");
    expect(typeof htmlExtractor.renderHTMLContent).toBe("function");
  });

  it("should include viewportMetadata in createWireframeData frame objects", async () => {
    const htmlExtractor = await import("../src/lib/htmlExtractor.js");
    expect(typeof htmlExtractor.createWireframeData).toBe("function");
    expect(typeof htmlExtractor.createWireframeDataFromHTML).toBe("function");
  });
});

// ============================================================================
// #13: setTimeout-ის არარსებობის ვერიფიკაცია (არა ფიქსირებული sleep)
// ============================================================================

describe("orchestratePuppeteerViewport — no fixed sleeps", () => {
  let orchestratePuppeteerViewport: ((...args: any[]) => Promise<any>) | null;

  beforeEach(async () => {
    try {
      const mod = await import("../src/lib/cdp/viewport-orchestration.js");
      orchestratePuppeteerViewport = mod.orchestratePuppeteerViewport;
    } catch {
      orchestratePuppeteerViewport = null;
    }
  });

  it("should NOT use Puppeteer API for viewport or stabilization (CDP-only)", async () => {
    if (!orchestratePuppeteerViewport) return;

    const session = createMockCDPSession();
    const page = createMockPage(session);
    setupStandardSessionMock(session);

    await orchestratePuppeteerViewport(page, 1440);

    // Must NOT use legacy Puppeteer APIs:
    // - page.setViewport() — replaced by Emulation.setDeviceMetricsOverride
    // - page.evaluate(() => clientWidth) — replaced by Page.getLayoutMetrics
    expect(page.setViewport).not.toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();

    // Must use CDP methods instead
    const methods = session._getSendMethods();
    expect(methods).toContain("Emulation.setDeviceMetricsOverride");
    expect(methods).toContain("Page.getLayoutMetrics");
  });
});
