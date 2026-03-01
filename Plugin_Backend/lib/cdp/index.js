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

    // === DEBUG: Log raw CDP snapshot bounds + computed styles (first 10 elements) ===
    let debugCount = 0;
    console.log(`[DEBUG-CDP] Total parsed nodes: ${nodes.length}`);
    for (const node of nodes) {
      if (node.bounds && node.nodeType === 1 && debugCount < 10) {
        const csW = node.computedStyles?.["width"] || "N/A";
        const csH = node.computedStyles?.["height"] || "N/A";
        const csPL = node.computedStyles?.["padding-left"] || "0";
        const csPR = node.computedStyles?.["padding-right"] || "0";
        const csBL = node.computedStyles?.["border-left-width"] || "0";
        const csBR = node.computedStyles?.["border-right-width"] || "0";
        console.log(`[DEBUG-CDP] ${node.nodeName} | bounds: w=${node.bounds.width} h=${node.bounds.height} (INT) | computedStyles: width="${csW}" height="${csH}" pL="${csPL}" pR="${csPR}" bL="${csBL}" bR="${csBR}"`);
        debugCount++;
      }
    }
    // === END DEBUG ===

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
      browserDpr: 1, // Puppeteer at deviceScaleFactor:1; sub-pixel from computedStyles
    });

    // === DEBUG: Log buildElementTree output dimensions ===
    const logTreeDimensions = (el, prefix = "", maxDepth = 3) => {
      if (!el || maxDepth <= 0) return;
      console.log(`[DEBUG-TREE] ${prefix}${el.name || el.tag}: w=${el.width} h=${el.height} (hasDecimal: w=${el.width % 1 !== 0}, h=${el.height % 1 !== 0})`);
      if (el.children) {
        for (const child of el.children.slice(0, 5)) {
          logTreeDimensions(child, prefix + "  ", maxDepth - 1);
        }
      }
    };
    console.log(`[DEBUG-TREE] === buildElementTree output (browserDpr=1) ===`);
    logTreeDimensions(tree);
    // === END DEBUG ===

    return { tree, cssVariables };
  } finally {
    await client.detach();
  }
}

module.exports = {
  extractDOMTreeWithCDP,
  createCDPClient,
};
