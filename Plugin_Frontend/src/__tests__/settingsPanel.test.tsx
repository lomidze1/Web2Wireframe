import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import SettingsPanel from "../ui/components/settingsPanel/SettingsPanel";
import type { SettingsPanelStyles } from "../ui/components/settingsPanel/SettingsPanel";

// Mock ConfigContext (SettingsPanel uses VIEWPORT_OPTIONS)
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
  };
});

// Create a Proxy-based mock styles object that returns class names as-is
const mockStyles = new Proxy({} as SettingsPanelStyles, {
  get: (_target, prop) => (typeof prop === "string" ? prop : ""),
});

describe("SettingsPanel", () => {
  const defaultProps = {
    styles: mockStyles,
    isExpanded: false,
    toggleExpanded: vi.fn(),
    localViewports: ["1440"],
    localColorMode: "plugin" as const,
    localFontMode: "plugin" as const,
    localTextMode: "semantic" as const,
    localCssVariablesMode: "direct" as const,
    localLayoutMode: "autoLayout" as const,
    toggleViewport: vi.fn(),
    setColorMode: vi.fn(),
    setFontMode: vi.fn(),
    setTextMode: vi.fn(),
    setCssVariablesMode: vi.fn(),
    setLayoutMode: vi.fn(),
    handleReset: vi.fn(),
    handleSaveAsDefault: vi.fn(),
    hasOverrides: false,
    openSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders viewport options", () => {
    const { getByText } = render(<SettingsPanel {...defaultProps} />);
    expect(getByText("1440")).toBeTruthy();
    expect(getByText("1920")).toBeTruthy();
  });

  it("renders 'More Options' toggle button", () => {
    const { container } = render(<SettingsPanel {...defaultProps} />);
    const button = container.querySelector(".collapseToggle");
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain("More Options");
  });

  it("calls toggleExpanded when 'More Options' is clicked", () => {
    const toggleExpanded = vi.fn();
    const { container } = render(
      <SettingsPanel {...defaultProps} toggleExpanded={toggleExpanded} />
    );

    const button = container.querySelector(".collapseToggle") as HTMLElement;
    fireEvent.click(button);
    expect(toggleExpanded).toHaveBeenCalledOnce();
  });

  it("does not render collapsible content when collapsed", () => {
    const { container } = render(
      <SettingsPanel {...defaultProps} isExpanded={false} />
    );

    expect(container.querySelector(".collapsibleContent")).toBeNull();
  });

  it("renders collapsible content when expanded", () => {
    const { container } = render(
      <SettingsPanel {...defaultProps} isExpanded={true} />
    );

    expect(container.querySelector(".collapsibleContent")).toBeTruthy();
  });

  describe("when expanded", () => {
    const expandedProps = { ...defaultProps, isExpanded: true };

    it("renders Colors, Fonts, Text dropdowns", () => {
      const { getByText } = render(<SettingsPanel {...expandedProps} />);
      expect(getByText("Colors")).toBeTruthy();
      expect(getByText("Fonts")).toBeTruthy();
      expect(getByText("Text")).toBeTruthy();
    });

    it("renders CSS Variables dropdown when setCssVariablesMode is provided", () => {
      const { getByText } = render(<SettingsPanel {...expandedProps} />);
      expect(getByText("CSS Variables")).toBeTruthy();
    });

    it("hides CSS Variables dropdown when setCssVariablesMode is undefined", () => {
      const { queryByText } = render(
        <SettingsPanel
          {...expandedProps}
          setCssVariablesMode={undefined}
        />
      );
      expect(queryByText("CSS Variables")).toBeNull();
    });

    it("renders Layout Mode dropdown when setLayoutMode is provided", () => {
      const { getByText } = render(<SettingsPanel {...expandedProps} />);
      expect(getByText("Layout Mode")).toBeTruthy();
    });

    it("renders Config, Reset, and Save buttons", () => {
      const { getByText } = render(<SettingsPanel {...expandedProps} />);
      expect(getByText("Config.")).toBeTruthy();
      expect(getByText("Reset")).toBeTruthy();
      expect(getByText("Save")).toBeTruthy();
    });

    it("Save button is disabled when hasOverrides is false", () => {
      const { getByText } = render(
        <SettingsPanel {...expandedProps} hasOverrides={false} />
      );

      const saveBtn = getByText("Save");
      expect(saveBtn.hasAttribute("disabled")).toBe(true);
    });

    it("Save button is enabled when hasOverrides is true", () => {
      const { getByText } = render(
        <SettingsPanel {...expandedProps} hasOverrides={true} />
      );

      const saveBtn = getByText("Save");
      expect(saveBtn.hasAttribute("disabled")).toBe(false);
    });

    it("Reset button is disabled when hasOverrides is false", () => {
      const { getByText } = render(
        <SettingsPanel {...expandedProps} hasOverrides={false} />
      );

      const resetBtn = getByText("Reset");
      expect(resetBtn.hasAttribute("disabled")).toBe(true);
    });

    it("Reset button is enabled when hasOverrides is true", () => {
      const { getByText } = render(
        <SettingsPanel {...expandedProps} hasOverrides={true} />
      );

      const resetBtn = getByText("Reset");
      expect(resetBtn.hasAttribute("disabled")).toBe(false);
    });

    it("clicking Save calls handleSaveAsDefault", () => {
      const handleSaveAsDefault = vi.fn();
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          hasOverrides={true}
          handleSaveAsDefault={handleSaveAsDefault}
        />
      );

      fireEvent.click(getByText("Save"));
      expect(handleSaveAsDefault).toHaveBeenCalledOnce();
    });

    it("clicking Reset calls handleReset", () => {
      const handleReset = vi.fn();
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          hasOverrides={true}
          handleReset={handleReset}
        />
      );

      fireEvent.click(getByText("Reset"));
      expect(handleReset).toHaveBeenCalledOnce();
    });

    it("clicking Config opens configuration settings", () => {
      const openSettings = vi.fn();
      const { getByText } = render(
        <SettingsPanel {...expandedProps} openSettings={openSettings} />
      );

      fireEvent.click(getByText("Config."));
      expect(openSettings).toHaveBeenCalledWith("configuration");
    });
  });
});
