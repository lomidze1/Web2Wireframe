import { describe, it, expect } from "vitest";
import {
  deepMergeConfig,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
  type PluginConfig,
} from "../ui/shared/ConfigContext";

// v5 introduces `originLinks` (the "Links" import option — default ON, i.e.
// today's behaviour of carrying the site's links into Figma). Existing users
// have a full config snapshot in clientStorage without the key, and an absent
// boolean would read as "off": the migration must stamp the default in.
describe("config migration → v5 (originLinks)", () => {
  it("links are on by default", () => {
    expect(CONFIG_VERSION).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_CONFIG.originLinks).toBe(true);
  });

  it("a v4 config gains originLinks: true and the current version", () => {
    const v4Saved: Partial<PluginConfig> = {
      configVersion: 4,
      geometryRows: true,
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, v4Saved);
    expect(merged.originLinks).toBe(true);
    expect(merged.configVersion).toBe(CONFIG_VERSION);
    // v4 → v5 must NOT re-fire the earlier migrations.
    expect(merged.geometryRows).toBe(true);
  });

  it("a pre-version legacy config gains originLinks: true", () => {
    const legacySaved: Partial<PluginConfig> = {
      viewports: ["1920"],
      pluginFont: "Roboto",
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, legacySaved);
    expect(merged.originLinks).toBe(true);
    expect(merged.viewports).toEqual(["1920"]);
  });

  it("a deliberate originLinks: false saved at v5 is preserved", () => {
    const v5Saved: Partial<PluginConfig> = {
      configVersion: 5,
      originLinks: false,
    };
    const merged = deepMergeConfig(DEFAULT_CONFIG, v5Saved);
    expect(merged.originLinks).toBe(false);
  });

  it("an originLinks: false saved BEFORE v5 is overwritten by the default", () => {
    // Nobody could have chosen it — the option did not exist yet — so a stray
    // false in an old snapshot must not silently strip a user's links.
    const stale: Partial<PluginConfig> = {
      configVersion: 4,
      originLinks: false,
    };
    expect(deepMergeConfig(DEFAULT_CONFIG, stale).originLinks).toBe(true);
  });
});
