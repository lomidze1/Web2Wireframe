/**
 * SPY SCRIPT 2: webext-bridge Message Interceptor
 *
 * გამოყენება: Chrome DevTools Console-ში inject ქენი h2d capture-მდე
 *
 * რას აკეთებს:
 * - ე���ვრის window.postMessage-ს (webext-bridge uses window messaging)
 * - ეკვრის chrome.runtime.sendMessage-ს
 * - აფიქსირებს ყველა message-ს content script ↔ background
 * - იწერს: message type, data size, timing
 */

(function() {
  const messageLog = [];
  const startTime = Date.now();

  // Intercept window.postMessage (webext-bridge Port-based messaging)
  const originalPostMessage = window.postMessage.bind(window);
  window.postMessage = function(message, targetOrigin, transfer) {
    if (message && typeof message === 'object') {
      messageLog.push({
        direction: 'OUTGOING (cs→bg)',
        type: message.type || message.messageID || 'unknown',
        data: summarizeData(message),
        dataSize: JSON.stringify(message).length,
        timestamp: Date.now() - startTime
      });
    }
    return originalPostMessage(message, targetOrigin, transfer);
  };

  // Listen for incoming messages
  window.addEventListener('message', function(event) {
    if (event.data && typeof event.data === 'object') {
      const msg = event.data;
      if (msg.type === 'cdp-call-response' || msg.type === 'cdp-call') {
        messageLog.push({
          direction: msg.type === 'cdp-call' ? 'CDP REQUEST' : 'CDP RESPONSE',
          cmd: msg.cmd || 'response',
          respId: msg.respId,
          data: summarizeData(msg),
          dataSize: JSON.stringify(msg).length,
          hasResult: !!msg.result,
          hasError: !!msg.error,
          timestamp: Date.now() - startTime
        });
      }
    }
  }, true); // use capture phase

  function summarizeData(obj) {
    if (!obj) return null;
    const summary = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.length > 200) {
        summary[key] = `[string:${value.length}chars] ${value.slice(0, 100)}...`;
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          summary[key] = `[array:${value.length}]`;
        } else {
          const keys = Object.keys(value);
          summary[key] = `[object:${keys.length}keys] ${keys.slice(0, 5).join(',')}`;
        }
      } else {
        summary[key] = value;
      }
    }
    return summary;
  }

  // Export function
  window.exportMessageLog = function() {
    console.log(`[SPY] Total messages intercepted: ${messageLog.length}`);

    // Group by type
    const byType = {};
    messageLog.forEach(m => {
      const key = m.type || m.cmd || 'unknown';
      byType[key] = (byType[key] || 0) + 1;
    });
    console.log('[SPY] Messages by type:', byType);

    // Timeline
    console.log('[SPY] Timeline (first 20):');
    messageLog.slice(0, 20).forEach(m => {
      console.log(`  ${m.timestamp}ms [${m.direction}] ${m.type || m.cmd} (${m.dataSize} bytes)`);
    });

    return messageLog;
  };

  console.log('[SPY] Message interceptor installed. Run exportMessageLog() after h2d capture.');
})();
