/**
 * SPY SCRIPT 4: Background Service Worker CDP Logger
 *
 * გამოყენება:
 * 1. chrome://extensions/ → h2d → "Service Worker" link click
 * 2. DevTools Console-ში ეს script paste ქენი
 * 3. h2d capture გაუშვი
 * 4. exportCDPLog() გამოძახე
 *
 * რას აკეთებს:
 * - ეკვრის chrome.debugger.sendCommand-ს
 * - აფიქსირებს ყველა CDP command-ს full request/response-ით
 * - იწერს: command name, params, result size, timing
 */

(function() {
  const cdpLog = [];
  const startTime = Date.now();
  const originalSendCommand = chrome.debugger.sendCommand.bind(chrome.debugger);

  chrome.debugger.sendCommand = function(target, method, params) {
    const callStart = Date.now();
    const entry = {
      method,
      params: summarizeParams(method, params),
      timestamp: callStart - startTime,
      target: target?.tabId
    };

    return originalSendCommand(target, method, params).then(result => {
      entry.duration = Date.now() - callStart;
      entry.resultSize = result ? JSON.stringify(result).length : 0;
      entry.resultSummary = summarizeResult(method, result);
      entry.success = true;
      cdpLog.push(entry);
      return result;
    }).catch(error => {
      entry.duration = Date.now() - callStart;
      entry.error = error?.message || String(error);
      entry.success = false;
      cdpLog.push(entry);
      throw error;
    });
  };

  function summarizeParams(method, params) {
    if (!params) return null;
    const summary = { ...params };

    // Don't log huge data
    if (summary.expression && summary.expression.length > 200) {
      summary.expression = summary.expression.slice(0, 200) + '...';
    }
    return summary;
  }

  function summarizeResult(method, result) {
    if (!result) return null;

    switch (method) {
      case 'Page.getResourceTree':
        const resources = result.frameTree?.resources || [];
        return {
          frameId: result.frameTree?.frame?.id,
          resourceCount: resources.length,
          resourceTypes: [...new Set(resources.map(r => r.type))],
          imageResources: resources.filter(r => r.type === 'Image').length
        };

      case 'Page.getResourceContent':
        return {
          base64Encoded: result.base64Encoded,
          contentLength: result.content?.length || 0,
          // First few bytes to identify format
          contentPreview: result.content?.slice(0, 50)
        };

      case 'DOM.getDocument':
        return { nodeId: result.root?.nodeId, childCount: result.root?.childNodeCount };

      case 'DOM.querySelector':
        return { nodeId: result.nodeId };

      case 'CSS.getPlatformFontsForNode':
        return { fonts: result.fonts?.map(f => f.familyName) };

      case 'DOM.getBoxModel':
        if (result.model) {
          const m = result.model;
          return {
            content: m.content?.slice(0, 4),
            width: m.width,
            height: m.height
          };
        }
        return null;

      case 'CSS.forcePseudoState':
        return 'ok';

      default:
        const keys = Object.keys(result);
        return { keys, size: JSON.stringify(result).length };
    }
  }

  // Export (works in both window and Service Worker)
  const _global = typeof self !== 'undefined' ? self : window;
  _global.exportCDPLog = function() {
    console.log(`[CDP-SPY] Total CDP calls: ${cdpLog.length}`);

    // Group by method
    const byMethod = {};
    cdpLog.forEach(e => {
      if (!byMethod[e.method]) byMethod[e.method] = { count: 0, totalDuration: 0, totalResultSize: 0 };
      byMethod[e.method].count++;
      byMethod[e.method].totalDuration += e.duration || 0;
      byMethod[e.method].totalResultSize += e.resultSize || 0;
    });

    console.log('[CDP-SPY] Commands summary:');
    Object.entries(byMethod)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([method, stats]) => {
        console.log(`  ${method}: ${stats.count}x, ${stats.totalDuration}ms total, ${(stats.totalResultSize / 1024).toFixed(1)}KB data`);
      });

    // Timeline (first 30)
    console.log('\n[CDP-SPY] Timeline (first 30):');
    cdpLog.slice(0, 30).forEach(e => {
      console.log(`  ${e.timestamp}ms [${e.duration}ms] ${e.method} → ${e.resultSize} bytes`);
    });

    return cdpLog;
  };

  // Full export — copy from console (Service Worker has no DOM for download)
  _global.downloadCDPLog = function() {
    const json = JSON.stringify(cdpLog, null, 2);
    console.log('[CDP-SPY] ===== COPY EVERYTHING BELOW THIS LINE =====');
    console.log(json);
    console.log('[CDP-SPY] ===== COPY EVERYTHING ABOVE THIS LINE =====');
    console.log(`[CDP-SPY] ${cdpLog.length} calls, ${(json.length / 1024).toFixed(1)}KB`);
    console.log('[CDP-SPY] Right-click the logged object above → "Copy object" → save as .json');
    return cdpLog;
  };

  // Alternative: get as copyable string
  _global.getCDPLogJSON = function() {
    return JSON.stringify(cdpLog, null, 2);
  };

  console.log('[CDP-SPY] Background CDP logger installed.');
  console.log('  After capture: exportCDPLog() → summary');
  console.log('  To get data: copy( getCDPLogJSON() ) → clipboard');
})();
