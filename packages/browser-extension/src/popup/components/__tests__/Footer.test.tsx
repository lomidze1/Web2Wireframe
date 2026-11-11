/**
 * Component tests for popup/components/Footer.tsx.
 *
 * Web2Wireframe is free (2026-11): the footer has no usage pill and no plan
 * entry point — only the identity icon and Help.
 *
 * Rendered with preact's own `render` (no @testing-library — it isn't a
 * dependency of this package), mirroring ReportIssue.test.tsx.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "preact";
import type { SessionState } from "../../../shared/types";
import { Footer } from "../Footer";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.restoreAllMocks();
});

const fakeSession: SessionState = {
  sessionToken: "t",
  expiresAt: Date.now() + 86_400_000,
  figmaUserId: "u-1",
  email: "a@b.c",
  cachedLicense: null,
};

function mount(props: Partial<Parameters<typeof Footer>[0]> = {}) {
  render(
    <Footer
      onHelpClick={() => undefined}
      onIdentityClick={() => undefined}
      session={null}
      {...props}
    />,
    container,
  );
}

describe("Footer (free mode)", () => {
  it("renders only the identity and help buttons, with no plan or usage text", () => {
    mount({ session: fakeSession });

    expect(container.querySelector(".usage-pill")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.textContent ?? "").not.toMatch(/imports|pro|plan|\$/i);
  });

  it("keeps the sign-in path working", () => {
    const onIdentityClick = vi.fn();
    mount({ session: null, onIdentityClick });

    const identity = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sign in with Figma"]',
    );
    expect(identity).not.toBeNull();
    identity?.click();
    expect(onIdentityClick).toHaveBeenCalledTimes(1);
  });
});
