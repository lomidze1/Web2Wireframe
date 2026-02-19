/**
 * CDP Extraction Module for Puppeteer
 *
 * Uses shared-extraction package for unified extraction logic.
 * This produces IDENTICAL results to Browser Extension extraction.
 *
 * Key architecture:
 * - shared-extraction: Core CDP → ExtractedElement conversion (unified)
 * - This file: Puppeteer-specific wrapper + legacy post-processing options
 */

const { createCDPClient } = require("./client");

// Import from shared-extraction package (unified with Browser Extension)
const {
  // Snapshot
  captureSnapshot,
  parseSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
  // CSS
  getMatchedStylesForNode,
  extractCSSVariables,
  extractBackgroundFromCSS,
  // Tree builder
  buildElementTree,
} = require("shared-extraction");

/**
 * Extract DOM tree using CDP with shared-extraction logic
 *
 * This is the main extraction function that produces IDENTICAL results
 * to Browser Extension extraction.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page object
 * @param {Object} options
 * @param {number} [options.viewportWidth=1440] - Viewport width
 * @returns {Promise<import('shared-extraction').ExtractedElement>}
 */
async function extractDOMTreeWithCDP(page, options = {}) {
  const { viewportWidth = 1440 } = options;

  // Create CDP client (implements CDPClientInterface)
  const client = await createCDPClient(page);

  try {
    // 1. Capture page snapshot (ONE CDP call for entire page)
    const snapshot = await captureSnapshot(client);

    // 2. Parse snapshot into usable structures
    const { nodes, nodesByBackendId } = parseSnapshot(snapshot);

    // 3. Find nodes that need getMatchedStylesForNode (gradients, variables)
    const nodesNeedingStyles = findNodesNeedingMatchedStyles(nodes);

    // 4. Request DOM document (required for resolveNodeIds)
    await client.send("DOM.getDocument", { depth: 0 });

    // 5. Resolve nodeIds for matched style nodes
    const backendNodeIds = nodesNeedingStyles.map((n) => n.backendNodeId);
    const nodeIdMap = await resolveNodeIds(client, backendNodeIds);

    // 6. Get matched styles for nodes that need it
    /** @type {Map<number, import('shared-extraction').CDPMatchedStyles>} */
    const matchedStylesMap = new Map();

    for (const node of nodesNeedingStyles) {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (nodeId) {
        const matchedStyles = await getMatchedStylesForNode(client, nodeId);
        if (matchedStyles) {
          matchedStylesMap.set(node.backendNodeId, matchedStyles);
        }
      }
    }

    // 7. Extract CSS variables
    const cssVariables = await extractCSSVariables(client);
    const cssVariablesMap = new Map(cssVariables.map((v) => [v.name, v.value]));

    // 8. Get body original CSS (preserves gradient syntax)
    const bodyOriginalCSS = await extractBackgroundFromCSS(client, "body");

    // 9. Build element tree using shared-extraction (IDENTICAL to Browser Extension)
    const tree = buildElementTree(nodes, nodesByBackendId, matchedStylesMap, {
      viewportWidth,
      cssVariablesMap,
      bodyOriginalCSS,
      browserDpr: 1, // Puppeteer always uses deviceScaleFactor: 1
    });

    // DEBUG: Log _list_wflxa_58 element for comparison
    const debugElement = findElementByClass(tree, "_list_wflxa_58");
    if (debugElement) {
      console.log("[URL Import] _list_wflxa_58:");
      console.log(JSON.stringify(debugElement, null, 2));
    }

    return tree;
  } finally {
    await client.detach();
  }
}

/**
 * Find element by class name in tree (recursive)
 */
function findElementByClass(element, className) {
  if (element.className?.includes(className)) {
    return element;
  }
  for (const child of element.children || []) {
    const found = findElementByClass(child, className);
    if (found) return found;
  }
  return null;
}

module.exports = {
  extractDOMTreeWithCDP,
  createCDPClient,
};
