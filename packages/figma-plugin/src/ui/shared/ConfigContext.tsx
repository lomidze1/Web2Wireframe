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

/**
 * Schema version of a persisted config. Bumped when a default changes in a way
 * that must reach users who already have a config in clientStorage — the
 * provider writes a full snapshot on first load, so a bare DEFAULT_CONFIG edit
 * only ever reaches brand-new installs. See `deepMergeConfig`.
 *
 * v2 (2026-07-16): colorMode/fontMode/textMode/assetMode → website-faithful.
 * v3 (2026-08-27): htmlLayerNames added (h2d's "HTML layer names" toggle,
 *                  default OFF = semantic layer naming).
 * v4 (2026-08-30): geometryRows added (promote block containers whose captured
 *                  rects prove a horizontal row, default OFF = CSS layout).
 */
export const CONFIG_VERSION = 4;

export interface PluginConfig {
  // Absent on configs written before CONFIG_VERSION existed (treated as v1).
  configVersion?: number;
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
  // h2d parity: true = legacy tag#id / tag.class layer names; false
  // (default) = semantic two-stage naming ("Header", "Link - Sign in", …).
  htmlLayerNames: boolean;
  // true = a block container whose children's captured rects prove a
  // left-to-right row becomes a HORIZONTAL auto-layout; false (default) = the
  // CSS decides, and an unproven block container stays absolute.
  geometryRows: boolean;
  // Figma user identity (re-emitted by sandbox on every plugin open;
  // primary key for License lookups). Not persisted to clientStorage —
  // sandbox always overwrites with the live `figma.currentUser?.id`.
  figmaUserId: string | null;
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
// Defaults favour the website's own colors/fonts/text/assets: a first-run
// import should read as a faithful copy of the source. The plugin-flavoured
// wireframe look stays one dropdown away (see SettingsPanel).
export const DEFAULT_CONFIG: PluginConfig = {
  configVersion: CONFIG_VERSION,
  viewports: ["1440"],
  colorMode: "website",
  fontMode: "website",
  textMode: "website",
  assetMode: "realAssets",
  pluginColors: { ...DEFAULT_PLUGIN_COLORS },
  pluginFont: DEFAULT_PLUGIN_FONT,
  // Import options defaults
  showImportOptions: true,
  cssVariablesDefault: "direct",
  layoutModeDefault: "autoLayout",
  interactionMode: "none",
  htmlLayerNames: false,
  geometryRows: false,
  // Figma user id starts null until sandbox responds to `get-current-user`.
  figmaUserId: null,
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
export function deepMergeConfig(defaults: PluginConfig, saved: Partial<PluginConfig>): PluginConfig {
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

  // Migration → v2: adopt the website-faithful output modes once. Users who
  // never opened the settings still have the old plugin-flavoured values
  // frozen in clientStorage (the provider snapshots DEFAULT_CONFIG on first
  // load), so without this they would never see the new defaults. Scoped to
  // the four output modes — viewports, fonts and layout prefs are left alone.
  // Anything saved at v2 or later is a deliberate choice and is preserved.
  // Compares against 2 (not CONFIG_VERSION) so later bumps never re-fire it.
  if ((saved.configVersion ?? 1) < 2) {
    merged.colorMode = defaults.colorMode;
    merged.fontMode = defaults.fontMode;
    merged.textMode = defaults.textMode;
    merged.assetMode = defaults.assetMode;
  }

  // Migration → v3: stamp in htmlLayerNames (default false = semantic
  // naming) for configs snapshotted before the key existed. A true saved at
  // v3+ is a deliberate opt-in to DOM-selector names and is preserved.
  if ((saved.configVersion ?? 1) < 3) {
    merged.htmlLayerNames = defaults.htmlLayerNames;
  }

  // Migration → v4: stamp in geometryRows (default false = today's CSS-driven
  // layout) for configs snapshotted before the key existed. A true saved at
  // v4+ is a deliberate opt-in and is preserved.
  if ((saved.configVersion ?? 1) < 4) {
    merged.geometryRows = defaults.geometryRows;
  }

  if ((saved.configVersion ?? 1) < CONFIG_VERSION) {
    merged.configVersion = CONFIG_VERSION;
  }

  return merged;
}

// Debounce timer for saving config
let saveTimer: number | null = null;

// Send message to Figma backend to save config (debounced).
// `figmaUserId` is excluded from persistence — it's re-emitted by the sandbox
// on every plugin open as the live `figma.currentUser?.id`, so persisting a
// stale value would cause confusion if the user signs into a different account.
function saveConfigToBackend(config: PluginConfig): void {
  // Debounce to prevent rapid successive saves
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(() => {
    const { figmaUserId: _omit, ...persistable } = config;
    parent.postMessage(
      { pluginMessage: { type: "save-config", data: { config: persistable } } },
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

  // Load config from Figma backend on mount + request the current Figma user id
  useEffect(() => {
    // Request config from Figma backend
    parent.postMessage(
      { pluginMessage: { type: "load-config" } },
      "*"
    );
    // Request the live figma.currentUser.id from the sandbox
    parent.postMessage(
      { pluginMessage: { type: "get-current-user" } },
      "*"
    );

    // Listen for sandbox responses
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === "config-loaded") {
        const savedConfig = msg.data?.config;
        if (savedConfig) {
          // Deep merge saved config with defaults. Preserve any
          // figmaUserId that may have already arrived via the parallel
          // `current-user` message — the saved config never persists it
          // (see saveConfigToBackend), so we must not let the merge
          // clobber the live value to null. Without this guard, the Plan
          // modal sticks on "Identifying Figma user…" whenever
          // `config-loaded` arrives after `current-user`.
          setConfig((prev) => ({
            ...deepMergeConfig(DEFAULT_CONFIG, savedConfig),
            figmaUserId: prev.figmaUserId,
          }));
        }
        setIsConfigLoaded(true);
      }

      if (msg.type === "current-user") {
        const userId: string | null = msg.data?.userId ?? null;
        setConfig((prev) => ({ ...prev, figmaUserId: userId }));
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
