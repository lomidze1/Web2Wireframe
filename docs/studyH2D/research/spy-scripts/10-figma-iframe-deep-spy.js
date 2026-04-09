/**
 * SPY SCRIPT 10: Figma Plugin IFRAME Deep Spy
 *
 * Previous spy (09) ran in Figma's main window — didn't see h2d traffic.
 * This spy finds h2d's plugin iframe and injects interceptors INSIDE it.
 *
 * USAGE:
 * 1. Figma DevTools → Console
 * 2. Paste this script
 * 3. It will automatically find h2d's iframe and inject spy
 * 4. Do URL import in h2d
 * 5. downloadH2DIframeSpy()
 */

(function() {
  const SPY = {
    startTime: Date.now(),
    iframeFound: false,
    iframeSrc: null,
    networkRequests: [],
    messages: [],
    wsMessages: [],
    injectedCount: 0
  };

  function injectIntoIframe(iframe) {
    try {
      const win = iframe.contentWindow;
      if (!win || !win.fetch) return false;

      // Check if already injected
      if (win.__h2dSpyInjected) return false;
      win.__h2dSpyInjected = true;

      SPY.iframeFound = true;
      SPY.iframeSrc = iframe.src?.slice(0, 200) || 'no-src';
      SPY.injectedCount++;

      console.log(`[IFRAME-SPY] ✅ Injected into iframe #${SPY.injectedCount}: ${SPY.iframeSrc}`);

      // === Intercept fetch ===
      const origFetch = win.fetch;
      win.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '?';
        const method = args[1]?.method || 'GET';
        const startMs = Date.now();

        const entry = {
          source: `iframe#${SPY.injectedCount}`,
          type: 'fetch',
          method,
          url: url.slice(0, 500),
          timestamp: startMs - SPY.startTime
        };

        // Log request body for POST
        if (args[1]?.body) {
          const body = args[1].body;
          if (typeof body === 'string') {
            entry.requestBodySize = body.length;
            entry.requestBodyPreview = body.slice(0, 300);
          } else if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
            entry.requestBodySize = body.byteLength || body.length;
            entry.requestBodyType = 'binary';
          }
        }

        try {
          const response = await origFetch.apply(this, args);
          entry.status = response.status;
          entry.duration = Date.now() - startMs;
          entry.contentType = response.headers.get('content-type');

          const clone = response.clone();
          try {
            if (entry.contentType?.includes('json') || entry.contentType?.includes('text')) {
              const text = await clone.text();
              entry.responseSize = text.length;
              entry.responsePreview = text.slice(0, 1000);

              try {
                const json = JSON.parse(text);
                entry.jsonKeys = Object.keys(json).slice(0, 20);
                if (json.frame || json.doc || json.assets) {
                  entry.isH2DData = true;
                  entry.h2dSummary = {
                    hasFrame: !!json.frame,
                    hasDoc: !!json.doc,
                    assetsCount: json.assets ? Object.keys(json.assets).length : 0,
                    fontsCount: json.fonts?.length || 0
                  };
                  console.log('[IFRAME-SPY] 🎯 H2D DATA FOUND!', entry.h2dSummary);
                }
              } catch {}
            } else {
              const buf = await clone.arrayBuffer();
              entry.responseSize = buf.byteLength;
              entry.responseType = 'binary';
              // Check first bytes for h2d format (deflate + XOR)
              const bytes = new Uint8Array(buf.slice(0, 8));
              entry.firstBytes = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
            }
          } catch (e) {
            entry.readError = e.message;
          }

          SPY.networkRequests.push(entry);
          console.log(`[IFRAME-SPY] ${method} ${url.slice(0, 80)} → ${response.status} (${entry.responseSize || '?'} bytes)`);
          return response;
        } catch (error) {
          entry.error = error.message;
          entry.duration = Date.now() - startMs;
          SPY.networkRequests.push(entry);
          throw error;
        }
      };

      // === Intercept XMLHttpRequest ===
      const origXHROpen = win.XMLHttpRequest.prototype.open;
      const origXHRSend = win.XMLHttpRequest.prototype.send;

      win.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._spyData = { source: `iframe#${SPY.injectedCount}`, method, url: String(url).slice(0, 500), type: 'xhr' };
        return origXHROpen.call(this, method, url, ...rest);
      };

      win.XMLHttpRequest.prototype.send = function(body) {
        const entry = { ...this._spyData, timestamp: Date.now() - SPY.startTime };
        if (body) entry.requestBodySize = typeof body === 'string' ? body.length : body.byteLength || 0;

        const startMs = Date.now();
        this.addEventListener('load', function() {
          entry.status = this.status;
          entry.duration = Date.now() - startMs;
          entry.responseSize = this.responseText?.length || 0;
          entry.responsePreview = this.responseText?.slice(0, 500);
          SPY.networkRequests.push(entry);
          console.log(`[IFRAME-SPY] XHR ${entry.method} ${entry.url?.slice(0, 60)} → ${this.status}`);
        });
        return origXHRSend.call(this, body);
      };

      // === Intercept WebSocket (h2d might use WS for streaming) ===
      const OrigWS = win.WebSocket;
      win.WebSocket = function(url, protocols) {
        console.log(`[IFRAME-SPY] 🔌 WebSocket opened: ${url}`);
        const ws = new OrigWS(url, protocols);
        const entry = { type: 'websocket-open', url, timestamp: Date.now() - SPY.startTime };
        SPY.networkRequests.push(entry);

        ws.addEventListener('message', function(event) {
          const size = typeof event.data === 'string' ? event.data.length : event.data?.byteLength || 0;
          SPY.wsMessages.push({
            url,
            direction: 'incoming',
            size,
            preview: typeof event.data === 'string' ? event.data.slice(0, 300) : `[binary ${size} bytes]`,
            timestamp: Date.now() - SPY.startTime
          });
          if (size > 10000) {
            console.log(`[IFRAME-SPY] 📨 WS large message: ${size} bytes from ${url.slice(0, 60)}`);
          }
        });

        const origSend = ws.send.bind(ws);
        ws.send = function(data) {
          const size = typeof data === 'string' ? data.length : data?.byteLength || 0;
          SPY.wsMessages.push({
            url,
            direction: 'outgoing',
            size,
            preview: typeof data === 'string' ? data.slice(0, 300) : `[binary ${size} bytes]`,
            timestamp: Date.now() - SPY.startTime
          });
          return origSend(data);
        };

        return ws;
      };
      win.WebSocket.prototype = OrigWS.prototype;

      // === Monitor postMessage from iframe ===
      win.addEventListener('message', function(event) {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        const size = JSON.stringify(data).length;
        if (size > 100) {
          SPY.messages.push({
            source: `iframe#${SPY.injectedCount}`,
            direction: 'received',
            dataSize: size,
            dataKeys: Object.keys(data).slice(0, 15),
            timestamp: Date.now() - SPY.startTime
          });
        }
      }, true);

      // Monitor outgoing postMessage
      const origPostMessage = win.postMessage.bind(win);
      win.postMessage = function(msg, ...rest) {
        if (msg && typeof msg === 'object') {
          const size = JSON.stringify(msg).length;
          if (size > 100) {
            SPY.messages.push({
              source: `iframe#${SPY.injectedCount}`,
              direction: 'sent',
              dataSize: size,
              dataKeys: Object.keys(msg).slice(0, 15),
              preview: JSON.stringify(msg).slice(0, 300),
              timestamp: Date.now() - SPY.startTime
            });
            if (size > 50000) {
              console.log(`[IFRAME-SPY] 📤 Large postMessage: ${(size/1024).toFixed(0)}KB`);
            }
          }
        }
        return origPostMessage(msg, ...rest);
      };

      return true;
    } catch (e) {
      // Cross-origin iframe — can't access
      return false;
    }
  }

  // === Find and inject into ALL iframes (including dynamically created ones) ===
  function scanIframes() {
    const iframes = document.querySelectorAll('iframe');
    let injected = 0;
    for (const iframe of iframes) {
      try {
        if (iframe.contentWindow && !iframe.contentWindow.__h2dSpyInjected) {
          const src = iframe.src || '';
          // Try to inject into any iframe (h2d's iframe URL might vary)
          if (injectIntoIframe(iframe)) {
            injected++;
          }
        }
      } catch {}
    }
    return injected;
  }

  // Initial scan
  let found = scanIframes();
  console.log(`[IFRAME-SPY] Initial scan: ${found} iframes injected`);

  // Watch for new iframes (h2d might create them dynamically)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'IFRAME') {
          // Wait for iframe to load
          node.addEventListener('load', () => {
            if (injectIntoIframe(node)) {
              console.log('[IFRAME-SPY] 🆕 New iframe injected!');
            }
          });
          // Also try immediately
          setTimeout(() => injectIntoIframe(node), 100);
        }
        // Check children for iframes
        if (node.querySelectorAll) {
          for (const iframe of node.querySelectorAll('iframe')) {
            setTimeout(() => injectIntoIframe(iframe), 100);
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic scan (in case iframes load later)
  const scanInterval = setInterval(() => {
    const newFound = scanIframes();
    if (newFound > 0) console.log(`[IFRAME-SPY] Periodic scan: ${newFound} new iframes`);
  }, 2000);

  // === Export ===
  window.exportH2DIframeSpy = function() {
    clearInterval(scanInterval);
    observer.disconnect();

    const report = {
      meta: {
        timestamp: new Date().toISOString(),
        duration: (Date.now() - SPY.startTime) + 'ms',
        iframesInjected: SPY.injectedCount,
        iframeSrc: SPY.iframeSrc,
        totalRequests: SPY.networkRequests.length,
        totalMessages: SPY.messages.length,
        totalWSMessages: SPY.wsMessages.length
      },
      networkRequests: SPY.networkRequests,
      messages: SPY.messages,
      wsMessages: SPY.wsMessages
    };

    console.log('[IFRAME-SPY] === REPORT ===');
    console.log(`  Iframes injected: ${SPY.injectedCount}`);
    console.log(`  Network requests: ${SPY.networkRequests.length}`);
    console.log(`  Messages: ${SPY.messages.length}`);
    console.log(`  WebSocket messages: ${SPY.wsMessages.length}`);

    // Show unique domains
    const domains = {};
    SPY.networkRequests.forEach(r => {
      try {
        const host = new URL(r.url).hostname;
        domains[host] = (domains[host] || 0) + 1;
      } catch {}
    });
    console.log('  Domains:', domains);

    return report;
  };

  window.downloadH2DIframeSpy = function() {
    const report = window.exportH2DIframeSpy();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `h2d-iframe-spy-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[IFRAME-SPY] Downloaded!');
  };

  console.log(`
╔═══════════════════════════════════════════════╗
║  H2D IFRAME DEEP SPY v1.0                    ║
║                                               ║
║  Injected into ${SPY.injectedCount} iframes so far             ║
║  Watching for new iframes...                  ║
║                                               ║
║  Now: open h2d plugin → Web tab → URL import  ║
║                                               ║
║  After import:                                ║
║    downloadH2DIframeSpy() → JSON file         ║
╚═══════════════════════════════════════════════╝
  `);
})();
