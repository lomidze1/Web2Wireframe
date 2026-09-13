/**
 * Same-page `#anchor` links → ON_CLICK prototype reactions, and one prototype
 * starting point per imported frame (h2d parity).
 *
 * Without these an imported wireframe is dead in Presentation mode: nothing to
 * press Play on, and every in-page nav link (`#pricing`, `#faq`) goes nowhere.
 *
 * Two-step, because a Figma node id only exists once the node is rendered:
 *
 *   1. `registerAnchorNode` is called for every (WireframeNode, SceneNode) pair
 *      as the tree renders — collecting targets (`anchorId`) and links
 *      (`linkAnchorId`) in one pass, no second walk.
 *   2. `resolveAnchorReactions` runs when the frame is finished and matches the
 *      two together.
 *
 * The scope is PER VIEWPORT FRAME, never global. Desktop and mobile captures of
 * the same page both contain `id="faq"`; a shared map would wire the mobile nav
 * to the desktop section and SCROLL_TO would jump between frames.
 */

import type { AnchorScope, WireframeNode } from "../types";
import { logger } from "../utils/logger";

export type { AnchorScope };

export function createAnchorScope(): AnchorScope {
  return { targets: new Map(), pending: [] };
}

/**
 * Record one rendered node's anchor role(s). A node can be both — `<a id="top"
 * href="#faq">` is a target and a link.
 */
export function registerAnchorNode(
  scope: AnchorScope,
  node: WireframeNode,
  created: SceneNode,
): void {
  if (node.anchorId && !scope.targets.has(node.anchorId)) {
    scope.targets.set(node.anchorId, created.id);
  }
  if (node.linkAnchorId) {
    scope.pending.push({ node: created, hash: node.linkAnchorId });
  }
}

/**
 * MERGE an ON_CLICK reaction onto a node, keeping whatever it already carries.
 *
 * Mirrors `attachLinkReaction` in nodes.ts. Assigning instead of merging would
 * silently delete the ON_HOVER reactions hoverConsolidation puts on these same
 * nodes — a link inside a hover component would lose its hover prototype.
 */
async function attachScrollToReaction(target: SceneNode, destinationId: string): Promise<boolean> {
  const holder = target as unknown as {
    reactions?: readonly Reaction[];
    setReactionsAsync?: (r: Reaction[]) => Promise<void>;
  };
  const existing: Reaction[] = Array.isArray(holder.reactions) ? [...holder.reactions] : [];

  // The same node can be registered twice (a re-rendered link, or a hover
  // variant sharing the frame) — don't stack duplicate click targets.
  const alreadyLinked = existing.some((r) =>
    (r.actions ?? []).some(
      (a) =>
        (a as { type?: string }).type === "NODE" &&
        (a as { destinationId?: string }).destinationId === destinationId,
    ),
  );
  if (alreadyLinked) return false;

  const reactions = [
    ...existing,
    {
      trigger: { type: "ON_CLICK" },
      actions: [
        {
          type: "NODE",
          navigation: "SCROLL_TO",
          destinationId,
          transition: null,
        },
      ],
    },
  ] as unknown as Reaction[];

  if (typeof holder.setReactionsAsync === "function") {
    await holder.setReactionsAsync(reactions);
  } else {
    (target as unknown as { reactions: Reaction[] }).reactions = reactions;
  }
  return true;
}

/**
 * Resolve every pending `#hash` against the scope's target map.
 *
 * A hash with no match is dropped silently — normal on a partial capture (the
 * section was below the capture cut, or lives on another page entirely), not an
 * error. Each attach is isolated so one unreachable destination cannot cost us
 * the remaining links.
 *
 * Returns the number of reactions actually attached.
 */
export async function resolveAnchorReactions(scope: AnchorScope): Promise<number> {
  let wired = 0;
  let unresolved = 0;

  for (const { node, hash } of scope.pending) {
    const destinationId = scope.targets.get(hash);
    if (!destinationId) {
      unresolved += 1;
      continue;
    }
    try {
      if (await attachScrollToReaction(node, destinationId)) wired += 1;
    } catch {
      // A prototype link is a nice-to-have — never fail the node over it.
    }
  }

  if (wired > 0 || unresolved > 0) {
    logger.info("Wired same-page anchor links", {
      wired,
      unresolved,
      targets: scope.targets.size,
    });
  }
  return wired;
}

/**
 * Register each imported frame as a prototype starting point, so Presentation
 * mode has an entry per viewport.
 *
 * APPENDS — the flows the designer built on this page are theirs. A frame we
 * already registered is refreshed in place rather than duplicated, which keeps
 * re-imports idempotent.
 */
export function registerFlowStartingPoints(frames: readonly FrameNode[]): void {
  if (frames.length === 0) return;
  try {
    const page = figma.currentPage;
    const incoming = frames.map((f) => ({ nodeId: f.id, name: f.name }));
    const incomingIds = new Set(incoming.map((e) => e.nodeId));
    const existing = Array.isArray(page.flowStartingPoints) ? page.flowStartingPoints : [];
    page.flowStartingPoints = [
      ...existing.filter((e) => !incomingIds.has(e.nodeId)),
      ...incoming,
    ];
  } catch (err) {
    // Some hosts (and the test mocks) reject the assignment. An import must
    // never fail over a prototype nicety.
    logger.warn("Could not register prototype starting points", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
