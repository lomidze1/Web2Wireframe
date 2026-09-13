/** @jsx h */
/**
 * ImportReportModal — the post-import warning report.
 *
 * Every warning stays ACTIONABLE (its layer is one click from the canvas),
 * but the report is organised by PROBLEM, not by element: one row per
 * distinct issue with the number of layers it hit. "31 layers lost their
 * font" is one problem, and listing it 31 times made a nearly-good import
 * read as a broken one.
 */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import ImportReportModal from "../ui/components/modalPopup/ImportReportModal";
import type { ImportWarning } from "../types";

const { mockSendReport, mockSendNote } = vi.hoisted(() => ({
  mockSendReport: vi.fn(),
  mockSendNote: vi.fn(),
}));

vi.mock("../ui/shared/importReportClient", () => ({
  sendImportReport: mockSendReport,
  sendImportReportNote: mockSendNote,
}));

const SOEHNE = 'Font "Söhne" not available — rendered with "Inter"';

const WARNINGS: ImportWarning[] = [
  { category: "typography", message: SOEHNE, nodeId: "1:1", layerName: "Hero heading" },
  { category: "typography", message: SOEHNE, nodeId: "1:2", layerName: "Subhead" },
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

function issueButton(getByText: (m: RegExp) => HTMLElement, text: RegExp) {
  const button = getByText(text).closest("button");
  if (!button) throw new Error(`no issue button for ${text}`);
  return button;
}

describe("ImportReportModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportReportModal isOpen={false} onClose={() => {}} warnings={WARNINGS} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when there is nothing to report", () => {
    const { container } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("counts distinct issues in the headline, not affected layers", () => {
    const { container } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    // 4 warnings, but the two Söhne ones are the same problem → 3 issues.
    expect(container.textContent).toContain("3 issues");
    expect(container.textContent).not.toMatch(/4 elements/);
  });

  it("singularises a lone issue", () => {
    const { container } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS.slice(0, 2)} />,
    );
    expect(container.textContent).toMatch(/\b1 issue(?!s)/);
  });

  it("groups issues by category, most severe first, badge = issue count", () => {
    const { container, getByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    const summaries = Array.from(container.querySelectorAll("summary")).map(
      (s) => s.textContent || "",
    );
    expect(summaries[0]).toMatch(/Fatal errors/i);
    // Two Söhne layers are ONE typography issue.
    const typography = getByText(/Typography/i).closest("summary");
    expect(typography?.textContent).toContain("1");
    expect(typography?.textContent).not.toContain("2");
  });

  it("shows each issue once, with how many layers it affected", () => {
    const { getAllByText, getByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    expect(getAllByText(/not available — rendered with/).length).toBe(1);
    expect(getByText(/2 layers/)).toBeTruthy();
  });

  it("hides layers until the issue is expanded, then links them to the canvas", () => {
    const onSelectLayer = vi.fn();
    const { getByText, queryByText } = render(
      <ImportReportModal
        isOpen={true}
        onClose={() => {}}
        warnings={WARNINGS}
        onSelectLayer={onSelectLayer}
      />,
    );
    expect(queryByText("Hero heading")).toBeNull();

    const issue = issueButton(getByText, /not available — rendered with/);
    expect(issue.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(issue);
    expect(issue.getAttribute("aria-expanded")).toBe("true");

    const layer = getByText("Hero heading");
    expect(layer.tagName).toBe("BUTTON");
    fireEvent.click(layer);
    expect(onSelectLayer).toHaveBeenCalledWith("1:1");
  });

  it("renders a layer with no node id as plain text, not a button", () => {
    const { getByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} />,
    );
    fireEvent.click(issueButton(getByText, /Could not be rendered/));
    expect(getByText("Pricing card").tagName).not.toBe("BUTTON");
  });

  it("shows per-layer detail next to the layer", () => {
    const { getByText } = render(
      <ImportReportModal
        isOpen={true}
        onClose={() => {}}
        warnings={[
          {
            category: "layout",
            message: "Hidden at capture time (opacity: 0) — skipped",
            layerName: "Promo",
            detail: "12 layers · 1440×900px",
          },
        ]}
      />,
    );
    fireEvent.click(issueButton(getByText, /Hidden at capture time/));
    expect(getByText(/1440×900px/)).toBeTruthy();
  });

  it("reports warnings dropped past the cap instead of under-reporting", () => {
    const { getByText } = render(
      <ImportReportModal isOpen={true} onClose={() => {}} warnings={WARNINGS} overflow={37} />,
    );
    expect(getByText(/37 more/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// "Report this to the developer" — one click, no form.
// ---------------------------------------------------------------------------

type Source = Parameters<typeof ImportReportModal>[0]["source"];

describe("ImportReportModal — Report this to the developer", () => {
  const URL_SOURCE = {
    sourceUrl: "https://stripe.com/",
    kind: "url" as const,
    viewports: [1440, 375],
  };

  beforeEach(() => {
    mockSendReport.mockReset();
    mockSendNote.mockReset();
  });

  const open = (source: Source) =>
    render(
      <ImportReportModal
        isOpen={true}
        onClose={() => {}}
        warnings={WARNINGS}
        overflow={2}
        source={source}
      />,
    );

  it.each([
    ["a URL import", URL_SOURCE],
    ["an extension import", { ...URL_SOURCE, kind: "extension" as const }],
  ])("offers the button for %s", (_label, source) => {
    const { getByText } = open(source);
    expect(getByText(/Report this to the developer/).closest("button")).toBeTruthy();
  });

  it.each([
    ["no known source", undefined],
    ["an HTML paste", { sourceUrl: "html-import", kind: "html" as const, viewports: [] }],
    ["a screenshot", { sourceUrl: "screenshot-import", kind: "screenshot" as const, viewports: [] }],
    ["a URL import without a real URL", { sourceUrl: "html-import", kind: "url" as const, viewports: [] }],
  ])("has no button for %s — nothing to reproduce", (_label, source) => {
    const { queryByText } = open(source as Source);
    expect(queryByText(/Report this to the developer/)).toBeNull();
  });

  it("sends one grouped report — issues and counts, never layer names or node ids", async () => {
    mockSendReport.mockResolvedValue("REPORT-A1-B2");
    const { getByText } = open(URL_SOURCE);

    fireEvent.click(getByText(/Report this to the developer/));

    await waitFor(() => expect(mockSendReport).toHaveBeenCalledTimes(1));
    const payload = mockSendReport.mock.calls[0][0];
    expect(payload).toEqual({
      sourceUrl: "https://stripe.com/",
      kind: "url",
      viewports: [1440, 375],
      overflow: 2,
      issues: [
        { category: "fatal", message: "Could not be rendered — skipped (layoutWrap on VERTICAL)", count: 1 },
        { category: "typography", message: SOEHNE, count: 2 },
        { category: "image", message: "Image could not be decoded — replaced with a placeholder", count: 1 },
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/Hero heading|Pricing card|1:1|nodeId|layerName/);
  });

  it("shows it is sending and can't be double-clicked", async () => {
    mockSendReport.mockReturnValue(new Promise(() => {}));
    const { getByText } = open(URL_SOURCE);

    fireEvent.click(getByText(/Report this to the developer/));

    const sending = await waitFor(() => getByText(/Sending/));
    expect((sending.closest("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sending);
    expect(mockSendReport).toHaveBeenCalledTimes(1);
  });

  it("thanks the user, then offers an optional note", async () => {
    mockSendReport.mockResolvedValue("REPORT-A1-B2");
    mockSendNote.mockResolvedValue(undefined);
    const { getByText, getByRole, findByText, queryByText } = open(URL_SOURCE);

    fireEvent.click(getByText(/Report this to the developer/));

    await findByText(/Thanks — we read every report/);
    expect(queryByText(/Report this to the developer/)).toBeNull();

    const note = getByRole("textbox");
    const send = getByRole("button", { name: /^Send$/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.input(note, { target: { value: "  The logo is missing  " } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    await waitFor(() =>
      expect(mockSendNote).toHaveBeenCalledWith("REPORT-A1-B2", "The logo is missing"),
    );
    await findByText(/Note sent/);
  });

  it("says so when the note could not be sent, keeping the text", async () => {
    mockSendReport.mockResolvedValue("REPORT-A1-B2");
    mockSendNote.mockRejectedValue(new Error("send_failed"));
    const { getByText, getByRole, findByText } = open(URL_SOURCE);

    fireEvent.click(getByText(/Report this to the developer/));
    await findByText(/Thanks — we read every report/);
    fireEvent.input(getByRole("textbox"), { target: { value: "Logo" } });
    fireEvent.click(getByRole("button", { name: /^Send$/ }));

    await findByText(/Couldn't send the note/);
    expect((getByRole("textbox") as HTMLTextAreaElement).value).toBe("Logo");
  });

  it("says so when the report could not be sent, and lets the user retry", async () => {
    mockSendReport
      .mockRejectedValueOnce(new Error("send_failed"))
      .mockResolvedValueOnce("REPORT-A1-B2");
    const { getByText, findByText } = open(URL_SOURCE);

    fireEvent.click(getByText(/Report this to the developer/));
    const retry = await findByText(/Couldn't send — try again/);
    fireEvent.click(retry.closest("button") as HTMLButtonElement);

    await findByText(/Thanks — we read every report/);
    expect(mockSendReport).toHaveBeenCalledTimes(2);
  });
  it("starts fresh for the next import's report", async () => {
    mockSendReport.mockResolvedValue("REPORT-A1-B2");
    const { getByText, findByText, rerender } = open(URL_SOURCE);
    fireEvent.click(getByText(/Report this to the developer/));
    await findByText(/Thanks — we read every report/);

    // A new import hands the modal a new warnings list.
    rerender(
      <ImportReportModal
        isOpen={true}
        onClose={() => {}}
        warnings={[...WARNINGS]}
        overflow={2}
        source={URL_SOURCE}
      />,
    );

    expect(await findByText(/Report this to the developer/)).toBeTruthy();
  });
});
