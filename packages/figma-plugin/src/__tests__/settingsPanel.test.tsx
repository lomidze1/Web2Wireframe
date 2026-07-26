import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/preact";
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

// Scope queries to a single segmented toggle by its radiogroup aria-label
// (labels like "Website"/"Plugin" appear in more than one toggle).
const inGroup = (container: HTMLElement, label: string) =>
  within(container.querySelector(`[aria-label="${label}"]`) as HTMLElement);

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

  it("renders the settings hint under the 'More Options' toggle", () => {
    const { container } = render(<SettingsPanel {...defaultProps} />);
    const hint = container.querySelector(".settingsHint");
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toContain("Try different settings");
  });

  it("keeps the hint visible while the section is collapsed", () => {
    // The hint exists to get users to open the section, so it must not live
    // inside the content it is advertising.
    const { container } = render(
      <SettingsPanel {...defaultProps} isExpanded={false} />
    );
    expect(container.querySelector(".collapsibleContent")).toBeNull();
    expect(container.querySelector(".settingsHint")).toBeTruthy();
  });

  it("hides the hint once the section is expanded", () => {
    // Once expanded the options are visible, so the advertising hint is
    // redundant clutter and should disappear.
    const { container } = render(
      <SettingsPanel {...defaultProps} isExpanded={true} />
    );
    expect(container.querySelector(".collapsibleContent")).toBeTruthy();
    expect(container.querySelector(".settingsHint")).toBeNull();
  });

  it("scrolls the options into view when the section is opened", () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

    const { rerender } = render(
      <SettingsPanel {...defaultProps} isExpanded={false} />
    );
    // No scroll while collapsed (and not on initial mount).
    expect(scrollSpy).not.toHaveBeenCalled();

    rerender(<SettingsPanel {...defaultProps} isExpanded={true} />);
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("does not scroll on initial mount when already expanded", () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

    render(<SettingsPanel {...defaultProps} isExpanded={true} />);
    expect(scrollSpy).not.toHaveBeenCalled();
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

    it("renders custom colorWebsiteLabel in Colors toggle", () => {
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          colorWebsiteLabel="Screenshot Colors"
        />
      );
      expect(getByText("Screenshot Colors")).toBeTruthy();
    });

    it("renders default 'Website' label in the Colors toggle when colorWebsiteLabel not passed", () => {
      const { container } = render(<SettingsPanel {...expandedProps} />);
      expect(inGroup(container, "Colors").getByText("Website")).toBeTruthy();
    });

    it("disables the 'Website' option in Fonts when disableFontWebsiteOption is true", () => {
      const { container } = render(
        <SettingsPanel {...expandedProps} disableFontWebsiteOption={true} />
      );
      const websiteFontBtn = inGroup(container, "Fonts").getByText("Website");
      expect(websiteFontBtn.hasAttribute("disabled")).toBe(true);
    });

    it("keeps the Fonts 'Website' option enabled when disableFontWebsiteOption is not set", () => {
      const { container } = render(<SettingsPanel {...expandedProps} />);
      const websiteFontBtn = inGroup(container, "Fonts").getByText("Website");
      expect(websiteFontBtn.hasAttribute("disabled")).toBe(false);
    });

    it("renders Assets dropdown when setAssetMode is provided", () => {
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          localAssetMode="placeholders"
          setAssetMode={vi.fn()}
        />
      );
      expect(getByText("Assets")).toBeTruthy();
    });

    it("hides Assets dropdown when setAssetMode is not provided", () => {
      const { queryByText } = render(
        <SettingsPanel {...expandedProps} />
      );
      expect(queryByText("Assets")).toBeNull();
    });

    it("calls setAssetMode when the 'Real Assets' toggle is clicked", () => {
      const setAssetMode = vi.fn();
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          localAssetMode="placeholders"
          setAssetMode={setAssetMode}
        />
      );

      fireEvent.click(getByText("Real Assets"));
      expect(setAssetMode).toHaveBeenCalledWith("realAssets");
    });
  });

  describe("segmented toggles", () => {
    const expandedProps = {
      ...defaultProps,
      isExpanded: true,
      localAssetMode: "placeholders" as const,
      setAssetMode: vi.fn(),
    };

    it("renders every setting as a radiogroup — no <select> dropdowns", () => {
      const { container } = render(<SettingsPanel {...expandedProps} />);
      // Colors(2) Fonts(3) Text(3) Assets(2) CSS(2) Layout(2) = 6 groups, 14 radios
      expect(container.querySelectorAll('[role="radiogroup"]').length).toBe(6);
      expect(container.querySelectorAll('[role="radio"]').length).toBe(14);
      expect(container.querySelectorAll("select").length).toBe(0);
    });

    it("renders Fonts and Text as 3-option toggles", () => {
      const { container } = render(<SettingsPanel {...expandedProps} />);
      expect(
        inGroup(container, "Fonts").getAllByRole("radio").length
      ).toBe(3);
      expect(
        inGroup(container, "Text").getAllByRole("radio").length
      ).toBe(3);
    });

    it("marks the active option with aria-checked", () => {
      const { container } = render(
        <SettingsPanel {...expandedProps} localColorMode="website" />
      );
      const colors = inGroup(container, "Colors");
      expect(colors.getByText("Website").getAttribute("aria-checked")).toBe(
        "true"
      );
      expect(colors.getByText("Plugin").getAttribute("aria-checked")).toBe(
        "false"
      );
    });

    it("calls setColorMode when the inactive Colors option is clicked", () => {
      const setColorMode = vi.fn();
      const { container } = render(
        <SettingsPanel
          {...expandedProps}
          localColorMode="plugin"
          setColorMode={setColorMode}
        />
      );
      fireEvent.click(inGroup(container, "Colors").getByText("Website"));
      expect(setColorMode).toHaveBeenCalledWith("website");
    });

    it("calls setFontMode with 'lines' when the 'Wireframe' toggle is clicked", () => {
      const setFontMode = vi.fn();
      const { container } = render(
        <SettingsPanel {...expandedProps} setFontMode={setFontMode} />
      );
      fireEvent.click(inGroup(container, "Fonts").getByText("Wireframe"));
      expect(setFontMode).toHaveBeenCalledWith("lines");
    });

    it("calls setTextMode with 'semantic' when the 'Smart' toggle is clicked", () => {
      const setTextMode = vi.fn();
      const { container } = render(
        <SettingsPanel {...expandedProps} setTextMode={setTextMode} />
      );
      fireEvent.click(inGroup(container, "Text").getByText("Smart"));
      expect(setTextMode).toHaveBeenCalledWith("semantic");
    });

    it("calls setLayoutMode when the 'Absolute' toggle is clicked", () => {
      const setLayoutMode = vi.fn();
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          localLayoutMode="autoLayout"
          setLayoutMode={setLayoutMode}
        />
      );
      fireEvent.click(getByText("Absolute"));
      expect(setLayoutMode).toHaveBeenCalledWith("absolute");
    });

    it("calls setCssVariablesMode when the 'Figma Styles' toggle is clicked", () => {
      const setCssVariablesMode = vi.fn();
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          localCssVariablesMode="direct"
          setCssVariablesMode={setCssVariablesMode}
        />
      );
      fireEvent.click(getByText("Figma Styles"));
      expect(setCssVariablesMode).toHaveBeenCalledWith("styles");
    });

    it("disables a toggle option and does not fire its handler when disabled", () => {
      const setAssetMode = vi.fn();
      const { getByText } = render(
        <SettingsPanel
          {...expandedProps}
          localAssetMode="placeholders"
          setAssetMode={setAssetMode}
          disableRealAssetsOption={true}
          assetsDisabledTooltip="Not available here"
        />
      );
      const realBtn = getByText("Real Assets");
      expect(realBtn.hasAttribute("disabled")).toBe(true);
      fireEvent.click(realBtn);
      expect(setAssetMode).not.toHaveBeenCalled();
    });

  });
});
