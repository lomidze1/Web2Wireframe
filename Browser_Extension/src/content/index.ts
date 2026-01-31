/**
 * Content Script
 * Runs in the context of web pages
 * Used for direct DOM access when CDP is not available
 */

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ status: "ready" });
    return true;
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

  return false;
});

// Notify that content script is ready
console.log("Web2Wireframe content script loaded");
