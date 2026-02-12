/**
 * DOMSnapshot - Bulk extraction using CDP DOMSnapshot.captureSnapshot
 *
 * This is the efficient approach:
 * - Single CDP call for entire page
 * - Gets layout, bounding boxes, computed styles
 * - Use getMatchedStylesForNode only for nodes with gradients/variables
 */

/**
 * Properties we need for wireframe extraction
 */
const SNAPSHOT_COMPUTED_STYLES = [
  // Layout
  "display",
  "position",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "align-self",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "grid-template-columns",
  "grid-template-rows",
  "grid-auto-flow",
  "gap",
  "row-gap",
  "column-gap",

  // Box model
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",

  // Background
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",

  // Border
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-style",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",

  // Typography
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "color",

  // List styling
  "list-style-type",
  "list-style-position",

  // Visual
  "opacity",
  "visibility",
  "overflow",
  "box-shadow",
  "z-index",
  "transform",

  // Effects
  "backdrop-filter",
  "filter",
];

/**
 * @typedef {Object} ParsedSnapshotNode
 * @property {number} index
 * @property {number} backendNodeId
 * @property {number} nodeType
 * @property {string} nodeName
 * @property {number} parentIndex
 * @property {Record<string, string>} attributes
 * @property {{x: number, y: number, width: number, height: number} | null} bounds
 * @property {Record<string, string>} computedStyles
 * @property {string} textContent
 * @property {boolean} isClickable
 * @property {boolean} needsMatchedStyles
 */

/**
 * @typedef {Object} CaptureSnapshotResult
 * @property {Object[]} documents
 * @property {string[]} strings
 */

/**
 * Capture page snapshot using DOMSnapshot.captureSnapshot
 * This is ONE CDP call that gets everything!
 * @param {import('./client').CDPClient} client
 * @returns {Promise<CaptureSnapshotResult>}
 */
async function captureSnapshot(client) {
  const result = await client.send("DOMSnapshot.captureSnapshot", {
    computedStyles: SNAPSHOT_COMPUTED_STYLES,
    includeDOMRects: true,
    includePaintOrder: true,
    includeBlendedBackgroundColors: true,
    includeTextColorOpacities: true,
  });

  return result;
}

/**
 * Parse snapshot into usable node structures
 * @param {CaptureSnapshotResult} snapshot
 * @returns {{nodes: ParsedSnapshotNode[], strings: string[], nodesByBackendId: Map<number, ParsedSnapshotNode>}}
 */
