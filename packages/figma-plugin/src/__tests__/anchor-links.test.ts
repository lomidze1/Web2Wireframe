/**
 * Same-page `#anchor` → ON_CLICK prototype reactions (h2d parity).
 *
 * The converter stamps `linkAnchorId` on the `<a>` and `anchorId` on any element
 * that had an `id`. Node ids only exist once the node is rendered, so the wiring
 * happens in two steps: register pairs AS the tree renders, then resolve every
 * pending hash against the map when the frame is done.
 *
 * Two invariants this file locks down:
 * - MERGE, never assign. hoverConsolidation puts ON_HOVER reactions on these same
 *   nodes; overwriting would silently delete the hover prototype.
 * - Never throw. One unreachable destination must not cost us a node or abort the
 *   remaining links.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createAnchorScope,
  registerAnchorNode,
  resolveAnchorReactions,
  type AnchorScope,
} from "../rendering/anchorLinks";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function wfNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return { id: "wf-1", name: "node", type: "frame", tag: "div", ...overrides } as WireframeNode;
}

interface FakeNode {
  id: string;
  reactions: unknown[];
  setReactionsAsync: (r: unknown[]) => Promise<void>;
}

function fakeNode(id: string, initial: unknown[] = []): FakeNode {
  const n: FakeNode = {
    id,
    reactions: initial,
    setReactionsAsync: vi.fn(async (r: unknown[]) => {
      n.reactions = r;
    }),
  };
  return n;
}

const HOVER_REACTION = {
  trigger: { type: "ON_HOVER" },
  actions: [{ type: "NODE", destinationId: "hover-target", navigation: "CHANGE_TO" }],
};

/** Register a link node and its target into a fresh scope. */
function scopeWith(
  links: Array<{ node: FakeNode; hash: string }>,
  targets: Array<{ node: FakeNode; id: string }>,
): AnchorScope {
  const scope = createAnchorScope();
  for (const t of targets) {
    registerAnchorNode(scope, wfNode({ anchorId: t.id }), t.node as never);
  }
  for (const l of links) {
    registerAnchorNode(scope, wfNode({ linkAnchorId: l.hash }), l.node as never);
  }
  return scope;
}

// ---------------------------------------------------------------------------

describe("resolveAnchorReactions: wires #hash to its target node", () => {
  it("attaches ON_CLICK → NODE / SCROLL_TO with the target's id", async () => {
    const link = fakeNode("fig-link");
    const target = fakeNode("fig-faq");
    const wired = await resolveAnchorReactions(
      scopeWith([{ node: link, hash: "faq" }], [{ node: target, id: "faq" }]),
    );

    expect(wired).toBe(1);
    expect(link.reactions).toEqual([
      {
        trigger: { type: "ON_CLICK" },
        actions: [
          {
            type: "NODE",
            navigation: "SCROLL_TO",
            destinationId: "fig-faq",
            transition: null,
          },
        ],
      },
    ]);
  });

  it("works when the anchor is a TEXT node", async () => {
    const link = fakeNode("fig-text-link");
    const target = fakeNode("fig-pricing");
    await resolveAnchorReactions(
      scopeWith([{ node: link, hash: "pricing" }], [{ node: target, id: "pricing" }]),
    );
    expect(link.reactions).toHaveLength(1);
  });

  it("first registration wins when two elements share an id", async () => {
    const scope = createAnchorScope();
    registerAnchorNode(scope, wfNode({ anchorId: "dup" }), fakeNode("first") as never);
    registerAnchorNode(scope, wfNode({ anchorId: "dup" }), fakeNode("second") as never);
    const link = fakeNode("fig-link");
    registerAnchorNode(scope, wfNode({ linkAnchorId: "dup" }), link as never);

    await resolveAnchorReactions(scope);
    expect(
      (link.reactions[0] as { actions: Array<{ destinationId: string }> }).actions[0].destinationId,
    ).toBe("first");
  });
});

