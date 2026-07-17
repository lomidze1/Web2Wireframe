/** @jsx h */
/**
 * RebindFontsModal — the footer "Re-apply fonts" button opens this info
 * modal (matching the Extension button pattern) instead of firing the
 * rebind directly. It leads with how much text is affected, names the fonts
 * still to install, and its own button triggers the actual re-apply.
 */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import RebindFontsModal from "../ui/components/modalPopup/RebindFontsModal";

describe("RebindFontsModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <RebindFontsModal
        isOpen={false}
        onClose={() => {}}
        count={129}
        missingFonts={["SF Pro Text"]}
        onReapply={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the affected layer count", () => {
    const { getByText } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={129}
        missingFonts={["SF Pro Text"]}
        onReapply={() => {}}
      />,
    );
    expect(getByText("129")).toBeTruthy();
    expect(getByText(/text layers still showing Inter/)).toBeTruthy();
  });

  it("uses the singular for a single layer", () => {
    const { getByText } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={1}
        missingFonts={[]}
        onReapply={() => {}}
      />,
    );
    expect(getByText(/text layer still showing Inter/)).toBeTruthy();
  });

  it("lists the missing font families", () => {
    const { getByText } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={12}
        missingFonts={["SF Pro Icons", "SF Pro Text"]}
        onReapply={() => {}}
      />,
    );
    expect(getByText("SF Pro Icons, SF Pro Text")).toBeTruthy();
    expect(getByText(/fonts.zip/)).toBeTruthy();
  });

  it("hides the font list when no families are pending", () => {
    const { queryByText } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={3}
        missingFonts={[]}
        onReapply={() => {}}
      />,
    );
    expect(queryByText(/Waiting for:/)).toBeNull();
  });

  it("fires onReapply from the modal button", () => {
    const onReapply = vi.fn();
    const { getByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={5}
        missingFonts={["SF Pro Text"]}
        onReapply={onReapply}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Re-apply original fonts now" }));
    expect(onReapply).toHaveBeenCalledTimes(1);
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={onClose}
        count={5}
        missingFonts={[]}
        onReapply={() => {}}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Close re-apply fonts" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
