import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { useConfig } from "../shared/ConfigContext";

// Safe localStorage helper for Figma plugin environment
const safeGetStorage = (key: string, defaultValue: boolean): boolean => {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === "true" : defaultValue;
  } catch {
    return defaultValue;
  }
};

const safeSetStorage = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage not available in Figma plugin
  }
};

export interface TabSettingsResult {
  // Expand/collapse state
  isExpanded: boolean;
  toggleExpanded: () => void;
  collapseSettings: () => void;

  // Local values
  localViewports: string[];
  localColorMode: "plugin" | "website";
  localFontMode: "plugin" | "website";
  localTextMode: "semantic" | "lorem" | "website";
  localCssVariablesMode: "styles" | "direct";
  localLayoutMode: "autoLayout" | "absolute";

  // Handlers
  toggleViewport: (viewport: string, event?: Event) => boolean;
  setColorMode: (mode: "plugin" | "website") => void;
  setFontMode: (mode: "plugin" | "website") => void;
  setTextMode: (mode: "semantic" | "lorem" | "website") => void;
  setCssVariablesMode: (mode: "styles" | "direct") => void;
  setLayoutMode: (mode: "autoLayout" | "absolute") => void;
  handleReset: () => void;

  // State flags
  hasOverrides: boolean;

  // Config context passthrough
  openSettings:
    | ((panel: "terminology" | "configuration" | "tutorials") => void)
    | undefined;
}

/**
 * Custom hook that manages tab-specific settings state with session overrides.
 * Extracts common logic from Web.tsx, Screenshot.tsx, HTML.tsx
 *
 * @param tabId - Unique identifier for this tab (e.g., "web", "screenshot", "html")
 * @param storageKey - localStorage key for persisting expand/collapse state
 * @returns TabSettingsResult object with all state and handlers
 */
