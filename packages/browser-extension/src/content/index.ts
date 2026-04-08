/**
 * Content Script
 * Runs in the context of web pages
 * Handles UI overlay for selection mode, page info queries,
 * and h2d-style DOM extraction.
 */

import { extractPage, cleanupMarkers, extractSubtree } from './extractor';

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ status: "ready" });
    return true;
  }

  // h2d-style DOM extraction via content script
  if (message.type === "EXTRACT_DOM") {
    try {
      const result = extractPage();
      sendResponse({ success: true, data: result });
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // Re-extract a subtree for hover state capture
  if (message.type === "EXTRACT_SUBTREE") {
    try {
      const selector = message.selector as string;
      const result = extractSubtree(selector);
      sendResponse({ success: true, data: result });
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // Cleanup data-w2w-idx markers (called by service worker after font collection)
  if (message.type === "CLEANUP_MARKERS") {
    cleanupMarkers();
    sendResponse({ success: true });
    return true;
  }

  // Fetch font binary from page context (bypasses CORS since page already has access)
  if (message.type === "FETCH_FONT_DATA") {
    const urls: string[] = message.urls;
    const results: Record<string, string> = {};

    (async () => {
      for (const url of urls) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              // Strip "data:...;base64," prefix
              resolve(dataUrl.split(',')[1] || '');
            };
            reader.readAsDataURL(blob);
          });
          if (base64) results[url] = base64;
        } catch {
          // Skip failed fetches
        }
      }
      sendResponse({ success: true, data: results });
    })();
    return true; // async response
  }

  if (message.type === "GET_PAGE_INFO") {
    const info = {
      url: window.location.href,
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
    sendResponse(info);
    return true;
  }

  if (message.type === "SCROLL_TO") {
    window.scrollTo(message.x || 0, message.y || 0);
    sendResponse({ success: true });
    return true;
  }

  // === Selection UI Handlers ===

  if (message.type === "SHOW_SELECTION_UI") {
    showSelectionOverlay();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "HIDE_SELECTION_UI") {
    hideSelectionOverlay();
    sendResponse({ success: true });
    return true;
  }

  return false;
});

/**
 * Show selection mode overlay with cancel button
 */
function showSelectionOverlay(): void {
  // Remove existing overlay
  hideSelectionOverlay();

  // Create overlay container
  const overlay = document.createElement("div");
  overlay.id = "w2w-selection-overlay";
  overlay.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      color: white;
      font-size: 14px;
    ">
      <span>Click an element to capture</span>
      <button id="w2w-cancel-btn" style="
        background: #444;
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s;
      ">Cancel (ESC)</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cancel button handler
  const cancelBtn = document.getElementById("w2w-cancel-btn");
  cancelBtn?.addEventListener("click", handleCancel);
  cancelBtn?.addEventListener("mouseover", () => {
    cancelBtn.style.background = "#555";
  });
  cancelBtn?.addEventListener("mouseout", () => {
    cancelBtn.style.background = "#444";
  });

  // ESC key handler
  document.addEventListener("keydown", escKeyHandler);
}

/**
 * Hide selection mode overlay
 */
function hideSelectionOverlay(): void {
  const existing = document.getElementById("w2w-selection-overlay");
  if (existing) {
    existing.remove();
  }
  document.removeEventListener("keydown", escKeyHandler);
}

/**
 * Handle cancel action
 */
function handleCancel(): void {
  chrome.runtime.sendMessage({ type: "CANCEL_SELECTION" });
  hideSelectionOverlay();
}

/**
 * ESC key handler
 */
function escKeyHandler(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    handleCancel();
  }
}

// Content script loaded and ready
