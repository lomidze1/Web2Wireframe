import { describe, it, expect } from "vitest";
import {
  deepMergeConfig,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
  type PluginConfig,
} from "../ui/shared/ConfigContext";

// Every user who ever opened the plugin has a full config snapshot in
// clientStorage — the provider persists DEFAULT_CONFIG on first load, even if
// the user never touched a setting. So flipping DEFAULT_CONFIG alone would
// reach nobody but brand-new installs. v2 re-applies the four output modes
// once, for configs written before the version field existed.
describe("config migration → v2 (website-faithful defaults)", () => {
  // A config as written by the pre-v2 plugin: no configVersion field.
  const legacySaved: Partial<PluginConfig> = {
    viewports: ["1920", "768"],
    colorMode: "plugin",
    fontMode: "plugin",
    textMode: "semantic",
    assetMode: "placeholders",
    pluginFont: "Roboto",
    layoutModeDefault: "absolute",
    cssVariablesDefault: "styles",
  };

  it("re-applies the four output modes for a legacy config", () => {
    const merged = deepMergeConfig(DEFAULT_CONFIG, legacySaved);

    expect(merged.colorMode).toBe("website");
    expect(merged.fontMode).toBe("website");
    expect(merged.textMode).toBe("website");
    expect(merged.assetMode).toBe("realAssets");
  });

  it("stamps the migrated config so it only ever runs once", () => {
    const merged = deepMergeConfig(DEFAULT_CONFIG, legacySaved);
    expect(merged.configVersion).toBe(CONFIG_VERSION);
  });

  it("leaves unrelated settings untouched while migrating", () => {
    // The migration is about output modes only — it must not reset the user's
    // viewports, font choice, or layout/variable preferences.
    const merged = deepMergeConfig(DEFAULT_CONFIG, legacySaved);

    expect(merged.viewports).toEqual(["1920", "768"]);
    expect(merged.pluginFont).toBe("Roboto");
    expect(merged.layoutModeDefault).toBe("absolute");
    expect(merged.cssVariablesDefault).toBe("styles");
  });

  it("respects a deliberate post-migration choice of plugin modes", () => {
    // Once migrated, a user who switches back to the plugin look must keep it
    // across restarts — otherwise the migration re-fires forever.
    const alreadyMigrated: Partial<PluginConfig> = {
      ...legacySaved,
      configVersion: CONFIG_VERSION,
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, alreadyMigrated);

    expect(merged.colorMode).toBe("plugin");
    expect(merged.fontMode).toBe("plugin");
    expect(merged.textMode).toBe("semantic");
    expect(merged.assetMode).toBe("placeholders");
  });

  it("still applies the existing wireframe → semantic rename for legacy configs", () => {
    // Guard the older migration: a pre-v2 config carrying the retired
    // "wireframe" value must not survive as an invalid textMode.
    const merged = deepMergeConfig(DEFAULT_CONFIG, {
      ...legacySaved,
      textMode: "wireframe" as PluginConfig["textMode"],
    });
    // v2 moves textMode to "website" regardless; the point is it is valid.
    expect(["semantic", "website"]).toContain(merged.textMode);
  });
});
