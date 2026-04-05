/** @jsx h */
import { h, createContext } from "preact";
import { useState, useEffect, useContext } from "preact/hooks";

// Configuration types
// 5-color minimalist wireframe palette
// Designed for clean, professional wireframes with WCAG AA contrast compliance
export interface PluginColors {
  // RULE: text color is ONLY for text content and placeholder icons - NEVER for backgrounds!
  text: string;         // #11151A - ALL text (headings, buttons, links, paragraphs) + placeholder icon
  // Light background colors
  background: string;   // #F1F2F0 - Page background, section backgrounds
  // Border/stroke color
  secondary: string;    // #BDC1B2 - Borders, strokes, muted elements
  // Surface color for containers
  surface: string;      // #AAB5C3 - Cards, containers, frames (blue-gray)
  // Accent color for interactive elements
  accent: string;       // #AFC6DC - Buttons, links, CTAs (light blue)
}

export interface PluginConfig {
  viewports: string[];
  colorMode: "plugin" | "website";
  fontMode: "plugin" | "website" | "lines";
  textMode: "semantic" | "lorem" | "website";
  assetMode: "placeholders" | "realAssets";
  pluginColors: PluginColors;
  pluginFont: string;
  // Import options settings
  showImportOptions: boolean;
  cssVariablesDefault: "styles" | "direct";
  layoutModeDefault: "autoLayout" | "absolute";
  interactionMode: "none" | "variants";
}

// Default plugin colors - Minimalist 5-color wireframe palette
// Optimized for: readability, visual hierarchy, WCAG AA contrast compliance
// RULE: text color (#11151A) is ONLY for text content and placeholder icons - never for backgrounds!
export const DEFAULT_PLUGIN_COLORS: PluginColors = {
  text: "#11151A",         // Primary text ONLY (dark) - never use for backgrounds/fills
  background: "#F1F2F0",   // Page background, section backgrounds (light)
  secondary: "#CED7E4",    // Borders, strokes, highlighted/active cards
  surface: "#AAB5C3",      // Cards, containers, sections (blue-gray)
  accent: "#AFC6DC",       // Buttons, links, CTAs (light blue)
};

// Default plugin font
export const DEFAULT_PLUGIN_FONT = "Montserrat";

