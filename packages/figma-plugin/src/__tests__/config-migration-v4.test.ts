import { describe, it, expect } from "vitest";
import {
  deepMergeConfig,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
  type PluginConfig,
} from "../ui/shared/ConfigContext";

// v4 introduces `geometryRows` (promote a block container whose captured rects
// prove a left-to-right row to HORIZONTAL auto-layout, default OFF = today's
// CSS-driven behaviour). Every existing user has a full config snapshot in
// clientStorage without the key, so the migration must stamp the default in —
// editing DEFAULT_CONFIG alone reaches only brand-new installs.
describe("config migration → v4 (geometryRows)", () => {
  it("CONFIG_VERSION is 4 and the default is CSS layout (false)", () => {
    expect(CONFIG_VERSION).toBe(4);
    expect(DEFAULT_CONFIG.geometryRows).toBe(false);
  });

  it("a v3 config gains geometryRows: false and version 4", () => {
    const v3Saved: Partial<PluginConfig> = {
      configVersion: 3,
      htmlLayerNames: true,
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, v3Saved);
    expect(merged.geometryRows).toBe(false);
    expect(merged.configVersion).toBe(4);
    // v3 → v4 must NOT re-fire the earlier migrations.
    expect(merged.htmlLayerNames).toBe(true);
  });

  it("a pre-version legacy config gains geometryRows: false", () => {
    const legacySaved: Partial<PluginConfig> = {
      viewports: ["1920"],
      pluginFont: "Roboto",
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, legacySaved);
    expect(merged.geometryRows).toBe(false);
    expect(merged.configVersion).toBe(4);
    expect(merged.viewports).toEqual(["1920"]);
  });

  it("a deliberate geometryRows: true saved at v4 is preserved", () => {
    const v4Saved: Partial<PluginConfig> = {
      configVersion: 4,
      geometryRows: true,
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, v4Saved);
    expect(merged.geometryRows).toBe(true);
    expect(merged.configVersion).toBe(4);
  });
});
