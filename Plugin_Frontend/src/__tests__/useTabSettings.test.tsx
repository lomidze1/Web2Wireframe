import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useTabSettings } from "../ui/hooks/useTabSettings";
import { createMockConfigContext } from "./helpers/configMock";
import { DEFAULT_CONFIG } from "../ui/shared/ConfigContext";

// Mock useConfig while preserving real exports
const mockContext = createMockConfigContext();
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => mockContext,
  };
});

describe("useTabSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock context to defaults
    Object.assign(mockContext, createMockConfigContext());
  });

  it("initializes local state from config", () => {
    const { result } = renderHook(() =>
      useTabSettings("web", "web-settings-expanded")
    );

    expect(result.current.localColorMode).toBe(DEFAULT_CONFIG.colorMode);
    expect(result.current.localFontMode).toBe(DEFAULT_CONFIG.fontMode);
    expect(result.current.localTextMode).toBe(DEFAULT_CONFIG.textMode);
    expect(result.current.localCssVariablesMode).toBe(
      DEFAULT_CONFIG.cssVariablesDefault
    );
    expect(result.current.localLayoutMode).toBe(
      DEFAULT_CONFIG.layoutModeDefault
    );
  });

  it("starts collapsed by default", () => {
    const { result } = renderHook(() =>
      useTabSettings("web", "web-settings-expanded")
    );

    expect(result.current.isExpanded).toBe(false);
  });

  it("toggles expanded state", () => {
    const { result } = renderHook(() =>
      useTabSettings("web", "web-settings-expanded")
    );

    act(() => {
      result.current.toggleExpanded();
    });
    expect(result.current.isExpanded).toBe(true);

    act(() => {
      result.current.toggleExpanded();
    });
    expect(result.current.isExpanded).toBe(false);
  });

  it("reports no overrides initially", () => {
    const { result } = renderHook(() =>
      useTabSettings("web", "web-settings-expanded")
    );

    expect(result.current.hasOverrides).toBe(false);
  });

  describe("setColorMode", () => {
    it("updates local color mode and creates session override", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.setColorMode("website");
      });

      expect(result.current.localColorMode).toBe("website");
      expect(mockContext.setSessionOverride).toHaveBeenCalledWith("web", {
        colorMode: "website",
      });
    });
  });

  describe("setFontMode", () => {
    it("updates local font mode and creates session override", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.setFontMode("website");
      });

      expect(result.current.localFontMode).toBe("website");
      expect(mockContext.setSessionOverride).toHaveBeenCalledWith("web", {
        fontMode: "website",
      });
    });
  });

  describe("setTextMode", () => {
    it("updates local text mode and creates session override", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.setTextMode("lorem");
      });

      expect(result.current.localTextMode).toBe("lorem");
      expect(mockContext.setSessionOverride).toHaveBeenCalledWith("web", {
        textMode: "lorem",
      });
    });
  });

  describe("setCssVariablesMode", () => {
    it("updates local CSS variables mode and creates session override", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.setCssVariablesMode("styles");
      });

      expect(result.current.localCssVariablesMode).toBe("styles");
      expect(mockContext.setSessionOverride).toHaveBeenCalledWith("web", {
        cssVariablesDefault: "styles",
      });
    });
  });

  describe("setLayoutMode", () => {
    it("updates local layout mode and creates session override", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.setLayoutMode("absolute");
      });

      expect(result.current.localLayoutMode).toBe("absolute");
      expect(mockContext.setSessionOverride).toHaveBeenCalledWith("web", {
        layoutModeDefault: "absolute",
      });
    });
  });

  describe("toggleViewport", () => {
    it("adds a viewport when not selected", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.toggleViewport("1920");
      });

      expect(result.current.localViewports).toContain("1920");
      expect(mockContext.setSessionOverride).toHaveBeenCalledWith(
        "web",
        expect.objectContaining({
          viewports: expect.arrayContaining(["1440", "1920"]),
        })
      );
    });

    it("removes a viewport when already selected (if not last)", () => {
      // Start with two viewports
      mockContext.getEffectiveConfig = vi.fn(() => ({
        ...DEFAULT_CONFIG,
        viewports: ["1440", "1920"],
      }));

      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.toggleViewport("1920");
      });

      expect(result.current.localViewports).not.toContain("1920");
    });

    it("prevents removing the last viewport", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      // Default has only ["1440"], try to remove it
      act(() => {
        result.current.toggleViewport("1440");
      });

      // Should still have 1440
      expect(result.current.localViewports).toContain("1440");
    });
  });

  describe("handleSaveAsDefault", () => {
    it("calls updateConfig with all current local values", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      // Change some values first
      act(() => {
        result.current.setColorMode("website");
        result.current.setFontMode("website");
        result.current.setTextMode("lorem");
        result.current.setCssVariablesMode("styles");
        result.current.setLayoutMode("absolute");
      });

      act(() => {
        result.current.handleSaveAsDefault();
      });

      expect(mockContext.updateConfig).toHaveBeenCalledWith({
        viewports: expect.any(Array),
        colorMode: "website",
        fontMode: "website",
        textMode: "lorem",
        cssVariablesDefault: "styles",
        layoutModeDefault: "absolute",
      });
    });

    it("calls resetToConfig to clear session overrides after saving", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      act(() => {
        result.current.handleSaveAsDefault();
      });

      expect(mockContext.resetToConfig).toHaveBeenCalledWith("web");
    });
  });

  describe("handleReset", () => {
    it("calls resetToConfig and syncs local state with config", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      // Change a value
      act(() => {
        result.current.setColorMode("website");
      });

      // Reset
      act(() => {
        result.current.handleReset();
      });

      expect(mockContext.resetToConfig).toHaveBeenCalledWith("web");
      expect(result.current.localColorMode).toBe(DEFAULT_CONFIG.colorMode);
    });
  });

  describe("collapseSettings", () => {
    it("sets isExpanded to false", () => {
      const { result } = renderHook(() =>
        useTabSettings("web", "web-settings-expanded")
      );

      // First expand
      act(() => {
        result.current.toggleExpanded();
      });
      expect(result.current.isExpanded).toBe(true);

      // Then collapse
      act(() => {
        result.current.collapseSettings();
      });
      expect(result.current.isExpanded).toBe(false);
    });
  });
});
