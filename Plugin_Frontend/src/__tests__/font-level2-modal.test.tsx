/** @jsx h */
/**
 * Level 2: FontFallbackModal UI Tests
 *
 * Tests the redesigned multi-font fallback popup:
 * - Website mode: 3 choices (Fallback, Plugin fonts, Continue as-is)
 * - Missing fonts list displayed
 * - Per-font dropdown mapping when "Plugin fonts" selected
 * - Correct onChoice callback data
 */

import { h } from "preact";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import FontFallbackModal from "../ui/components/modalPopup/FontFallbackModal";

// Mock CSS module
vi.mock("../ui/components/modalPopup/Modal.css", () => ({
  default: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === "string" ? prop : "") }
  ),
}));

// ============================================================================
// The new FontFallbackModal will accept these new props:
//
// interface FontFallbackModalProps {
//   isOpen: boolean;
//   missingFonts: string[];                    // NEW: array of missing fonts
//   defaultMapping: Record<string, string>;     // NEW: smart default mapping
//   pluginFont: string;                         // config plugin font
//   pluginFontOptions: string[];                // NEW: all plugin font choices
//   fallbackChains?: Record<string, string[]>;  // NEW: CSS fallback chains per font
//   onChoice: (choice: FontFallbackChoice, fontMapping: Record<string, string>) => void;
// }
// ============================================================================

describe("Level 2: FontFallbackModal — Website mode UI", () => {
  const defaultProps = {
    isOpen: true,
    missingFonts: ["PSA", "PSC", "SS3V"],
    defaultMapping: { "PSA": "Inter", "PSC": "Inter", "SS3V": "Inter" },
    pluginFont: "Montserrat",
    pluginFontOptions: ["Montserrat", "Inter", "Roboto", "Poppins", "Lato", "Helvetica"],
    fallbackChains: {
      "PSA": ["PSA", "Arial", "sans-serif"],
      "PSC": ["PSC", "Georgia", "serif"],
      "SS3V": ["SS3V", "Courier", "monospace"],
    },
    onChoice: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // L2-9: Three options visible
  it("L2-9: shows 3 choice buttons — Fallback, Plugin fonts, Continue", () => {
    const { getByText } = render(<FontFallbackModal {...defaultProps} />);

    // All 3 options should be visible (exact button text)
    expect(getByText("Use fallback fonts")).toBeTruthy();
    expect(getByText("Use plugin fonts")).toBeTruthy();
    expect(getByText("Use original fonts")).toBeTruthy();
  });

  // L2-10: All missing fonts displayed
  it("L2-10: displays all missing font names", () => {
    const { container } = render(<FontFallbackModal {...defaultProps} />);
    const text = container.textContent || "";

    expect(text).toContain("PSA");
    expect(text).toContain("PSC");
    expect(text).toContain("SS3V");
  });

  // L2-11: "Plugin fonts" expands per-font dropdowns
  it("L2-11: clicking 'Plugin fonts' shows per-font dropdown mapping", () => {
    const { getByText, container } = render(<FontFallbackModal {...defaultProps} />);

    // Click "Plugin fonts" option
    const pluginBtn = getByText("Use plugin fonts");
    fireEvent.click(pluginBtn);

    // Now per-font dropdowns should appear
    const selects = container.querySelectorAll("select");
    // One dropdown per missing font
    expect(selects.length).toBe(3);
  });

  // L2-12: Default dropdown value = config pluginFont
  it("L2-12: each dropdown defaults to config pluginFont", () => {
    const { getByText, container } = render(<FontFallbackModal {...defaultProps} />);

    // Expand plugin fonts section
    fireEvent.click(getByText("Use plugin fonts"));

    const selects = container.querySelectorAll("select");
    selects.forEach((select) => {
      expect((select as HTMLSelectElement).value).toBe("Montserrat");
    });
  });

  // L2-13: User changes individual mapping, onChoice gets correct data
  it("L2-13: changing dropdowns and confirming sends correct fontMapping", () => {
    const onChoice = vi.fn();
    const { getByText, container } = render(
      <FontFallbackModal {...defaultProps} onChoice={onChoice} />
    );

    // Expand plugin fonts
    fireEvent.click(getByText("Use plugin fonts"));

    const selects = container.querySelectorAll("select");

    // Change PSA → Poppins (first dropdown)
    fireEvent.change(selects[0], { target: { value: "Poppins" } });
    // Change PSC → Lato (second dropdown)
    fireEvent.change(selects[1], { target: { value: "Lato" } });
    // Leave SS3V as default (Montserrat)

    // Click confirm/apply button
    const confirmBtn = getByText("Apply");
    fireEvent.click(confirmBtn);

    expect(onChoice).toHaveBeenCalledWith(
      "plugin",
      {
        "PSA": "Poppins",
        "PSC": "Lato",
        "SS3V": "Montserrat",
      }
    );
  });

  // L2-14: "Fallback fonts" sends CSS chain mapping
  it("L2-14: 'Fallback fonts' sends mapping from CSS fallback chains", () => {
    const onChoice = vi.fn();
    const { getByText } = render(
      <FontFallbackModal {...defaultProps} onChoice={onChoice} />
    );

    // Click "Fallback fonts" option
    const fallbackBtn = getByText("Use fallback fonts");
    fireEvent.click(fallbackBtn);

    // Should call onChoice with fallback-derived mapping
    // Each font maps to the first available fallback in its chain
    expect(onChoice).toHaveBeenCalledWith(
      "fallback",
      expect.objectContaining({
        "PSA": "Arial",     // First fallback after PSA in chain
        "PSC": "Georgia",   // First fallback after PSC in chain
        "SS3V": "Courier",  // First fallback after SS3V in chain
      })
    );
  });

  // L2-15: "Use original fonts" expands section, then Apply sends identity mapping
  it("L2-15: 'Use original fonts' sends identity fontMapping", () => {
    const onChoice = vi.fn();
    const { getByText } = render(
      <FontFallbackModal {...defaultProps} onChoice={onChoice} />
    );

    // Click "Use original fonts" to expand the section
    const originalBtn = getByText("Use original fonts");
    fireEvent.click(originalBtn);

    // onChoice should NOT be called yet (expanded section shown)
    expect(onChoice).not.toHaveBeenCalled();

    // Click "Apply" to confirm
    const applyBtn = getByText("Apply");
    fireEvent.click(applyBtn);

    expect(onChoice).toHaveBeenCalledWith("continue", {
      "PSA": "PSA",
      "PSC": "PSC",
      "SS3V": "SS3V",
    });
  });

  // Extra: does not render when isOpen is false
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <FontFallbackModal {...defaultProps} isOpen={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  // Extra: dropdown options contain all pluginFontOptions
  it("dropdowns contain all plugin font options", () => {
    const { getByText, container } = render(<FontFallbackModal {...defaultProps} />);

    // Expand plugin fonts
    fireEvent.click(getByText("Use plugin fonts"));

    const firstSelect = container.querySelector("select");
    expect(firstSelect).toBeTruthy();

    const options = firstSelect!.querySelectorAll("option");
    const optionValues = Array.from(options).map((o) => (o as HTMLOptionElement).value);

    for (const font of defaultProps.pluginFontOptions) {
      expect(optionValues).toContain(font);
    }
  });
});
