/**
 * DOMSnapshot - Bulk extraction using CDP DOMSnapshot.captureSnapshot
 *
 * This is the efficient approach:
 * - Single CDP call for entire page
 * - Gets layout, bounding boxes, computed styles
 * - Use getMatchedStylesForNode only for nodes with gradients/variables
 */

import { CDPClient } from "./client";

/**
 * Properties we need for wireframe extraction
 */
export const SNAPSHOT_COMPUTED_STYLES = [
  // Layout
  "display",
  "position",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
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

  // Visual
  "opacity",
  "visibility",
  "overflow",
  "box-shadow",
  "z-index",
  "transform",
];

/**
 * DOMSnapshot document result
 */
export interface SnapshotDocument {
  documentURL: { index: number };
  title: { index: number };
  baseURL: { index: number };
  contentLanguage: { index: number };
  encodingName: { index: number };
  publicId: { index: number };
  systemId: { index: number };
  frameId: { index: number };
  nodes: SnapshotNodeTree;
  layout: SnapshotLayout;
  textBoxes: SnapshotTextBoxes;
  scrollOffsetX: number;
  scrollOffsetY: number;
  contentWidth: number;
  contentHeight: number;
}

export interface SnapshotNodeTree {
  parentIndex: number[];
  nodeType: number[];
  shadowRootType?: { index: number; value: number }[];
  nodeName: number[];
  nodeValue: number[];
  backendNodeId: number[];
  attributes: number[][];
  textValue?: { index: number; value: number }[];
  inputValue?: { index: number; value: number }[];
  inputChecked?: { index: number; value: boolean }[];
  optionSelected?: { index: number; value: boolean }[];
  contentDocumentIndex?: { index: number; value: number }[];
  pseudoType?: { index: number; value: number }[];
  pseudoIdentifier?: { index: number; value: number }[];
  isClickable?: number[]; // RareBooleanData - just array of indices where true
  currentSourceURL?: { index: number; value: number }[];
  originURL?: { index: number; value: number }[];
}

export interface SnapshotLayout {
  nodeIndex: number[];
  styles: number[][];
  bounds: number[][];
  text: number[];
  stackingContexts: { index: number }[];
  paintOrders?: number[];
  offsetRects?: number[][];
  scrollRects?: number[][];
  clientRects?: number[][];
  blendedBackgroundColors?: number[];
  textColorOpacities?: number[];
}

export interface SnapshotTextBoxes {
  layoutIndex: number[];
  bounds: number[][];
  start: number[];
  length: number[];
}

export interface CaptureSnapshotResult {
  documents: SnapshotDocument[];
  strings: string[];
}

/**
 * Parsed node from snapshot
 */
export interface ParsedSnapshotNode {
  index: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  parentIndex: number;
  attributes: Record<string, string>;
  // Layout info
  bounds: { x: number; y: number; width: number; height: number } | null;
  // Computed styles
  computedStyles: Record<string, string>;
  // Text content
  textContent: string;
  // Flags
  isClickable: boolean;
  needsMatchedStyles: boolean; // Has gradient/variable that needs CSS.getMatchedStylesForNode
}

/**
 * Capture page snapshot using DOMSnapshot.captureSnapshot
 * This is ONE CDP call that gets everything!
 */
export async function captureSnapshot(
  client: CDPClient
): Promise<CaptureSnapshotResult> {
  const result = await client.send<CaptureSnapshotResult>(
    "DOMSnapshot.captureSnapshot",
    {
      computedStyles: SNAPSHOT_COMPUTED_STYLES,
      includeDOMRects: true,
      includePaintOrder: true,
      includeBlendedBackgroundColors: true,
      includeTextColorOpacities: true,
    }
  );

  return result;
}

/**
 * Parse snapshot into usable node structures
 */
