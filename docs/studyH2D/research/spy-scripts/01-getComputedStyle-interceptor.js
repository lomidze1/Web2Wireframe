/**
 * SPY SCRIPT 1: getComputedStyle Interceptor
 *
 * გამოყენება: Chrome DevTools Console-ში inject ქენი h2d capture-მდე
 *
 * რას აკეთებს:
 * - ეკვრის window.getComputedStyle-ს
 * - აფიქსირებს ყველა ელემენტს რომელსაც h2d-ის content script კითხულობს
 * - იწერს: element tag, classes, რომელი properties წაიკითხა
 * - საბოლოოდ exportStyleLog() გამოძახებით მიიღებ სრულ JSON-ს
 */

(function() {
  const styleLog = [];
  const originalGetComputedStyle = window.getComputedStyle;
  let callCount = 0;

  // Track which properties are actually accessed via proxy
  window.getComputedStyle = function(element, pseudoElt) {
    const realStyle = originalGetComputedStyle.call(window, element, pseudoElt);
    callCount++;

    const accessedProperties = new Set();
    const callId = callCount;

    const entry = {
      callId,
      tag: element?.tagName?.toLowerCase() || 'unknown',
      id: element?.id || null,
      classList: element?.classList ? [...element.classList].filter(c => !c.startsWith('h2d-')) : [],
      h2dClass: element?.classList ? [...element.classList].find(c => c.startsWith('h2d-')) : null,
      pseudo: pseudoElt || null,
      accessedProperties: accessedProperties,
      timestamp: Date.now()
    };

    // Create a Proxy to track property access
    const proxy = new Proxy(realStyle, {
      get(target, prop) {
        if (typeof prop === 'string' && prop !== 'length' && !prop.startsWith('__')) {
          accessedProperties.add(prop);
        }
        const value = target[prop];
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }
    });

    styleLog.push(entry);
    return proxy;
  };

  // Export function
  window.exportStyleLog = function() {
    const result = styleLog.map(entry => ({
      ...entry,
      accessedProperties: [...entry.accessedProperties]
    }));

    console.log(`[SPY] Total getComputedStyle calls: ${styleLog.length}`);
    console.log(`[SPY] Unique elements: ${new Set(styleLog.map(e => e.h2dClass || e.tag + '#' + e.id)).size}`);

    // Property frequency
    const propFreq = {};
    result.forEach(entry => {
      entry.accessedProperties.forEach(p => {
        propFreq[p] = (propFreq[p] || 0) + 1;
      });
    });
    console.log('[SPY] Property access frequency:',
      Object.entries(propFreq).sort((a,b) => b[1] - a[1]).slice(0, 30)
    );

    return result;
  };

  // Restore function
  window.restoreGetComputedStyle = function() {
    window.getComputedStyle = originalGetComputedStyle;
    console.log('[SPY] getComputedStyle restored');
  };

  console.log('[SPY] getComputedStyle interceptor installed. Run exportStyleLog() after h2d capture.');
})();
