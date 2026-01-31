/** @jsx h */
import { h, createContext } from "preact";
import { useState, useEffect, useContext } from "preact/hooks";

// Configuration types
export interface PluginColors {
  main: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  background: string;
}

export interface PluginConfig {
  viewports: string[];
  colorMode: "plugin" | "website";
  fontMode: "plugin" | "website";
  textMode: "semantic" | "lorem" | "website";
  pluginColors: PluginColors;
}

// Default plugin colors - 6 color palette for wireframes
export const DEFAULT_PLUGIN_COLORS: PluginColors = {
  main: "#1f3a5f",       // Brand color, primary elements
  text: "#333333",       // All text colors
  accent: "#3b82f6",     // Buttons, links, CTAs
  surface: "#f5f5f5",    // Cards, containers, placeholders
  border: "#e0e0e0",     // Borders, dividers
  background: "#ffffff", // Page background
};

// Default configuration
export const DEFAULT_CONFIG: PluginConfig = {
  viewports: ["1440"],
  colorMode: "plugin",
  fontMode: "plugin",
  textMode: "semantic",
  pluginColors: { ...DEFAULT_PLUGIN_COLORS },
};

// Available viewport options
export const VIEWPORT_OPTIONS = [
  { value: "1920", label: "1920" },
  { value: "1440", label: "1440" },
  { value: "1024", label: "1024" },
  { value: "768", label: "768" },
  { value: "375", label: "375" },
];

// Storage key for persistent config
const CONFIG_STORAGE_KEY = "w2w_plugin_config";

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
}

// Create context
const ConfigContext = createContext<ConfigContextType | null>(null);

// Cache localStorage availability - test only once
let cachedLocalStorageAvailability: boolean | null = null;

// Check if localStorage is available (not available in Figma plugin iframe)
function isLocalStorageAvailable(): boolean {
  // Return cached result if already tested
  if (cachedLocalStorageAvailability !== null) {
    return cachedLocalStorageAvailability;
  }

  try {
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    cachedLocalStorageAvailability = true;
  } catch (e) {
    cachedLocalStorageAvailability = false;
  }
  return cachedLocalStorageAvailability;
}

// In-memory storage fallback for Figma plugin environment
let inMemoryConfig: PluginConfig | null = null;

// Debounce timer for saving config
let saveTimer: number | null = null;

// Load config from storage
function loadConfig(): PluginConfig {
  // Return in-memory config if already loaded
  if (inMemoryConfig !== null) {
    return inMemoryConfig;
  }

  // Try localStorage if available
  if (isLocalStorageAvailable()) {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const config = { ...DEFAULT_CONFIG, ...parsed };
        inMemoryConfig = config;
        return config;
      }
    } catch (e) {
      console.warn("Failed to load config from localStorage:", e);
    }
  }

  const config = { ...DEFAULT_CONFIG };
  inMemoryConfig = config;
  return config;
}

// Save config to storage (debounced)
function saveConfig(config: PluginConfig): void {
  // Always update in-memory config immediately
  inMemoryConfig = config;

  // Skip localStorage if not available
  if (!isLocalStorageAvailable()) {
    return;
  }

  // Debounce localStorage writes to prevent rapid successive calls
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn("Failed to save config to localStorage:", e);
    }
    saveTimer = null;
  }, 250) as unknown as number;
}

// Provider component
export function ConfigProvider({
  children,
}: {
  children: preact.ComponentChildren;
}) {
  const [config, setConfig] = useState<PluginConfig>(loadConfig);
  const [sessionOverrides, setSessionOverrides] = useState<
    Record<string, Partial<PluginConfig>>
  >({});
  const [openSettingsCallback, setOpenSettingsCallbackState] = useState<
    ((panel: SettingsPanel) => void) | null
  >(null);

  // Save config when it changes
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // Update persistent config
  const updateConfig = (updates: Partial<PluginConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
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
