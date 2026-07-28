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

describe("RebindFontsModal — per-font layer list", () => {
  const layers = [
    { id: "1:1", name: "h1.u-text", families: ["Liberation Sans"] },
    { id: "1:2", name: "p.description", families: ["Liberation Sans", "Noto Sans CJK JP"] },
    { id: "1:3", name: "span.badge", families: ["Noto Sans CJK JP"] },
  ];

  it("groups layers under a collapsible entry per waiting font", () => {
    const { getByText, getAllByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={3}
        missingFonts={["Liberation Sans", "Noto Sans CJK JP"]}
        layers={layers}
        onSelectLayer={() => {}}
        onReapply={() => {}}
      />,
    );
    // Family headers with per-family counts
    expect(getByText("Liberation Sans")).toBeTruthy();
    expect(getByText("Noto Sans CJK JP")).toBeTruthy();
    // A layer waiting on both families appears under both groups
    const rows = getAllByRole("button", { name: /p\.description/ });
    expect(rows.length).toBe(2);
  });

  it("fires onSelectLayer with the layer id when a row is clicked", () => {
    const onSelectLayer = vi.fn();
    const { getAllByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={3}
        missingFonts={["Liberation Sans", "Noto Sans CJK JP"]}
        layers={layers}
        onSelectLayer={onSelectLayer}
        onReapply={() => {}}
      />,
    );
    fireEvent.click(getAllByRole("button", { name: /h1\.u-text/ })[0]);
    expect(onSelectLayer).toHaveBeenCalledWith("1:1");
  });

  it("falls back to the plain Waiting-for line when no layer data is supplied", () => {
    const { getByText } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={5}
        missingFonts={["SF Pro Text"]}
        onReapply={() => {}}
      />,
    );
    expect(getByText(/Waiting for:/)).toBeTruthy();
    expect(getByText("SF Pro Text")).toBeTruthy();
  });
});

describe("RebindFontsModal — re-apply progress & result (stays open)", () => {
  it("disables the button and shows a busy label while re-applying", () => {
    const onReapply = vi.fn();
    const { getByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={5}
        missingFonts={["icomoon"]}
        onReapply={onReapply}
        isReapplying={true}
      />,
    );
    const btn = getByRole("button", { name: "Re-apply original fonts now" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Re-applying/);
    fireEvent.click(btn);
    expect(onReapply).not.toHaveBeenCalled();
  });

  it("shows a success banner when everything rebound", () => {
    const { getByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={0}
        missingFonts={[]}
        onReapply={() => {}}
        isReapplying={false}
        result={{ rebound: 195, total: 195, stillMissing: [], skippedMixed: 0, previouslyRebound: 0 }}
      />,
    );
    const status = getByRole("status");
    expect(status.textContent).toMatch(/Re-applied 195 text layer/);
  });

  it("shows a partial banner naming the still-missing families", () => {
    const { getByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={179}
        missingFonts={["BPG Nino Mtavruli"]}
        onReapply={() => {}}
        isReapplying={false}
        result={{ rebound: 16, total: 195, stillMissing: ["BPG Nino Mtavruli"], skippedMixed: 0, previouslyRebound: 0 }}
      />,
    );
    const status = getByRole("status");
    expect(status.textContent).toMatch(/16 \/ 195/);
    expect(status.textContent).toMatch(/BPG Nino Mtavruli/);
    expect(status.textContent).toMatch(/Install the missing fonts/);
  });

  it("shows an error banner when the re-apply failed", () => {
    const { getByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={5}
        missingFonts={["icomoon"]}
        onReapply={() => {}}
        isReapplying={false}
        result={{ error: true }}
      />,
    );
    expect(getByRole("status").textContent).toMatch(/Couldn't re-apply/);
  });

  it("shows no banner before the first re-apply", () => {
    const { queryByRole } = render(
      <RebindFontsModal
        isOpen={true}
        onClose={() => {}}
        count={5}
        missingFonts={["icomoon"]}
        onReapply={() => {}}
      />,
    );
    expect(queryByRole("status")).toBeNull();
  });
});
