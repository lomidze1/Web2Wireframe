/**
 * SPY SCRIPT 3: DOM Traversal Tracker
 *
 * გამოყენება: Chrome DevTools Console-ში inject ქენი h2d capture-მდე
 *
 * რას აკეთებს:
 * - ეკვრის getBoundingClientRect-ს
 * - ეკვრის Element.classList-ს (h2d-* class injection tracking)
 * - აფიქსირებს DOM traversal order
 * - იწერს: element depth, tag, dimensions, visibility decisions
 */

(function() {
  const traversalLog = [];
  const originalGetBCR = Element.prototype.getBoundingClientRect;
  const originalClassListAdd = DOMTokenList.prototype.add;
  let h2dClassCount = 0;

  // Track getBoundingClientRect calls (h2d uses this for positioning)
  Element.prototype.getBoundingClientRect = function() {
    const rect = originalGetBCR.call(this);

    // Only log during h2d capture (when h2d-* classes exist)
    if (this.className && typeof this.className === 'string' && this.className.includes('h2d-')) {
      traversalLog.push({
        type: 'getBoundingClientRect',
        tag: this.tagName?.toLowerCase(),
        h2dClass: [...(this.classList || [])].find(c => c.startsWith('h2d-')),
        rect: {
          x: Math.round(rect.x * 10) / 10,
          y: Math.round(rect.y * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        },
        isVisible: rect.width > 0 && rect.height > 0,
        timestamp: Date.now()
      });
    }

    return rect;
  };

  // Track h2d-* class injection
  DOMTokenList.prototype.add = function(...classes) {
    for (const cls of classes) {
      if (typeof cls === 'string' && cls.startsWith('h2d-')) {
        h2dClassCount++;
        if (h2dClassCount <= 20) { // Log first 20
          traversalLog.push({
            type: 'h2d-class-added',
            tag: this._element?.tagName?.toLowerCase() || 'unknown',
            class: cls,
            timestamp: Date.now()
          });
        }
      }
    }
    return originalClassListAdd.apply(this, classes);
  };

  // Track TreeWalker creation (h2d uses it for DOM traversal)
  const originalCreateTreeWalker = document.createTreeWalker.bind(document);
  document.createTreeWalker = function(root, whatToShow, filter) {
    traversalLog.push({
      type: 'createTreeWalker',
      rootTag: root?.tagName?.toLowerCase(),
      whatToShow: whatToShow,
      timestamp: Date.now()
    });
    return originalCreateTreeWalker(root, whatToShow, filter);
  };

  // Export
  window.exportTraversalLog = function() {
    console.log(`[SPY] Total traversal events: ${traversalLog.length}`);
    console.log(`[SPY] h2d classes injected: ${h2dClassCount}`);

    const bcrCalls = traversalLog.filter(e => e.type === 'getBoundingClientRect');
    console.log(`[SPY] getBoundingClientRect calls: ${bcrCalls.length}`);

    const invisibleCount = bcrCalls.filter(e => !e.isVisible).length;
    console.log(`[SPY] Invisible elements (0x0): ${invisibleCount}`);

    // Tag distribution
    const tagDist = {};
    bcrCalls.forEach(e => {
      tagDist[e.tag] = (tagDist[e.tag] || 0) + 1;
    });
    console.log('[SPY] Tags accessed:', tagDist);

    return traversalLog;
  };

  // Restore
  window.restoreTraversal = function() {
    Element.prototype.getBoundingClientRect = originalGetBCR;
    DOMTokenList.prototype.add = originalClassListAdd;
    document.createTreeWalker = originalCreateTreeWalker;
    console.log('[SPY] Traversal hooks restored');
  };

  console.log('[SPY] DOM traversal tracker installed. Run exportTraversalLog() after h2d capture.');
})();