// Available font options for plugin fonts
export const PLUGIN_FONT_OPTIONS = [
  { value: "Montserrat", label: "Montserrat" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Poppins", label: "Poppins" },
  { value: "Source Sans Pro", label: "Source Sans Pro" },
  { value: "Nunito", label: "Nunito" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
];

// Default configuration
export const DEFAULT_CONFIG: PluginConfig = {
  viewports: ["1440"],
  colorMode: "plugin",
  fontMode: "plugin",
  textMode: "semantic",
  assetMode: "placeholders",
  pluginColors: { ...DEFAULT_PLUGIN_COLORS },
  pluginFont: DEFAULT_PLUGIN_FONT,
  // Import options defaults
  showImportOptions: true,
  cssVariablesDefault: "direct",
  layoutModeDefault: "autoLayout",
  interactionMode: "none",
};

// Available viewport options
export const VIEWPORT_OPTIONS = [
  { value: "1920", label: "1920" },
  { value: "1440", label: "1440" },
  { value: "1024", label: "1024" },
  { value: "768", label: "768" },
  { value: "375", label: "375" },
];

// Settings panel type
export type SettingsPanel = "terminology" | "configuration" | "tutorials";

// Context type
interface ConfigContextType {
  config: PluginConfig;
  updateConfig: (updates: Partial<PluginConfig>) => void;
  sessionOverrides: Record<string, Partial<PluginConfig>>;
  setSessionOverride: (tabId: string, overrides: Partial<PluginConfig>) => void;
  clearSessionOverride: (tabId: string) => void;
  getEffectiveConfig: (tabId: string) => PluginConfig;
  resetToConfig: (tabId: string) => void;
  openSettings?: (panel: SettingsPanel) => void;
  setOpenSettingsCallback?: (callback: (panel: SettingsPanel) => void) => void;
  isConfigLoaded: boolean;
}

// Create context
const ConfigContext = createContext<ConfigContextType | null>(null);

// Deep merge for nested objects like pluginColors
function deepMergeConfig(defaults: PluginConfig, saved: Partial<PluginConfig>): PluginConfig {
  const merged = { ...defaults };

  for (const key of Object.keys(saved) as (keyof PluginConfig)[]) {
    const savedValue = saved[key];
    if (savedValue === undefined) continue;

    // Special handling for pluginColors - deep merge
    if (key === "pluginColors" && typeof savedValue === "object") {
      merged.pluginColors = {
        ...defaults.pluginColors,
        ...(savedValue as Partial<PluginColors>),
      };
    } else {
      // Direct assignment for other properties
      (merged as Record<string, unknown>)[key] = savedValue;
    }
  }

  // Migration: "wireframe" → "semantic" (renamed back in v3)
  if ((merged.textMode as string) === "wireframe") {
    merged.textMode = "semantic";
  }

  return merged;
}

// Debounce timer for saving config
let saveTimer: number | null = null;

// Send message to Figma backend to save config (debounced)
function saveConfigToBackend(config: PluginConfig): void {
  // Debounce to prevent rapid successive saves
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(() => {
    parent.postMessage(
      { pluginMessage: { type: "save-config", data: { config } } },
      "*"
    );
    saveTimer = null;
  }, 300) as unknown as number;
}

// Provider component
export function ConfigProvider({
  children,
}: {
  children: preact.ComponentChildren;
}) {
  const [config, setConfig] = useState<PluginConfig>({ ...DEFAULT_CONFIG });
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [sessionOverrides, setSessionOverrides] = useState<
    Record<string, Partial<PluginConfig>>
  >({});
  const [openSettingsCallback, setOpenSettingsCallbackState] = useState<
    ((panel: SettingsPanel) => void) | null
  >(null);

  // Load config from Figma backend on mount
  useEffect(() => {
    // Request config from Figma backend
    parent.postMessage(
      { pluginMessage: { type: "load-config" } },
      "*"
    );

    // Listen for config-loaded response from backend
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === "config-loaded") {
        const savedConfig = msg.data?.config;
        if (savedConfig) {
          // Deep merge saved config with defaults
          const mergedConfig = deepMergeConfig(DEFAULT_CONFIG, savedConfig);
          setConfig(mergedConfig);
        }
        setIsConfigLoaded(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Save config to Figma backend when it changes (after initial load)
  useEffect(() => {
    if (isConfigLoaded) {
      saveConfigToBackend(config);
    }
  }, [config, isConfigLoaded]);

  // Update persistent config
  const updateConfig = (updates: Partial<PluginConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev };

      // Handle pluginColors specially to deep merge
      if (updates.pluginColors) {
        updated.pluginColors = {
          ...prev.pluginColors,
          ...updates.pluginColors,
        };
        // Remove pluginColors from updates to avoid double assignment
        const { pluginColors: _, ...otherUpdates } = updates;
        return { ...updated, ...otherUpdates };
      }

      return { ...updated, ...updates };
    });
  };

  // Set session override for a specific tab
  const setSessionOverride = (
    tabId: string,
    overrides: Partial<PluginConfig>
  ) => {
    setSessionOverrides((prev) => ({
      ...prev,
      [tabId]: { ...(prev[tabId] || {}), ...overrides },
    }));
  };

  // Clear session override for a specific tab
  const clearSessionOverride = (tabId: string) => {
    setSessionOverrides((prev) => {
      const newOverrides = { ...prev };
      delete newOverrides[tabId];
      return newOverrides;
    });
  };

  // Get effective config for a tab (config + session overrides)
  const getEffectiveConfig = (tabId: string): PluginConfig => {
    const override = sessionOverrides[tabId];
    if (override) {
      return { ...config, ...override };
    }
    return config;
  };

  // Reset tab to use config defaults
  const resetToConfig = (tabId: string) => {
    clearSessionOverride(tabId);
  };

  // Open settings modal
  const openSettings = (panel: SettingsPanel) => {
    if (openSettingsCallback) {
      openSettingsCallback(panel);
    }
  };

  // Set the callback for opening settings
  const setOpenSettingsCallback = (
    callback: (panel: SettingsPanel) => void
  ) => {
    setOpenSettingsCallbackState(() => callback);
  };

  return (
    <ConfigContext.Provider
      value={{
        config,
        updateConfig,
        sessionOverrides,
        setSessionOverride,
        clearSessionOverride,
        getEffectiveConfig,
        resetToConfig,
        openSettings,
        setOpenSettingsCallback,
        isConfigLoaded,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

// Hook to use config
export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider");
  }
  return context;
}
