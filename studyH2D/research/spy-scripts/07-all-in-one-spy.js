/**
 * SPY SCRIPT 7: ALL-IN-ONE Comprehensive Spy
 *
 * გამოყენება: Chrome DevTools Console-ში inject ქენი h2d capture-მდე
 *
 * ერთ script-ში აერთიანებს:
 * - getComputedStyle tracking
 * - getBoundingClientRect tracking
 * - Message intercepting
 * - h2d class injection counting
 * - Timing analysis
 *
 * შემდეგ: exportAllSpyData() → downloads comprehensive JSON
 */

(function() {
  const SPY = {
    startTime: Date.now(),
    computedStyleCalls: [],
    boundingRectCalls: [],
    messages: [],
    h2dClasses: new Set(),
    treeWalkerCreations: 0,
    errors: [],
    propertyAccessMap: {} // which CSS properties are read most
  };

  // 1. getComputedStyle
  const _gcs = window.getComputedStyle;
  window.getComputedStyle = function(el, pseudo) {
    const real = _gcs.call(window, el, pseudo);
    const accessed = new Set();

    SPY.computedStyleCalls.push({
      tag: el?.tagName?.toLowerCase() || '?',
      id: el?.id || null,
      pseudo: pseudo || null,
      h2d: el?.classList ? [...el.classList].find(c => c.startsWith('h2d-')) : null,
      t: Date.now() - SPY.startTime,
      props: accessed
    });

    return new Proxy(real, {
      get(target, prop) {
        if (typeof prop === 'string' && prop.length > 1 && prop !== 'length' && !prop.startsWith('_')) {
          accessed.add(prop);
          SPY.propertyAccessMap[prop] = (SPY.propertyAccessMap[prop] || 0) + 1;
        }
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }
    });
  };

  // 2. getBoundingClientRect
  const _gbcr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function() {
    const rect = _gbcr.call(this);
    if (this.className?.includes?.('h2d-')) {
      SPY.boundingRectCalls.push({
        tag: this.tagName?.toLowerCase(),
        h2d: [...(this.classList || [])].find(c => c.startsWith('h2d-')),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0,
        t: Date.now() - SPY.startTime
      });
    }
    return rect;
  };

  // 3. h2d class tracking
  const _clAdd = DOMTokenList.prototype.add;
  DOMTokenList.prototype.add = function(...classes) {
    for (const c of classes) {
      if (typeof c === 'string' && c.startsWith('h2d-')) SPY.h2dClasses.add(c);
    }
    return _clAdd.apply(this, classes);
  };

  // 4. TreeWalker tracking
  const _ctw = document.createTreeWalker.bind(document);
  document.createTreeWalker = function(...args) {
    SPY.treeWalkerCreations++;
    return _ctw(...args);
  };

  // 5. window message tracking
  window.addEventListener('message', function(e) {
    if (e.data && typeof e.data === 'object' && (e.data.type || e.data.__ep_messageID)) {
      SPY.messages.push({
        type: e.data.type || e.data.__ep_messageID || 'unknown',
        size: JSON.stringify(e.data).length,
        t: Date.now() - SPY.startTime
      });
    }
  }, true);

  // Export
  window.exportAllSpyData = function() {
    const elapsed = Date.now() - SPY.startTime;

    const report = {
      meta: {
        duration: elapsed + 'ms',
        url: window.location.href,
        timestamp: new Date().toISOString()
      },
      summary: {
        getComputedStyleCalls: SPY.computedStyleCalls.length,
        getBoundingClientRectCalls: SPY.boundingRectCalls.length,
        h2dClassesInjected: SPY.h2dClasses.size,
        treeWalkerCreations: SPY.treeWalkerCreations,
        messagesIntercepted: SPY.messages.length
      },
      topCSSProperties: Object.entries(SPY.propertyAccessMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([prop, count]) => ({ prop, count })),
      tagDistribution: (() => {
        const dist = {};
        SPY.computedStyleCalls.forEach(c => { dist[c.tag] = (dist[c.tag] || 0) + 1; });
        return dist;
      })(),
      invisibleElements: SPY.boundingRectCalls.filter(e => !e.visible).length,
      messageTypes: (() => {
        const types = {};
        SPY.messages.forEach(m => { types[m.type] = (types[m.type] || 0) + 1; });
        return types;
      })(),
      timeline: {
        first10messages: SPY.messages.slice(0, 10),
        first10styles: SPY.computedStyleCalls.slice(0, 10).map(c => ({
          tag: c.tag, id: c.id, h2d: c.h2d, t: c.t, propsAccessed: [...c.props]
        }))
      }
    };

    console.log('=== H2D SPY REPORT ===');
    console.log(JSON.stringify(report, null, 2));
    return report;
  };

  // Download
  window.downloadSpyReport = function() {
    const report = window.exportAllSpyData();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `h2d-spy-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Restore all
  window.restoreAll = function() {
    window.getComputedStyle = _gcs;
    Element.prototype.getBoundingClientRect = _gbcr;
    DOMTokenList.prototype.add = _clAdd;
    document.createTreeWalker = _ctw;
    console.log('[SPY] All hooks restored');
  };

  console.log(`
╔══════════════════════════════════════════╗
║  H2D ALL-IN-ONE SPY v1.0                ║
║                                          ║
║  Tracking:                               ║
║  �� getComputedStyle calls                ║
║  • getBoundingClientRect calls           ║
║  • h2d-* class injections               ║
║  • TreeWalker creations                  ║
║  • window messages                       ║
║                                          ║
║  After h2d capture:                      ║
║    exportAllSpyData()  → console output  ║
║    downloadSpyReport() → JSON file       ║
║    restoreAll()        → remove hooks    ║
╚══════════════════════════════════════════╝
  `);
})();
