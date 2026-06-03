import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import BrowserExtension from "../ui/pages/import/browserExtension/BrowserExtension";

describe("BrowserExtension tab", () => {
  it("shows install CTA and how-it-works instructions", () => {
    const { getAllByText, getByRole } = render(<BrowserExtension />);
    expect(getByRole("button", { name: /install extension/i })).toBeTruthy();
    expect(getAllByText(/\.w2w/i).length).toBeGreaterThan(0);
    expect(getAllByText(/area/i).length).toBeGreaterThan(0);
  });

  it("does not render the auto-send pairing flow", () => {
    const { queryByText } = render(<BrowserExtension />);
    expect(queryByText(/waiting for capture/i)).toBeNull();
    expect(queryByText(/pairing code/i)).toBeNull();
  });
});
