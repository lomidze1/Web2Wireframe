/** @jsx h */
/**
 * "Download fonts (.zip)" must never hand the user an empty archive.
 *
 * notion.com (2026-09-17): none of the 12 font files could be fetched, yet the
 * modal still downloaded `fonts.zip` — macOS said "empty or contains no
 * readable items" — and only warned "12 font files could not be packaged".
 * When nothing was packaged, no file is downloaded and the notice tells the
 * user which fonts to find themselves.
 */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";

const zipResult = { blob: new Blob(["zip"]), skippedEntries: [] as string[] };

vi.mock("../utils/fontDownload", () => ({
  buildFontDownloadEntries: vi.fn(() => [
    { fileName: "NotionInter-Regular.woff2", url: "https://a/1.woff2" },
    { fileName: "NotionInter-Bold.woff2", url: "https://a/2.woff2" },
    { fileName: "LyonText-Regular.woff2", url: "https://a/3.woff2" },
  ]),
  createFontsZipBlob: vi.fn(async () => zipResult),
}));

vi.mock("../ui/components/modalPopup/Modal.css", () => ({
  default: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === "string" ? prop : "") }
  ),
}));

import FontFallbackModal from "../ui/components/modalPopup/FontFallbackModal";

const createObjectURL = vi.fn(() => "blob:fonts");

beforeEach(() => {
  createObjectURL.mockClear();
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

function renderModal() {
  const utils = render(
    <FontFallbackModal
      isOpen={true}
      missingFonts={["NotionInter", "Lyon Text Web"]}
      defaultMapping={{}}
      pluginFont="Montserrat"
      pluginFontOptions={["Montserrat"]}
      fontDownloads={[{ family: "NotionInter", urls: ["https://a/1.woff2"], isGoogleFont: false }]}
      onChoice={vi.fn()}
    />
  );
  fireEvent.click(utils.getByText("Use original fonts"));
  fireEvent.click(utils.getByText("Download fonts (.zip)"));
  return utils;
}

describe("font ZIP download", () => {
  it("nothing packaged: no file is downloaded and the fonts are named", async () => {
    zipResult.skippedEntries = [
      "NotionInter-Regular.woff2",
      "NotionInter-Bold.woff2",
      "LyonText-Regular.woff2",
    ];
    const { findByRole } = renderModal();

    const notice = await findByRole("status");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(notice.textContent).toMatch(/couldn't download/i);
    expect(notice.textContent).toContain("NotionInter");
    expect(notice.textContent).toContain("Lyon Text Web");
  });

  it("partly packaged: downloads and says how many files are missing", async () => {
    zipResult.skippedEntries = ["LyonText-Regular.woff2"];
    const { findByRole } = renderModal();

    const notice = await findByRole("status");
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(notice.textContent).toMatch(/1 of 3 font files/);
  });
});