describe("resolveAnchorReactions: merges, never clobbers", () => {
  it("keeps an existing ON_HOVER reaction and adds the click", async () => {
    const link = fakeNode("fig-link", [HOVER_REACTION]);
    const target = fakeNode("fig-faq");
    await resolveAnchorReactions(
      scopeWith([{ node: link, hash: "faq" }], [{ node: target, id: "faq" }]),
    );

    expect(link.reactions).toHaveLength(2);
    expect(link.reactions[0]).toBe(HOVER_REACTION);
    expect((link.reactions[1] as { trigger: { type: string } }).trigger.type).toBe("ON_CLICK");
  });

  it("does not stack a duplicate click for the same destination", async () => {
    const link = fakeNode("fig-link");
    const target = fakeNode("fig-faq");
    const scope = scopeWith([{ node: link, hash: "faq" }], [{ node: target, id: "faq" }]);
    // Same node registered twice (re-render / hover variant sharing the frame).
    registerAnchorNode(scope, wfNode({ linkAnchorId: "faq" }), link as never);

    await resolveAnchorReactions(scope);
    expect(link.reactions).toHaveLength(1);
  });
});

describe("resolveAnchorReactions: an unresolvable link is not an error", () => {
  it("drops a hash with no matching target silently", async () => {
    const link = fakeNode("fig-link");
    const wired = await resolveAnchorReactions(scopeWith([{ node: link, hash: "ghost" }], []));

    expect(wired).toBe(0);
    expect(link.reactions).toEqual([]);
    expect(link.setReactionsAsync).not.toHaveBeenCalled();
  });

  it("still wires the other links when one target is missing", async () => {
    const good = fakeNode("fig-good");
    const orphan = fakeNode("fig-orphan");
    const target = fakeNode("fig-faq");
    const wired = await resolveAnchorReactions(
      scopeWith(
        [{ node: orphan, hash: "ghost" }, { node: good, hash: "faq" }],
        [{ node: target, id: "faq" }],
      ),
    );

    expect(wired).toBe(1);
    expect(good.reactions).toHaveLength(1);
    expect(orphan.reactions).toEqual([]);
  });

  it("survives a node whose setReactionsAsync rejects", async () => {
    const exploding = fakeNode("fig-boom");
    exploding.setReactionsAsync = vi.fn(async () => {
      throw new Error("destination not on this page");
    });
    const good = fakeNode("fig-good");
    const target = fakeNode("fig-faq");

    const wired = await resolveAnchorReactions(
      scopeWith(
        [{ node: exploding, hash: "faq" }, { node: good, hash: "faq" }],
        [{ node: target, id: "faq" }],
      ),
    );

    expect(wired).toBe(1);
    expect(good.reactions).toHaveLength(1);
  });

  it("falls back to assigning .reactions when setReactionsAsync is absent", async () => {
    const link = { id: "fig-link", reactions: [] as unknown[] };
    const target = fakeNode("fig-faq");
    const scope = createAnchorScope();
    registerAnchorNode(scope, wfNode({ anchorId: "faq" }), target as never);
    registerAnchorNode(scope, wfNode({ linkAnchorId: "faq" }), link as never);

    await resolveAnchorReactions(scope);
    expect(link.reactions).toHaveLength(1);
  });
});

describe("registerAnchorNode: ignores nodes that carry neither field", () => {
  it("records nothing for a plain div", () => {
    const scope = createAnchorScope();
    registerAnchorNode(scope, wfNode(), fakeNode("fig-div") as never);
    expect(scope.targets.size).toBe(0);
    expect(scope.pending).toHaveLength(0);
  });
});

describe("scopes are per-viewport-frame", () => {
  /**
   * Desktop and mobile frames both contain `id="faq"`. A shared map would wire
   * the mobile nav to the DESKTOP section and SCROLL_TO would jump frames.
   */
  it("does not leak a target across two scopes", async () => {
    const desktopLink = fakeNode("d-link");
    const desktopTarget = fakeNode("d-faq");
    const mobileLink = fakeNode("m-link");
    const mobileTarget = fakeNode("m-faq");

    await resolveAnchorReactions(
      scopeWith([{ node: desktopLink, hash: "faq" }], [{ node: desktopTarget, id: "faq" }]),
    );
    await resolveAnchorReactions(
      scopeWith([{ node: mobileLink, hash: "faq" }], [{ node: mobileTarget, id: "faq" }]),
    );

    const dest = (n: FakeNode): string =>
      (n.reactions[0] as { actions: Array<{ destinationId: string }> }).actions[0].destinationId;
    expect(dest(desktopLink)).toBe("d-faq");
    expect(dest(mobileLink)).toBe("m-faq");
  });
});