export function useTabSettings(
  tabId: string,
  storageKey: string
): TabSettingsResult {
  const {
    config,
    getEffectiveConfig,
    setSessionOverride,
    resetToConfig,
    sessionOverrides,
    openSettings,
  } = useConfig();

  // Get effective config for this tab (includes any existing overrides)
  const effectiveConfig = getEffectiveConfig(tabId);

  // Collapsible state - defaults to collapsed, but remembers user preference
  const [isExpanded, setIsExpanded] = useState(() =>
    safeGetStorage(storageKey, false)
  );

  // Local state for this tab (session overrides)
  // Initialize from effectiveConfig to respect existing overrides
  const [localViewports, setLocalViewports] = useState<string[]>(
    effectiveConfig.viewports
  );
  const [localColorMode, setLocalColorMode] = useState<"plugin" | "website">(
    effectiveConfig.colorMode
  );
  const [localFontMode, setLocalFontMode] = useState<"plugin" | "website">(
    effectiveConfig.fontMode
  );
  const [localTextMode, setLocalTextMode] = useState<
    "semantic" | "lorem" | "website"
  >(effectiveConfig.textMode);
  const [localCssVariablesMode, setLocalCssVariablesMode] = useState<
    "styles" | "direct"
  >(effectiveConfig.cssVariablesDefault);
  const [localLayoutMode, setLocalLayoutMode] = useState<
    "autoLayout" | "absolute"
  >(effectiveConfig.layoutModeDefault);

  // Check if there are any session overrides for this tab
  const hasOverrides = !!sessionOverrides[tabId];

  // Track if this is the initial mount to avoid unnecessary sync
  const isInitialMount = useRef(true);

  // Sync with config when config changes (and no overrides exist)
  // Use getEffectiveConfig instead of config directly for correct behavior
  useEffect(() => {
    // Skip initial mount since we already initialized from effectiveConfig
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Only sync if there are no overrides for this tab
    if (!hasOverrides) {
      const effective = getEffectiveConfig(tabId);
      setLocalViewports(effective.viewports);
      setLocalColorMode(effective.colorMode);
      setLocalFontMode(effective.fontMode);
      setLocalTextMode(effective.textMode);
      setLocalCssVariablesMode(effective.cssVariablesDefault);
      setLocalLayoutMode(effective.layoutModeDefault);
    }
  }, [
    // Use config values as dependencies since getEffectiveConfig returns config when no overrides
    config.viewports.join(","),
    config.colorMode,
    config.fontMode,
    config.textMode,
    config.cssVariablesDefault,
    config.layoutModeDefault,
    hasOverrides,
    tabId,
    getEffectiveConfig,
  ]);

  // Update session override when local viewports change
  const updateLocalViewports = useCallback(
    (viewports: string[]) => {
      setLocalViewports(viewports);
      setSessionOverride(tabId, { viewports });
    },
    [tabId, setSessionOverride]
  );

  // Update session override when color mode changes
  const setColorModeHandler = useCallback(
    (mode: "plugin" | "website") => {
      setLocalColorMode(mode);
      setSessionOverride(tabId, { colorMode: mode });
    },
    [tabId, setSessionOverride]
  );

  // Update session override when font mode changes
  const setFontModeHandler = useCallback(
    (mode: "plugin" | "website") => {
      setLocalFontMode(mode);
      setSessionOverride(tabId, { fontMode: mode });
    },
    [tabId, setSessionOverride]
  );

  // Update session override when text mode changes
  const setTextModeHandler = useCallback(
    (mode: "semantic" | "lorem" | "website") => {
      setLocalTextMode(mode);
      setSessionOverride(tabId, { textMode: mode });
    },
    [tabId, setSessionOverride]
  );

  // Update session override when CSS variables mode changes
  const setCssVariablesModeHandler = useCallback(
    (mode: "styles" | "direct") => {
      setLocalCssVariablesMode(mode);
      setSessionOverride(tabId, { cssVariablesDefault: mode });
    },
    [tabId, setSessionOverride]
  );

  // Update session override when layout mode changes
  const setLayoutModeHandler = useCallback(
    (mode: "autoLayout" | "absolute") => {
      setLocalLayoutMode(mode);
      setSessionOverride(tabId, { layoutModeDefault: mode });
    },
    [tabId, setSessionOverride]
  );

  // Toggle viewport selection - returns false if trying to remove last viewport
  const toggleViewport = useCallback(
    (viewport: string, event?: Event): boolean => {
      if (event) {
        event.stopPropagation();
        event.preventDefault(); // Prevent double-trigger from label
      }

      let wasBlocked = false;

      setLocalViewports((current) => {
        let newViewports: string[];
        if (current.includes(viewport)) {
          // Can't remove last viewport
          if (current.length > 1) {
            newViewports = current.filter((v) => v !== viewport);
          } else {
            wasBlocked = true;
            return current; // Return unchanged
          }
        } else {
          newViewports = [...current, viewport];
        }

        // Update session override
        setSessionOverride(tabId, { viewports: newViewports });
        return newViewports;
      });

      return !wasBlocked;
    },
    [tabId, setSessionOverride]
  );

  // Reset to config defaults
  const handleReset = useCallback(() => {
    resetToConfig(tabId);
    // Sync local state with config (not effectiveConfig, since we just cleared overrides)
    setLocalViewports(config.viewports);
    setLocalColorMode(config.colorMode);
    setLocalFontMode(config.fontMode);
    setLocalTextMode(config.textMode);
    setLocalCssVariablesMode(config.cssVariablesDefault);
    setLocalLayoutMode(config.layoutModeDefault);
  }, [tabId, resetToConfig, config]);

  // Toggle expanded state and save to localStorage
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const newState = !prev;
      safeSetStorage(storageKey, newState);
      return newState;
    });
  }, [storageKey]);

  // Collapse settings panel (useful when starting import)
  const collapseSettings = useCallback(() => {
    setIsExpanded(false);
    safeSetStorage(storageKey, false);
  }, [storageKey]);

  return {
    isExpanded,
    toggleExpanded,
    collapseSettings,
    localViewports,
    localColorMode,
    localFontMode,
    localTextMode,
    localCssVariablesMode,
    localLayoutMode,
    toggleViewport,
    setColorMode: setColorModeHandler,
    setFontMode: setFontModeHandler,
    setTextMode: setTextModeHandler,
    setCssVariablesMode: setCssVariablesModeHandler,
    setLayoutMode: setLayoutModeHandler,
    handleReset,
    hasOverrides,
    openSettings,
  };
}
