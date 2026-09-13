import { describe, it, expect } from "vitest";
import {
  deepMergeConfig,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
  type PluginConfig,
} from "../ui/shared/ConfigContext";

// v3 introduces `htmlLayerNames` (h2d's "HTML layer names" toggle, default
// OFF = semantic naming). Every existing user has a full config snapshot in
// clientStorage without the key, so the migration must stamp the default in —
// editing DEFAULT_CONFIG alone reaches only brand-new installs.
describe("config migration → v3 (htmlLayerNames)", () => {
  it("CONFIG_VERSION is at least 3 and the default is semantic naming (false)", () => {
    expect(CONFIG_VERSION).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_CONFIG.htmlLayerNames).toBe(false);
  });

  it("a pre-version legacy config gains htmlLayerNames: false and the current version", () => {
    const legacySaved: Partial<PluginConfig> = {
      viewports: ["1920"],
      pluginFont: "Roboto",
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, legacySaved);
    expect(merged.htmlLayerNames).toBe(false);
    expect(merged.configVersion).toBe(CONFIG_VERSION);
    expect(merged.viewports).toEqual(["1920"]);
    expect(merged.pluginFont).toBe("Roboto");
  });

  it("a v2 config gains htmlLayerNames: false and the current version", () => {
    const v2Saved: Partial<PluginConfig> = {
      configVersion: 2,
      colorMode: "plugin",
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, v2Saved);
    expect(merged.htmlLayerNames).toBe(false);
    expect(merged.configVersion).toBe(CONFIG_VERSION);
    // v2 → v3 must NOT re-fire the v2 output-mode migration.
    expect(merged.colorMode).toBe("plugin");
  });

  it("a deliberate htmlLayerNames: true saved at v3 is preserved", () => {
    const v3Saved: Partial<PluginConfig> = {
      configVersion: 3,
      htmlLayerNames: true,
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, v3Saved);
    expect(merged.htmlLayerNames).toBe(true);
    expect(merged.configVersion).toBe(CONFIG_VERSION);
  });
});
