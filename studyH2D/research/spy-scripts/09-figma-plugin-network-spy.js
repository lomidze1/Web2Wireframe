/**
 * SPY SCRIPT 9: Figma Plugin Network & Data Spy
 *
 * PURPOSE: Intercept ALL data that h2d Figma plugin receives
 * during URL import (Web tab) to understand:
 * - Does it use a server-side headless browser?
 * - What data format comes from URL import vs Extension import?
 * - What API endpoints does it call?
 *
 * USAGE:
 * 1. Open Figma Desktop
 * 2. Open DevTools: Menu → Plugins → Development → Open Console
 *    (or Help → Toggle Developer Tools)
 * 3. Paste this ENTIRE script in Console
 * 4. Open h2d plugin → Web tab → enter URL → Import
 * 5. After import finishes: downloadH2DSpyReport()
 *
 * WHAT IT INTERCEPTS:
 * - All fetch() and XMLHttpRequest calls from the plugin iframe
 * - All figma.createFrame/createText/createImage calls
 * - All postMessage between plugin UI and sandbox
 * - Data size and timing of everything
 */

(function() {
  const SPY = {
    startTime: Date.now(),
    networkRequests: [],
    figmaCalls: [],
    messages: [],
    errors: []
  };

  // ========== 1. Intercept fetch() ==========
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const method = args[1]?.method || 'GET';
    const startMs = Date.now();

    const entry = {
      type: 'fetch',
      method,
      url: url.slice(0, 300),
      timestamp: startMs - SPY.startTime,
      requestBodySize: args[1]?.body ? JSON.stringify(args[1].body).length : 0
    };

    try {
      const response = await originalFetch.apply(this, args);
      entry.status = response.status;
      entry.duration = Date.now() - startMs;
      entry.responseHeaders = {};
      response.headers.forEach((v, k) => { entry.responseHeaders[k] = v; });
      entry.contentType = response.headers.get('content-type');

      // Clone response to read body without consuming it
      const clone = response.clone();
      try {
        const text = await clone.text();
        entry.responseSize = text.length;
        // Save first 500 chars for analysis
        entry.responsePreview = text.slice(0, 500);

        // Check if it's JSON with h2d data
        if (entry.contentType?.includes('json') || text.startsWith('{') || text.startsWith('[')) {
          try {
            const json = JSON.parse(text);
            entry.jsonKeys = Object.keys(json).slice(0, 20);
            // Check for h2d-specific keys
            if (json.frame || json.doc || json.assets || json.fonts) {
              entry.isH2DData = true;
              entry.h2dSummary = {
                hasFrame: !!json.frame,
                hasDoc: !!json.doc,
                assetsCount: json.assets ? Object.keys(json.assets).length : 0,
                fontsCount: json.fonts?.length || 0,
                url: json.url || json.name
              };
              console.log('[H2D-SPY] 🎯 FOUND H2D DATA in fetch response!', entry.h2dSummary);
            }
          } catch {}
        }
      } catch {}

      SPY.networkRequests.push(entry);
      return response;
    } catch (error) {
      entry.error = error.message;
      entry.duration = Date.now() - startMs;
      SPY.networkRequests.push(entry);
      throw error;
    }
  };

  // ========== 2. Intercept XMLHttpRequest ==========
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._spyData = { method, url: String(url).slice(0, 300), type: 'xhr' };
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const entry = {
      ...this._spyData,
      timestamp: Date.now() - SPY.startTime,
      requestBodySize: body ? String(body).length : 0
    };

    const startMs = Date.now();
    this.addEventListener('load', function() {
      entry.status = this.status;
      entry.duration = Date.now() - startMs;
      entry.responseSize = this.responseText?.length || 0;
      entry.responsePreview = this.responseText?.slice(0, 500);
      entry.contentType = this.getResponseHeader('content-type');
      SPY.networkRequests.push(entry);
    });

    this.addEventListener('error', function() {
      entry.error = 'XHR error';
      entry.duration = Date.now() - startMs;
      SPY.networkRequests.push(entry);
    });

    return originalXHRSend.call(this, body);
  };

  // ========== 3. Intercept postMessage (plugin UI ↔ sandbox) ==========
  window.addEventListener('message', function(event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Filter out noise (Figma internal messages)
    const dataStr = JSON.stringify(data);
    if (dataStr.length < 50) return; // skip tiny messages

    const entry = {
      type: 'postMessage',
      timestamp: Date.now() - SPY.startTime,
      origin: event.origin,
      dataSize: dataStr.length,
      dataKeys: Object.keys(data).slice(0, 10)
    };

    // Check for h2d-specific data
    if (data.pluginMessage || data.type?.includes?.('h2d') || data.frame || data.doc) {
      entry.isH2DMessage = true;
      const msg = data.pluginMessage || data;
      entry.messageType = msg.type || msg.action || 'unknown';

      if (msg.frame || msg.doc || msg.assets) {
        entry.h2dSummary = {
          hasFrame: !!msg.frame,
          hasDoc: !!msg.doc,
          assetsCount: msg.assets ? Object.keys(msg.assets).length : 0,
          fontsCount: msg.fonts?.length || 0
        };
        console.log('[H2D-SPY] 🎯 H2D data in postMessage!', entry.h2dSummary);
      }
    }

    // Only log interesting messages (h2d related or large)
    if (entry.isH2DMessage || entry.dataSize > 1000) {
      SPY.messages.push(entry);
    }
  }, true);

  // ========== 4. Monitor console for h2d logs ==========
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = function(...args) {
    const msg = args.map(a => typeof a === 'string' ? a : '').join(' ');
    if (msg.includes('h2d') || msg.includes('divriots') || msg.includes('import') ||
        msg.includes('capture') || msg.includes('render') || msg.includes('frame')) {
      SPY.messages.push({
        type: 'console.log',
        timestamp: Date.now() - SPY.startTime,
        message: msg.slice(0, 300)
      });
    }
    return originalLog.apply(console, args);
  };

  console.error = function(...args) {
    const msg = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
    SPY.errors.push({
      timestamp: Date.now() - SPY.startTime,
      message: msg.slice(0, 500)
    });
    return originalError.apply(console, args);
  };

  // ========== Export Functions ==========

  window.exportH2DSpyReport = function() {
    const report = {
      meta: {
        timestamp: new Date().toISOString(),
        duration: (Date.now() - SPY.startTime) + 'ms',
        totalFetchCalls: SPY.networkRequests.filter(r => r.type === 'fetch').length,
        totalXHRCalls: SPY.networkRequests.filter(r => r.type === 'xhr').length,
        totalMessages: SPY.messages.length,
        totalErrors: SPY.errors.length
      },
      networkRequests: SPY.networkRequests,
      messages: SPY.messages,
      errors: SPY.errors
    };

    console.log('[H2D-SPY] === REPORT ===');
    console.log(`Network requests: ${report.meta.totalFetchCalls} fetch + ${report.meta.totalXHRCalls} XHR`);
    console.log(`Messages: ${report.meta.totalMessages}`);
    console.log(`Errors: ${report.meta.totalErrors}`);

    // Show URL-import specific requests
    const h2dRequests = SPY.networkRequests.filter(r =>
      r.url?.includes('divriots') || r.url?.includes('h2d') ||
      r.url?.includes('gstorage') || r.isH2DData
    );
    if (h2dRequests.length > 0) {
      console.log('\n[H2D-SPY] 🎯 H2D-related network requests:');
      h2dRequests.forEach(r => {
        console.log(`  ${r.method} ${r.url?.slice(0, 80)} → ${r.status} (${r.responseSize} bytes, ${r.duration}ms)`);
      });
    }

    // Show all unique domains
    const domains = new Set();
    SPY.networkRequests.forEach(r => {
      try { domains.add(new URL(r.url).hostname); } catch {}
    });
    console.log('\n[H2D-SPY] Domains contacted:', [...domains]);

    return report;
  };

  window.downloadH2DSpyReport = function() {
    const report = window.exportH2DSpyReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `h2d-url-import-spy-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[H2D-SPY] Report downloaded!');
  };

  // Restore all
  window.restoreH2DSpy = function() {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;
    XMLHttpRequest.prototype.send = originalXHRSend;
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.log('[H2D-SPY] All hooks restored');
  };

  console.log(`
╔═══════════════════════════════════════════════╗
║  H2D FIGMA PLUGIN SPY v1.0                   ║
║                                               ║
║  Intercepting:                                ║
║  • fetch() and XMLHttpRequest calls           ║
║  • postMessage (plugin UI ↔ sandbox)          ║
║  • Console logs related to h2d                ║
║                                               ║
║  Now open h2d plugin → Web tab → enter URL    ║
║  → Import                                     ║
║                                               ║
║  After import:                                ║
║    downloadH2DSpyReport() → JSON file         ║
║    exportH2DSpyReport()  → console output     ║
║    restoreH2DSpy()       → remove hooks       ║
╚═══════════════════════════════════════════════╝
  `);
})();
