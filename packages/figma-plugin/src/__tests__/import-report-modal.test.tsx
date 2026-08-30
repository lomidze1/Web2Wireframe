/** @jsx h */
/**
 * ImportReportModal — the post-import warning report.
 *
 * The point of this modal is that every warning is ACTIONABLE: it names a
 * layer and clicking it selects that layer on canvas. A count alone ("3
 * missing fonts") is what we had before, and it told the user nothing they
 * could act on.
 */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import ImportReportModal from "../ui/components/modalPopup/ImportReportModal";
import type { ImportWarning } from "../types";

const WARNINGS: ImportWarning[] = [
  {
    category: "typography",
    message: 'Font "Söhne" not available — rendered with "Inter"',
    nodeId: "1:1",
    layerName: "Hero heading",
  },
  {
    category: "typography",
    message: 'Font "Söhne" not available — rendered with "Inter"',
    nodeId: "1:2",
    layerName: "Subhead",
  },
  {
    category: "image",
    message: "Image could not be decoded — replaced with a placeholder",
    nodeId: "1:3",
    layerName: "Product photo",
  },
  {
    category: "fatal",
    message: "Could not be rendered — skipped (layoutWrap on VERTICAL)",
    layerName: "Pricing card",
  },
];

describe("ImportReportModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportReportModal isOpen={false} onClose={() => {}} warnings={WARNINGS} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("groups warnings by category with a count on each group", () => {
    const { getByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    expect(getByText(/Fatal errors/i)).toBeTruthy();
    expect(getByText(/Typography/i)).toBeTruthy();
    expect(getByText(/Images/i)).toBeTruthy();

    // The typography group carries its own count of 2.
    const typographyGroup = getByText(/Typography/i).closest("summary");
    expect(typographyGroup?.textContent).toContain("2");
  });

  it("puts the most severe group first", () => {
    const { container } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    const summaries = Array.from(container.querySelectorAll("summary")).map(
      (s) => s.textContent || "",
    );
    expect(summaries[0]).toMatch(/Fatal errors/i);
  });

  it("renders a warning with a node id as a clickable layer link", () => {
    const onSelectLayer = vi.fn();
    const { getByText } = render(
      <ImportReportModal
        isOpen={true}
        onClose={() => {}}
        warnings={WARNINGS}
        onSelectLayer={onSelectLayer}
      />,
    );

    const row = getByText("Hero heading");
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(row);
    expect(onSelectLayer).toHaveBeenCalledWith("1:1");
  });

  it("renders a warning with no node id as plain text, not a button", () => {
    const { getByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    const row = getByText("Pricing card");
    expect(row.tagName).not.toBe("BUTTON");
  });

  it("shows each warning's message alongside its layer", () => {
    const { getAllByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    expect(getAllByText(/not available — rendered with/).length).toBe(2);
  });

  it("reports warnings dropped past the cap instead of under-reporting", () => {
    const { getByText } = render(
      <ImportReportModal
        isOpen={true}
        onClose={() => {}}
        warnings={WARNINGS}
        overflow={37}
      />,
    );
    expect(getByText(/37 more/)).toBeTruthy();
  });

  it("renders nothing when there is nothing to report", () => {
    const { container } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
