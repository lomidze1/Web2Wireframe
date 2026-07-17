import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../ui/shared/ConfigContext";

// Defaults switched from plugin-flavoured output to website-faithful output
// (2026-07-16): a first-run import should look like the source site, because
// users were not discovering the settings and judged the plugin on its
// out-of-the-box result.
describe("DEFAULT_CONFIG — website-faithful defaults", () => {
  it("defaults colors to the website palette", () => {
    expect(DEFAULT_CONFIG.colorMode).toBe("website");
  });

  it("defaults fonts to the website fonts", () => {
    expect(DEFAULT_CONFIG.fontMode).toBe("website");
  });

  it("defaults text to the website copy", () => {
    expect(DEFAULT_CONFIG.textMode).toBe("website");
  });

  it("defaults assets to the real website assets", () => {
    expect(DEFAULT_CONFIG.assetMode).toBe("realAssets");
  });

  it("leaves the plugin palette and font available as opt-in values", () => {
    // The plugin-flavoured values stay configured so switching back in the UI
    // still resolves to a concrete palette/font rather than undefined.
    expect(DEFAULT_CONFIG.pluginFont).toBe("Montserrat");
    expect(DEFAULT_CONFIG.pluginColors.text).toBe("#11151A");
  });
});
