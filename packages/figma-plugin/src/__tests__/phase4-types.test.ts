import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../ui/shared/ConfigContext";
import type {
  WireframeNode,
  WireframeFrame,
  RenderWireframeData,
  RenderContext,
} from "../types/index";

describe("Phase 4: Types & Config defaults", () => {
  it("DEFAULT_CONFIG includes assetMode with 'realAssets' default", () => {
    expect(DEFAULT_CONFIG.assetMode).toBe("realAssets");
  });

  it("WireframeNode accepts imageUrl field", () => {
    // Type-level test: if this compiles, the type is correct
    const node: Partial<WireframeNode> = {
      id: "test",
      imageUrl: "https://example.com/image.png",
    };
    expect(node.imageUrl).toBe("https://example.com/image.png");
  });

  it("WireframeFrame accepts assets field", () => {
    const frame: Partial<WireframeFrame> = {
      viewportWidth: 1440,
      viewportHeight: 900,
      assets: { "https://example.com/logo.png": "data:image/png;base64,abc" },
    };
    expect(frame.assets).toBeDefined();
    expect(frame.assets!["https://example.com/logo.png"]).toBe(
      "data:image/png;base64,abc"
    );
  });

  it("RenderWireframeData accepts assetMode field", () => {
    const data: Partial<RenderWireframeData> = {
      assetMode: "realAssets",
    };
    expect(data.assetMode).toBe("realAssets");
  });

  it("RenderContext accepts assetMode and assetsMap fields", () => {
    const ctx: Partial<RenderContext> = {
      assetMode: "realAssets",
      assetsMap: new Map([["url", "base64"]]),
    };
    expect(ctx.assetMode).toBe("realAssets");
    expect(ctx.assetsMap?.get("url")).toBe("base64");
  });
});
