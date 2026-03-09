/**
 * h2d Service Worker CDP Spy v2
 *
 * გამოყენება: ჩააგდე h2d-ის service worker კონსოლში იმპორტის დაწყებამდე.
 *
 * v2 ცვლილებები:
 * - ყველა Runtime.callFunctionOn-ის functionDeclaration სრულად ლოგდება
 * - ყველა Runtime.callFunctionOn/evaluate-ის result სრულად ლოგდება
 * - DOM.describeNode result-ები (nodeName, nodeType) ლოგდება
 * - მეთოდების summary counter ბოლოში
 */

(function() {
  const _origSendCommand = chrome.debugger.sendCommand;
  let callCounter = 0;
  const methodCounts = {};
  const callFnBodies = []; // collect all callFunctionOn bodies

  // CDP methods we track
  const HOT_METHODS = new Set([
    'Runtime.evaluate',
    'Runtime.callFunctionOn',
    'DOM.resolveNode',
    'DOM.getBoxModel',
    'DOM.describeNode',
    'DOM.getDocument',
    'DOM.querySelector',
    'DOM.querySelectorAll',
    'DOM.setAttributeValue',
    'DOM.getAttributes',
    'DOM.getOuterHTML',
    'CSS.getComputedStyleForNode',
    'CSS.getMatchedStylesForNode',
    'CSS.getPlatformFontsForNode',
    'Emulation.setDeviceMetricsOverride',
    'Emulation.clearDeviceMetricsOverride',
    'Page.getLayoutMetrics',
    'Page.reload',
    'DOMSnapshot.captureSnapshot',
    'DOMSnapshot.getSnapshot',
  ]);

  chrome.debugger.sendCommand = function(target, method, params, callback) {
    const id = ++callCounter;
    const isHot = HOT_METHODS.has(method);

    // Count all methods
    methodCounts[method] = (methodCounts[method] || 0) + 1;

    // === LOGGING ===

    if (isHot) {
      // Runtime.callFunctionOn — ALWAYS show function body (the key change in v2)
      if (method === 'Runtime.callFunctionOn') {
        const fn = params?.functionDeclaration || '';
        const fnShort = fn.length > 200 ? fn.substring(0, 200) + '...' : fn;
        callFnBodies.push({ id, fn, objectId: params?.objectId });

        console.groupCollapsed(`🔧 [${id}] Runtime.callFunctionOn`);
        console.log('%c Function:', 'color: #ff6b6b; font-weight: bold');
        console.log(fn);
        if (params?.objectId) console.log('objectId:', params.objectId);
        if (params?.arguments) console.log('arguments:', JSON.stringify(params.arguments));
        if (params?.returnByValue !== undefined) console.log('returnByValue:', params.returnByValue);
        console.groupEnd();

        // Also log a one-liner summary outside the group
        console.log(`  🔧 [${id}] callFunctionOn: ${fnShort}`);
      }

      // Runtime.evaluate — ALWAYS show expression
      else if (method === 'Runtime.evaluate') {
        const expr = params?.expression || '';
        const exprShort = expr.length > 200 ? expr.substring(0, 200) + '...' : expr;

        console.groupCollapsed(`💻 [${id}] Runtime.evaluate`);
        console.log('%c Expression:', 'color: #ff6b6b; font-weight: bold');
        console.log(expr);
        console.groupEnd();

        console.log(`  💻 [${id}] evaluate: ${exprShort}`);
      }

      // Emulation
      else if (method === 'Emulation.setDeviceMetricsOverride') {
        console.log(`📐 [${id}] Emulation.setDeviceMetricsOverride:`,
          `${params?.width}x${params?.height}, scale=${params?.deviceScaleFactor}, mobile=${params?.mobile}`);
      }
      else if (method === 'Emulation.clearDeviceMetricsOverride') {
        console.log(`📐 [${id}] Emulation.clearDeviceMetricsOverride`);
      }

      // DOM.getBoxModel
      else if (method === 'DOM.getBoxModel') {
        console.log(`📦 [${id}] DOM.getBoxModel nodeId=${params?.nodeId} backendNodeId=${params?.backendNodeId}`);
      }

      // DOM.resolveNode
      else if (method === 'DOM.resolveNode') {
        console.log(`🔗 [${id}] DOM.resolveNode nodeId=${params?.nodeId} backendNodeId=${params?.backendNodeId}`);
      }

      // DOM.describeNode
      else if (method === 'DOM.describeNode') {
        console.log(`🏷️ [${id}] DOM.describeNode nodeId=${params?.nodeId}`);
      }

      // DOM.querySelector
      else if (method === 'DOM.querySelector') {
        console.log(`🔍 [${id}] DOM.querySelector nodeId=${params?.nodeId} selector="${params?.selector}"`);
      }

      // CSS methods
      else if (method === 'CSS.getPlatformFontsForNode') {
        console.log(`🔤 [${id}] CSS.getPlatformFontsForNode nodeId=${params?.nodeId}`);
      }
      else if (method === 'CSS.getMatchedStylesForNode') {
        console.log(`🎨 [${id}] CSS.getMatchedStylesForNode nodeId=${params?.nodeId}`);
      }
      else if (method === 'CSS.getComputedStyleForNode') {
        console.log(`🎨 [${id}] CSS.getComputedStyleForNode nodeId=${params?.nodeId}`);
      }

      // Everything else that's hot
      else {
        console.log(`📡 [${id}] ${method}`, params || '');
      }
    }

    // Non-hot methods — just count (no log spam)

    // === INTERCEPT RESULT ===
    const wrappedCallback = function(result) {
      if (!isHot) {
        if (callback) callback(result);
        return;
      }

      // Runtime.callFunctionOn — ALWAYS log result (v2 key change)
      if (method === 'Runtime.callFunctionOn') {
        const val = result?.result?.value;
        const type = result?.result?.type;
        const subtype = result?.result?.subtype;
        if (val !== undefined && val !== null) {
          console.log(`%c  ← [${id}] callFunctionOn RESULT:`, 'color: #2ecc71; font-weight: bold', val);
        } else if (result?.result?.objectId) {
          console.log(`%c  ← [${id}] callFunctionOn → object:`, 'color: #2ecc71',
            `type=${type} subtype=${subtype} objectId=${result.result.objectId.substring(0, 40)}...`);
        } else if (type === 'undefined') {
          console.log(`  ← [${id}] callFunctionOn → undefined`);
        } else {
          console.log(`  ← [${id}] callFunctionOn →`, result?.result);
        }
      }

      // Runtime.evaluate — ALWAYS log result
      if (method === 'Runtime.evaluate') {
        const val = result?.result?.value;
        if (val !== undefined && val !== null) {
          console.log(`%c  ← [${id}] evaluate RESULT:`, 'color: #2ecc71; font-weight: bold', val);
        } else if (result?.result?.objectId) {
          console.log(`  ← [${id}] evaluate → objectId=${result.result.objectId.substring(0, 40)}...`);
        }
      }

      // DOM.getBoxModel
      if (method === 'DOM.getBoxModel' && result?.model) {
        console.log(`%c  ← [${id}] getBoxModel: w=${result.model.width} h=${result.model.height}`,
          'color: #2ecc71; font-weight: bold',
          `content=[${result.model.content.join(',')}]`);
      }

      // DOM.resolveNode
      if (method === 'DOM.resolveNode' && result?.object) {
        console.log(`  ← [${id}] resolveNode → ${result.object.className || result.object.description || ''} objectId=${result.object.objectId?.substring(0, 40)}...`);
      }

      // DOM.describeNode — show nodeName, nodeType, backendNodeId
      if (method === 'DOM.describeNode' && result?.node) {
        const n = result.node;
        console.log(`%c  ← [${id}] describeNode: <${n.nodeName}> type=${n.nodeType} backendNodeId=${n.backendNodeId}`,
          'color: #3498db',
          n.attributes ? `attrs=[${n.attributes.join(',')}]` : '');
      }

      // CSS.getPlatformFontsForNode
      if (method === 'CSS.getPlatformFontsForNode' && result?.fonts) {
        console.log(`  ← [${id}] fonts:`,
          result.fonts.map(f => `${f.familyName}(${f.glyphCount})`).join(', '));
      }

      if (callback) callback(result);
    };

    // Call original
    if (callback) {
      return _origSendCommand.call(chrome.debugger, target, method, params, wrappedCallback);
    } else {
      return _origSendCommand.call(chrome.debugger, target, method, params).then(result => {
        wrappedCallback(result);
        return result;
      }).catch(err => {
        if (isHot) {
          console.log(`%c ✗ [${id}] ${method} ERROR:`, 'color: #e74c3c', err.message);
        }
        throw err;
      });
    }
  };

  // Global function to print summary
  self.__h2dSpySummary = function() {
    console.log('%c\n═══ h2d CDP Spy Summary ═══', 'color: #f39c12; font-size: 14px; font-weight: bold');
    console.log(`Total calls: ${callCounter}`);
    console.log('\nMethod counts:');
    const sorted = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);
    for (const [method, count] of sorted) {
      console.log(`  ${count}x  ${method}`);
    }
    console.log(`\ncallFunctionOn bodies (${callFnBodies.length} total):`);
    for (const { id, fn } of callFnBodies) {
      console.log(`  [${id}]`, fn.substring(0, 120));
    }
  };

  console.log('%c ✅ h2d CDP Spy v2 installed!', 'color: #2ecc71; font-size: 16px; font-weight: bold');
  console.log('%c ყველა Runtime.callFunctionOn/evaluate სრულად ლოგდება', 'color: #95a5a6');
  console.log('%c Import-ის შემდეგ __h2dSpySummary() გამოიძახე summary-სთვის', 'color: #f39c12');
  console.log('');
})();
