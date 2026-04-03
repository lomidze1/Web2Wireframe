import { vi } from "vitest";
import {
  DEFAULT_CONFIG,
  type PluginConfig,
} from "../../ui/shared/ConfigContext";

/**
 * Creates a mock useConfig return value with sensible defaults.
 * Override any field as needed in individual tests.
 */
export function createMockConfigContext(
  configOverrides: Partial<PluginConfig> = {},
  extras: {
    sessionOverrides?: Record<string, Partial<PluginConfig>>;
  } = {}
) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };

  return {
    config,
    updateConfig: vi.fn(),
    sessionOverrides: extras.sessionOverrides ?? {},
    setSessionOverride: vi.fn(),
    clearSessionOverride: vi.fn(),
    getEffectiveConfig: vi.fn((tabId: string) => {
      const override = extras.sessionOverrides?.[tabId];
      if (override) return { ...config, ...override };
      return config;
    }),
    resetToConfig: vi.fn(),
    openSettings: vi.fn(),
    setOpenSettingsCallback: vi.fn(),
    isConfigLoaded: true,
  };
}