function parseSnapshot(snapshot) {
  const { documents, strings } = snapshot;
  const doc = documents[0]; // Main document
  /** @type {ParsedSnapshotNode[]} */
  const nodes = [];
  /** @type {Map<number, ParsedSnapshotNode>} */
  const nodesByBackendId = new Map();

  const { nodes: nodeTree, layout } = doc;
  const nodeCount = nodeTree.parentIndex.length;

  // Build layout index map (nodeIndex -> layoutIndex)
  /** @type {Map<number, number>} */
  const layoutByNodeIndex = new Map();
  for (let i = 0; i < layout.nodeIndex.length; i++) {
    layoutByNodeIndex.set(layout.nodeIndex[i], i);
  }

  // Parse each node
  for (let i = 0; i < nodeCount; i++) {
    const nodeName = strings[nodeTree.nodeName[i]] || "";
    const nodeType = nodeTree.nodeType[i];
    const backendNodeId = nodeTree.backendNodeId[i];
    const parentIndex = nodeTree.parentIndex[i];

    // Parse attributes
    /** @type {Record<string, string>} */
    const attributes = {};
    const attrIndices = nodeTree.attributes[i] || [];
    for (let j = 0; j < attrIndices.length; j += 2) {
      const name = strings[attrIndices[j]];
      const value = strings[attrIndices[j + 1]];
      if (name) attributes[name] = value || "";
    }

    // Get layout info
    /** @type {{x: number, y: number, width: number, height: number} | null} */
    let bounds = null;
    /** @type {Record<string, string>} */
    const computedStyles = {};
    let textContent = "";

    const layoutIndex = layoutByNodeIndex.get(i);
    if (layoutIndex !== undefined) {
      // Bounds: [x, y, width, height]
      const boundsArr = layout.bounds[layoutIndex];
      if (boundsArr && boundsArr.length >= 4) {
        bounds = {
          x: boundsArr[0],
          y: boundsArr[1],
          width: boundsArr[2],
          height: boundsArr[3],
        };
      }

      // Computed styles
      const styleIndices = layout.styles[layoutIndex] || [];
      for (let j = 0; j < styleIndices.length; j++) {
        const propName = SNAPSHOT_COMPUTED_STYLES[j];
        const propValue = strings[styleIndices[j]];
        if (propName && propValue) {
          computedStyles[propName] = propValue;
        }
      }

      // Text content from layout
      const textIndex = layout.text[layoutIndex];
      if (textIndex !== undefined && textIndex >= 0) {
        textContent = strings[textIndex] || "";
      }
    }

    // For TEXT_NODEs (nodeType 3), get text from nodeValue
    if (nodeType === 3) {
      const nodeValueIndex = nodeTree.nodeValue[i];
      if (nodeValueIndex !== undefined && nodeValueIndex >= 0) {
        textContent = strings[nodeValueIndex] || "";
      }
    }

    // For input/textarea, get value from inputValue
    if (
      nodeTree.inputValue &&
      (nodeName.toLowerCase() === "input" || nodeName.toLowerCase() === "textarea")
    ) {
      const inputEntry = nodeTree.inputValue.find((entry) => entry.index === i);
      if (inputEntry && inputEntry.value >= 0) {
        textContent = strings[inputEntry.value] || "";
      }
    }

    // Check if clickable
    const clickableIndices = nodeTree.isClickable
      ? Array.from(nodeTree.isClickable)
      : [];
    const isClickable = clickableIndices.indexOf(i) !== -1;

    // Check if needs matched styles (has gradient or CSS variable)
    const bgImage = computedStyles["background-image"] || "";
    const bgColor = computedStyles["background-color"] || "";
    const needsMatchedStyles =
      bgImage.includes("gradient") ||
      bgImage.includes("var(") ||
      bgColor.includes("var(");

    /** @type {ParsedSnapshotNode} */
    const parsedNode = {
      index: i,
      backendNodeId,
      nodeType,
      nodeName: nodeName.toLowerCase(),
      parentIndex,
      attributes,
      bounds,
      computedStyles,
      textContent,
      isClickable,
      needsMatchedStyles,
    };

    nodes.push(parsedNode);
    nodesByBackendId.set(backendNodeId, parsedNode);
  }

  return { nodes, strings, nodesByBackendId };
}

/**
 * Build element tree from parsed snapshot nodes
 * @param {ParsedSnapshotNode[]} nodes
 * @returns {Map<number, number[]>}
 */
function buildTreeFromSnapshot(nodes) {
  /** @type {Map<number, number[]>} */
  const childrenMap = new Map();

  for (const node of nodes) {
    const parentIdx = node.parentIndex;
    if (parentIdx >= 0) {
      if (!childrenMap.has(parentIdx)) {
        childrenMap.set(parentIdx, []);
      }
      childrenMap.get(parentIdx).push(node.index);
    }
  }

  return childrenMap;
}

/**
 * Find nodes that need CSS.getMatchedStylesForNode
 * @param {ParsedSnapshotNode[]} nodes
 * @returns {ParsedSnapshotNode[]}
 */