export function parseSnapshot(snapshot: CaptureSnapshotResult): {
  nodes: ParsedSnapshotNode[];
  strings: string[];
  nodesByBackendId: Map<number, ParsedSnapshotNode>;
} {
  const { documents, strings } = snapshot;
  const doc = documents[0]; // Main document
  const nodes: ParsedSnapshotNode[] = [];
  const nodesByBackendId = new Map<number, ParsedSnapshotNode>();

  const { nodes: nodeTree, layout } = doc;
  const nodeCount = nodeTree.parentIndex.length;

  // Build layout index map (nodeIndex -> layoutIndex)
  const layoutByNodeIndex = new Map<number, number>();
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
    const attributes: Record<string, string> = {};
    const attrIndices = nodeTree.attributes[i] || [];
    for (let j = 0; j < attrIndices.length; j += 2) {
      const name = strings[attrIndices[j]];
      const value = strings[attrIndices[j + 1]];
      if (name) attributes[name] = value || "";
    }

    // Get layout info
    let bounds: { x: number; y: number; width: number; height: number } | null =
      null;
    const computedStyles: Record<string, string> = {};
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

      // Text content from layout (rendered text)
      const textIndex = layout.text[layoutIndex];
      if (textIndex !== undefined && textIndex >= 0) {
        textContent = strings[textIndex] || "";
      }
    }

    // For TEXT_NODEs (nodeType 3), get text from nodeValue array
    if (nodeType === 3) {
      const nodeValueIndex = nodeTree.nodeValue[i];
      if (nodeValueIndex !== undefined && nodeValueIndex >= 0) {
        textContent = strings[nodeValueIndex] || "";
      }
    }

    // For input/textarea elements, get value from inputValue
    if (nodeTree.inputValue && (nodeName.toLowerCase() === "input" || nodeName.toLowerCase() === "textarea")) {
      const inputEntry = nodeTree.inputValue.find(entry => entry.index === i);
      if (inputEntry && inputEntry.value >= 0) {
        textContent = strings[inputEntry.value] || "";
      }
    }

    // Check if clickable (isClickable is RareBooleanData - array of indices where true)
    // Use Array.from to ensure it's a proper array, as CDP might return array-like object
    const clickableIndices = nodeTree.isClickable ? Array.from(nodeTree.isClickable) : [];
    const isClickable = clickableIndices.indexOf(i) !== -1;

    // Check if needs matched styles (has gradient or CSS variable)
    const bgImage = computedStyles["background-image"] || "";
    const bgColor = computedStyles["background-color"] || "";
    const needsMatchedStyles =
      bgImage.includes("gradient") ||
      bgImage.includes("var(") ||
      bgColor.includes("var(");

    const parsedNode: ParsedSnapshotNode = {
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
 */
export function buildTreeFromSnapshot(
  nodes: ParsedSnapshotNode[]
): Map<number, number[]> {
  const childrenMap = new Map<number, number[]>();

  for (const node of nodes) {
    const parentIdx = node.parentIndex;
    if (parentIdx >= 0) {
      if (!childrenMap.has(parentIdx)) {
        childrenMap.set(parentIdx, []);
      }
      childrenMap.get(parentIdx)!.push(node.index);
    }
  }

  return childrenMap;
}

/**
 * Find nodes that need CSS.getMatchedStylesForNode
 * (nodes with gradients, CSS variables, hover states)
 */
export function findNodesNeedingMatchedStyles(
  nodes: ParsedSnapshotNode[]
): ParsedSnapshotNode[] {
  return nodes.filter((node) => {
    // Skip non-element nodes
    if (node.nodeType !== 1) return false;

    // Skip invisible nodes
    if (!node.bounds || node.bounds.width < 1 || node.bounds.height < 1)
      return false;

    // Check for gradients or CSS variables in background
    const bgImage = node.computedStyles["background-image"] || "";
    const bgColor = node.computedStyles["background-color"] || "";

    if (bgImage.includes("gradient")) return true;
    if (bgImage.includes("var(") || bgColor.includes("var(")) return true;

    // Check for interactive elements that might have hover states
    const tag = node.nodeName;
    if (tag === "button" || tag === "a") return true;
    if (node.attributes.role === "button") return true;

    // Check for box-shadow with CSS variable
    const boxShadow = node.computedStyles["box-shadow"] || "";
    if (boxShadow.includes("var(")) return true;

    return false;
  });
}

/**
 * Get nodeId from backendNodeId (needed for CSS.getMatchedStylesForNode)
 */
export async function resolveNodeIds(
  client: CDPClient,
  backendNodeIds: number[]
): Promise<Map<number, number>> {
  const nodeIdMap = new Map<number, number>();

  // Batch resolve using DOM.pushNodesByBackendIdsToFrontend
  try {
    const result = await client.send<{ nodeIds: number[] }>(
      "DOM.pushNodesByBackendIdsToFrontend",
      { backendNodeIds }
    );

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
