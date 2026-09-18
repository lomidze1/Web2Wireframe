/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/preact";
import { useWhatsNew } from "../ui/hooks/useWhatsNew";
import { NEWS_ID } from "../ui/shared/whatsNew";
import type { License } from "../ui/shared/licenseClient";

function license(used: number): License {
  return {
    figmaUserId: "user-1",
    email: null,
    plan: "free",
    status: "active",
    cycleStartedAt: "2026-09-01T00:00:00.000Z",
    cycleEndsAt: "2026-10-01T00:00:00.000Z",
    usage: { imports: used, periodStartedAt: "2026-09-01T00:00:00.000Z" },
    limits: { imports: 10 },
    subscription: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as unknown as License;
}

function Harness({ license: lic, blocked = false }: { license: License | null; blocked?: boolean }) {
  const { isOpen } = useWhatsNew(lic, blocked);
  return <span data-testid="state">{isOpen ? "open" : "closed"}</span>;
}

const state = (container: Element) =>
  (container.querySelector("[data-testid=state]") as HTMLElement).textContent;

async function sendSeen(id: string | null) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { pluginMessage: { type: "news-seen-loaded", data: { id } } },
      })
    );
  });
}

const posted = (spy: any, type: string) =>
  spy.mock.calls.filter((c: any) => c[0]?.pluginMessage?.type === type);

let postSpy: any;

beforeEach(() => {
  postSpy = vi.spyOn(parent, "postMessage");
});

afterEach(() => vi.restoreAllMocks());

describe("useWhatsNew", () => {
  it("asks the sandbox what the user has already seen", () => {
    render(<Harness license={license(1)} />);
    expect(posted(postSpy, "load-news-seen")).toHaveLength(1);
  });

  it("opens once and records it as seen", async () => {
    const { container } = render(<Harness license={license(1)} />);
    expect(state(container)).toBe("closed");

    await sendSeen(null);

    expect(state(container)).toBe("open");
    const saved = posted(postSpy, "save-news-seen");
    expect(saved).toHaveLength(1);
    expect(saved[0][0].pluginMessage.data.id).toBe(NEWS_ID);
  });

  it("stays shut for news the user already saw", async () => {
    const { container } = render(<Harness license={license(1)} />);
    await sendSeen(NEWS_ID);
    expect(state(container)).toBe("closed");
    expect(posted(postSpy, "save-news-seen")).toHaveLength(0);
  });

  it("does not re-open when the license refreshes after an import", async () => {
    // The license refresh after every import must not pop this modal on top
    // of the next-step card.
    const { container, rerender } = render(<Harness license={license(0)} />);
    await sendSeen(null);
    expect(state(container)).toBe("closed");

    await act(async () => {
      rerender(<Harness license={license(1)} />);
    });

    expect(state(container)).toBe("closed");
  });
});
