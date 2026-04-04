/**
 * SPY SCRIPT 8: DOM Mutation Observer
 *
 * PROBLEM: h2d content script runs in Chrome's "isolated world" —
 * we can't intercept their getComputedStyle or JS calls.
 *
 * SOLUTION: We CAN observe DOM changes they make, because
 * isolated world shares the DOM with the main page.
 *
 * What this catches:
 * - h2d-* class injection (every element gets one)
 * - Style element injection (#__h2d_anim_pause)
 * - Attribute changes (__h2d_shadowRoot)
 * - Element additions/removals during capture
 *
 * Usage: DevTools Console → paste → run h2d capture → exportMutationLog()
 */

(function() {
  const mutations = [];
  const h2dClasses = new Map(); // element → h2d class
  const startTime = Date.now();
  let totalMutations = 0;

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      totalMutations++;

      // Track class changes (h2d-* injection)
      if (record.type === 'attributes' && record.attributeName === 'class') {
        const el = record.target;
        const classes = [...(el.classList || [])];
        const h2dClass = classes.find(c => c.startsWith('h2d-'));
        if (h2dClass && !h2dClasses.has(el)) {
          h2dClasses.set(el, {
            class: h2dClass,
            tag: el.tagName?.toLowerCase(),
            id: el.id || null,
            originalClasses: classes.filter(c => !c.startsWith('h2d-')).slice(0, 3),
            rect: (() => {
              try {
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
              } catch { return null; }
            })(),
            timestamp: Date.now() - startTime
          });
        }
      }

      // Track __h2d_shadowRoot attribute
      if (record.type === 'attributes' && record.attributeName === '__h2d_shadowRoot') {
        mutations.push({
          type: 'h2d_shadowRoot',
          tag: record.target.tagName?.toLowerCase(),
          value: record.target.getAttribute('__h2d_shadowRoot'),
          timestamp: Date.now() - startTime
        });
      }

      // Track style element injections
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.tagName === 'STYLE') {
            mutations.push({
              type: 'style_injected',
              id: node.id || null,
              contentPreview: (node.textContent || '').slice(0, 200),
              timestamp: Date.now() - startTime
            });
          }
        }
        for (const node of record.removedNodes) {
          if (node.tagName === 'STYLE' && node.id?.includes('h2d')) {
            mutations.push({
              type: 'style_removed',
              id: node.id,
              timestamp: Date.now() - startTime
            });
          }
        }
      }
    }
  });

  // Observe entire document
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', '__h2d_shadowRoot', 'style'],
    childList: true,
    subtree: true
  });

  // Also monitor computed styles that h2d reads by watching what
  // properties they USE (via the output .h2d file analysis)
  // We know they read 89 CSS properties. Let's capture current state
  // of all h2d-marked elements after capture.

  window.exportMutationLog = function() {
    observer.disconnect();

    const h2dElements = [...h2dClasses.values()];

    // Now read computed styles for all h2d-marked elements
    const elementStyles = [];
    for (const [el, info] of h2dClasses) {
      try {
        const cs = getComputedStyle(el);
        elementStyles.push({
          ...info,
          styles: {
            display: cs.display,
            position: cs.position,
            width: cs.width,
            height: cs.height,
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            fontSize: cs.fontSize,
            fontFamily: cs.fontFamily?.slice(0, 60),
            flexDirection: cs.flexDirection,
            gap: cs.gap,
            padding: cs.padding,
            margin: cs.margin,
            borderRadius: cs.borderRadius,
            boxShadow: cs.boxShadow !== 'none' ? cs.boxShadow?.slice(0, 100) : null,
            opacity: cs.opacity,
            overflow: cs.overflow,
            zIndex: cs.zIndex,
            transform: cs.transform !== 'none' ? cs.transform?.slice(0, 80) : null,
            gridTemplateColumns: cs.gridTemplateColumns !== 'none' ? cs.gridTemplateColumns?.slice(0, 80) : null,
            gridTemplateRows: cs.gridTemplateRows !== 'none' ? cs.gridTemplateRows?.slice(0, 80) : null
          },
          // Check for images
          isImg: el.tagName === 'IMG',
          imgSrc: el.tagName === 'IMG' ? el.src?.slice(0, 100) : null,
          bgImage: cs.backgroundImage !== 'none' ? cs.backgroundImage?.slice(0, 100) : null,
          // Check for SVG
          isSvg: el.tagName === 'svg' || el.tagName === 'SVG',
          // Text content
          textContent: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
            ? el.textContent?.slice(0, 50) : null,
          childCount: el.children?.length || 0
        });
      } catch (e) {
        elementStyles.push({ ...info, error: e.message });
      }
    }

    const report = {
      meta: {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        duration: (Date.now() - startTime) + 'ms',
        totalDOMMutations: totalMutations
      },
      summary: {
        h2dElementsMarked: h2dClasses.size,
        styleInjections: mutations.filter(m => m.type === 'style_injected').length,
        shadowRoots: mutations.filter(m => m.type === 'h2d_shadowRoot').length
      },
      tagDistribution: (() => {
        const dist = {};
        h2dElements.forEach(e => { dist[e.tag] = (dist[e.tag] || 0) + 1; });
        return dist;
      })(),
      mutations: mutations,
      elements: elementStyles
    };

    console.log(`[DOM-SPY] h2d marked ${h2dClasses.size} elements`);
    console.log(`[DOM-SPY] Total DOM mutations: ${totalMutations}`);
    console.log(`[DOM-SPY] Tags:`, report.tagDistribution);

    return report;
  };

  window.downloadMutationReport = function() {
    const report = window.exportMutationLog();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `h2d-dom-mutation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[DOM-SPY] Downloaded!');
  };

  console.log(`
╔══════════════════════════════════════════╗
║  H2D DOM MUTATION SPY v1.0               ║
║                                          ║
║  Watches DOM changes h2d makes:          ║
║  - h2d-* class injection on elements    ║
║  - Style element injection/removal       ║
║  - Shadow DOM marking                    ║
║  - After capture: reads computed styles  ║
║                                          ║
║  After h2d capture:                      ║
║    downloadMutationReport() → JSON file  ║
╚══════════════════════════════════════════╝
  `);
})();
