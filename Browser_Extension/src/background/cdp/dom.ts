/**
 * DOM extraction using CDP
 */

import { CDPClient } from "./client";
import type { CDPNode } from "@/shared/types";

interface GetDocumentResult {
  root: CDPNode;
}

interface GetBoxModelResult {
  model: {
    content: number[];
    padding: number[];
    border: number[];
    margin: number[];
    width: number;
    height: number;
  };
}

interface GetOuterHTMLResult {
  outerHTML: string;
}

/**
 * Get the full DOM document tree
 */
export async function getDocument(
  client: CDPClient,
  depth = -1,
  pierce = true
): Promise<CDPNode> {
  const result = await client.send<GetDocumentResult>("DOM.getDocument", {
    depth,
    pierce, // Pierce through shadow DOM and iframes
  });
  return result.root;
}

/**
 * Get box model for a node
 */
export async function getBoxModel(
  client: CDPClient,
  nodeId: number
): Promise<GetBoxModelResult["model"] | null> {
  try {
    const result = await client.send<GetBoxModelResult>("DOM.getBoxModel", {
      nodeId,
    });
    return result.model;
  } catch {
    // Node might not be visible or doesn't have a box model
    return null;
  }
}

/**
 * Get outer HTML of a node
 */
export async function getOuterHTML(
  client: CDPClient,
  nodeId: number
): Promise<string> {
  const result = await client.send<GetOuterHTMLResult>("DOM.getOuterHTML", {
    nodeId,
  });
  return result.outerHTML;
}

/**
 * Query selector on a node
 */
export async function querySelector(
  client: CDPClient,
  nodeId: number,
  selector: string
): Promise<number> {
  const result = await client.send<{ nodeId: number }>("DOM.querySelector", {
    nodeId,
    selector,
  });
  return result.nodeId;
}

/**
 * Query selector all on a node
 */
export async function querySelectorAll(
  client: CDPClient,
  nodeId: number,
  selector: string
): Promise<number[]> {
  const result = await client.send<{ nodeIds: number[] }>("DOM.querySelectorAll", {
    nodeId,
    selector,
  });
  return result.nodeIds;
}

/**
 * Get attributes of a node
 */
export async function getAttributes(
  client: CDPClient,
  nodeId: number
): Promise<Record<string, string>> {
  try {
    const result = await client.send<{ attributes: string[] }>("DOM.getAttributes", {
      nodeId,
    });

    const attrs: Record<string, string> = {};
    for (let i = 0; i < result.attributes.length; i += 2) {
      attrs[result.attributes[i]] = result.attributes[i + 1];
    }
    return attrs;
  } catch {
    return {};
  }
}

/**
 * Request child nodes for a node (expands the tree)
 */
export async function requestChildNodes(
  client: CDPClient,
  nodeId: number,
  depth = -1,
  pierce = true
): Promise<void> {
  await client.send("DOM.requestChildNodes", {
    nodeId,
    depth,
    pierce,
  });
}

/**
 * Describe a node (get detailed info)
 */
export async function describeNode(
  client: CDPClient,
  nodeId: number
): Promise<CDPNode> {
  const result = await client.send<{ node: CDPNode }>("DOM.describeNode", {
    nodeId,
    depth: 0,
  });
  return result.node;
}

/**
 * Get the document's scroll dimensions
 */
export async function getScrollDimensions(
  client: CDPClient
): Promise<{ width: number; height: number }> {
  const result = await client.send<{ result: { value: { width: number; height: number } } }>(
    "Runtime.evaluate",
    {
      expression: `({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      })`,
      returnByValue: true,
    }
  );
  return result.result.value;
}
