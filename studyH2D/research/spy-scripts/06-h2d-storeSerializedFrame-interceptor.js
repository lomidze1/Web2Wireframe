/**
 * SPY SCRIPT 6: storeSerializedFrame Interceptor (MOST IMPORTANT)
 *
 * გამოყენება: Chrome DevTools Console-ში inject ქენი h2d capture-მდე
 *
 * რას აკეთებს:
 * - ეკვრის storeSerializedFrame message-ს
 * - ეს არის ბოლო ეტაპი სადაც content script აგზავნის მზა data-ს background-ში
 * - იჭერს სრულ JSON-ს COMPRESSION-მდე
 * - ანუ იგივე data რაც .h2d ფაილში ხვდება, მაგრამ raw JSON-ად
 *
 * ეს ყველაზე ღირებული spy-ია, რადგან:
 * - ხედავ ზუსტად რა data გააგზავნა content script-მა
 * - არ არის compressed/encrypted
 * - შეგიძლია real-time-ში ნახო
 */

(function() {
  const interceptedFrames = [];

  // Method 1: Intercept via webext-bridge internal messaging
  // h2d uses chrome.runtime.sendMessage under the hood via webext-bridge
  const originalSendMessage = chrome.runtime?.sendMessage?.bind(chrome.runtime);
  if (chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage = function(extensionId, message, options, callback) {
      // Handle different argument formats
      let msg = message;
      if (typeof extensionId === 'object' && !message) {
        msg = extensionId;
      }

      if (msg && typeof msg === 'object') {
        // webext-bridge wraps messages
        const data = msg.data || msg;
        const msgType = msg.type || msg.__ep_messageID || data?.__ep_messageID;

        if (msgType === 'storeSerializedFrame' || msgType === 'finalizeImport') {
          console.log(`[SPY-FRAME] Intercepted: ${msgType}`);

          if (data?.frame) {
            const frameData = data;
            interceptedFrames.push({
              type: msgType,
              timestamp: Date.now(),
              frameNodeCount: countNodes(frameData.frame),
              assetCount: frameData.assets ? Object.keys(frameData.assets).length : 0,
              fontCount: frameData.fonts?.length || 0,
              dataSize: JSON.stringify(frameData).length,
              // Store the actual data
              data: frameData
            });

            console.log(`[SPY-FRAME] Frame captured! ${countNodes(frameData.frame)} nodes, ` +
              `${frameData.assets ? Object.keys(frameData.assets).length : 0} assets, ` +
              `${frameData.fonts?.length || 0} fonts`);
          }
        }
      }

      // Call original
      if (typeof extensionId === 'object' && !message) {
        return originalSendMessage(extensionId);
      }
      return originalSendMessage(extensionId, message, options, callback);
    };
  }

  // Method 2: Monitor window.postMessage (backup)
  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg && typeof msg === 'object') {
      // Check if it contains frame data being sent to background
      if (msg.frame && msg.assets && msg.fonts) {
        console.log('[SPY-FRAME] Detected frame data in postMessage!');
        interceptedFrames.push({
          type: 'postMessage-frame',
          timestamp: Date.now(),
          frameNodeCount: countNodes(msg.frame),
          assetCount: Object.keys(msg.assets).length,
          fontCount: msg.fonts?.length || 0,
          dataSize: JSON.stringify(msg).length,
          data: msg
        });
      }
    }
  }, true);

  function countNodes(node) {
    if (!node) return 0;
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += countNodes(child);
      }
    }
    return count;
  }

  // Export intercepted frames
  window.exportInterceptedFrames = function() {
    if (interceptedFrames.length === 0) {
      console.log('[SPY-FRAME] No frames intercepted yet. Run an h2d capture first.');
      return null;
    }

    for (const frame of interceptedFrames) {
      console.log(`[SPY-FRAME] ${frame.type}: ${frame.frameNodeCount} nodes, ` +
        `${frame.assetCount} assets, ${frame.fontCount} fonts, ${(frame.dataSize / 1024).toFixed(1)}KB`);
    }

    return interceptedFrames;
  };

  // Download intercepted frame as JSON
  window.downloadInterceptedFrame = function(index = 0) {
    if (!interceptedFrames[index]) {
      console.log('[SPY-FRAME] No frame at index', index);
      return;
    }

    const data = interceptedFrames[index].data;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `h2d-intercepted-frame-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[SPY-FRAME] Downloaded!');
  };

  console.log('[SPY-FRAME] storeSerializedFrame interceptor installed.');
  console.log('  After h2d capture: exportInterceptedFrames()');
  console.log('  To download: downloadInterceptedFrame()');
})();
