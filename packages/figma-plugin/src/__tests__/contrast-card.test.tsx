/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import ContrastCard, {
  A11Y_FIX_URL,
  contrastSummary,
} from "../ui/components/contrastCard/ContrastCard";

/**
 * Fake-door card: after an import it says how many text layers fail WCAG AA,
 * and offers a Pro fix that does not exist yet — the click only measures
 * interest (/go/a11y-fix is counted by the site's analytics).
 */

afterEach(() => vi.restoreAllMocks());

describe("contrastSummary", () => {
  it("names issues and styles", () => {
    expect(contrastSummary({ issues: 12, styles: 3, colors: 0, capped: false })).toBe(
      "Found 12 contrast issues in 3 styles",
    );
  });

  it("uses singulars", () => {
    expect(contrastSummary({ issues: 1, styles: 1, colors: 0, capped: false })).toBe(
      "Found 1 contrast issue in 1 style",
    );
  });

  it("names colors when the text has no styles", () => {
    expect(contrastSummary({ issues: 24, styles: 0, colors: 5, capped: false })).toBe(
      "Found 24 contrast issues in 5 colors",
    );
    expect(contrastSummary({ issues: 1, styles: 0, colors: 1, capped: false })).toBe(
      "Found 1 contrast issue in 1 color",
    );
  });

  it("names both when some text is styled and some is not", () => {
    expect(contrastSummary({ issues: 9, styles: 3, colors: 2, capped: false })).toBe(
      "Found 9 contrast issues in 3 styles and 2 colors",
    );
  });

  it("says 'at least' when the audit was capped", () => {
    expect(contrastSummary({ issues: 40, styles: 5, colors: 0, capped: true })).toBe(
      "Found at least 40 contrast issues in 5 styles",
    );
  });
});

describe("ContrastCard", () => {
  it("renders nothing when there are no issues", () => {
    const { container } = render(
      <ContrastCard result={{ issues: 0, styles: 0, colors: 0, capped: false }} onDismiss={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("opens the fake-door page on the Pro button", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { getByText } = render(
      <ContrastCard result={{ issues: 2, styles: 1, colors: 0, capped: false }} onDismiss={() => {}} />,
    );
    fireEvent.click(getByText("Fix all via styles — Pro"));
    expect(open).toHaveBeenCalledWith(A11Y_FIX_URL, "_blank");
    expect(A11Y_FIX_URL).toBe("https://web2wireframe.design/go/a11y-fix");
  });

  it("never claims the fix already works or mentions a charge", () => {
    const { container } = render(
      <ContrastCard result={{ issues: 2, styles: 1, colors: 0, capped: false }} onDismiss={() => {}} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\$|charge|pay|fixed/i);
  });

  it("dismisses", () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(
      <ContrastCard result={{ issues: 2, styles: 1, colors: 0, capped: false }} onDismiss={onDismiss} />,
    );
    fireEvent.click(getByLabelText("Dismiss contrast notice"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