function findNodesNeedingMatchedStyles(nodes) {
  return nodes.filter((node) => {
    // Skip non-element nodes
    if (node.nodeType !== 1) return false;

    // Skip invisible nodes
    if (!node.bounds || node.bounds.width < 1 || node.bounds.height < 1)
      return false;

    // Always include HTML and BODY - they often have background gradients via shorthand
    const tag = node.nodeName;
    if (tag === "html" || tag === "body") return true;

    // Check for gradients or CSS variables in background-image OR background shorthand
    const bgImage = node.computedStyles["background-image"] || "";
    const bgColor = node.computedStyles["background-color"] || "";
    const bgShorthand = node.computedStyles["background"] || "";

    if (bgImage.includes("gradient") || bgShorthand.includes("gradient")) return true;
    if (bgImage.includes("var(") || bgColor.includes("var(") || bgShorthand.includes("var(")) return true;

    // Interactive elements
    if (tag === "button" || tag === "a") return true;
    if (node.attributes.role === "button") return true;

    // Include semantic container elements (often have margin: auto centering)
    if (tag === "section" || tag === "main" || tag === "article" || tag === "aside") return true;
    if (tag === "header" || tag === "footer" || tag === "nav") return true;

    // Include divs with common container class names (might have margin: auto)
    const className = (node.attributes.class || "").toLowerCase();
    if (tag === "div" && (
      className.includes("container") ||
      className.includes("wrapper") ||
      className.includes("content") ||
      className.includes("inner") ||
      className.includes("main")
    )) return true;

    // IMPORTANT: Check for potential margin: auto centering on ANY element
    // If computed marginLeft equals marginRight and both > 0, likely has margin: auto
    const marginLeft = parseFloat(node.computedStyles["margin-left"] || "0");
    const marginRight = parseFloat(node.computedStyles["margin-right"] || "0");
    if (marginLeft > 0 && marginRight > 0 && Math.abs(marginLeft - marginRight) < 2) {
      return true; // Likely centered with margin: auto
    }

    // Check for any non-none box-shadow (need matched styles for accurate values)
    const boxShadow = node.computedStyles["box-shadow"] || "";
    if (boxShadow && boxShadow !== "none") return true;

    // Backdrop-filter (glassmorphism)
    const backdropFilter = node.computedStyles["backdrop-filter"] || "";
    if (backdropFilter && backdropFilter !== "none") return true;

    // Semi-transparent backgrounds
    if (bgColor.includes("rgba") && !bgColor.includes("rgba(0, 0, 0, 0)")) {
      const alphaMatch = bgColor.match(/rgba\([^)]+,\s*([\d.]+)\)/);
      if (alphaMatch && parseFloat(alphaMatch[1]) < 1) {
        return true;
      }
    }

    // Non-zero borders
    const borderWidth = node.computedStyles["border-width"] || "";
    const borderTop = node.computedStyles["border-top-width"] || "";
    if (borderWidth || borderTop) {
      const width = parseFloat(borderWidth) || parseFloat(borderTop);
      if (width > 0) return true;
    }

    return false;
  });
}

/**
 * Get nodeId from backendNodeId (needed for CSS.getMatchedStylesForNode)
 * @param {import('./client').CDPClient} client
 * @param {number[]} backendNodeIds
 * @returns {Promise<Map<number, number>>}
 */
async function resolveNodeIds(client, backendNodeIds) {
  /** @type {Map<number, number>} */
  const nodeIdMap = new Map();

  try {
    const result = await client.send("DOM.pushNodesByBackendIdsToFrontend", {
      backendNodeIds,
    });

    for (let i = 0; i < backendNodeIds.length; i++) {
      if (result.nodeIds[i] > 0) {
        nodeIdMap.set(backendNodeIds[i], result.nodeIds[i]);
      }
    }
  } catch (e) {
    console.warn("Failed to resolve node IDs:", e);
  }

  return nodeIdMap;
}

module.exports = {
  SNAPSHOT_COMPUTED_STYLES,
  captureSnapshot,
  parseSnapshot,
  buildTreeFromSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
};
