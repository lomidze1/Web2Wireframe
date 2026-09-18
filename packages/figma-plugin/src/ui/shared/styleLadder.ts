import type { PluginConfig } from "./ConfigContext";

export type StyleId = "wireframe" | "sketch" | "smartText";

export interface StyleSettings {
  colorMode: PluginConfig["colorMode"];
  fontMode: PluginConfig["fontMode"];
  textMode: PluginConfig["textMode"];
  assetMode: PluginConfig["assetMode"];
}

export interface StylePreset {
  id: StyleId;
  label: string;
  settings: StyleSettings;
}

/**
 * The next-step card's "try another style" ladder. Each step looks visibly
 * different on the canvas, so there is always a reason to import again: the
 * user already has the original, and every rung is a variant they don't.
 * `fontMode: "lines"` is the Fonts → "Wireframe" option; `textMode: "semantic"`
 * is Text → "Smart".
 */
export const STYLE_LADDER: readonly StylePreset[] = [
  {
    id: "wireframe",
    label: "✏️ Try wireframe style",
    settings: { colorMode: "plugin", fontMode: "plugin", textMode: "website", assetMode: "placeholders" },
  },
  {
    id: "sketch",
    label: "📐 Try low-fi sketch",
    settings: { colorMode: "plugin", fontMode: "lines", textMode: "website", assetMode: "placeholders" },
  },
  {
    id: "smartText",
    label: "🔤 Try smart placeholder text",
    settings: { colorMode: "plugin", fontMode: "plugin", textMode: "semantic", assetMode: "placeholders" },
  },
];

/** The ladder step an import's settings correspond to, if any. */
export function matchStyle(settings: StyleSettings): StyleId | null {
  const match = STYLE_LADDER.find(
    ({ settings: s }) =>
      s.colorMode === settings.colorMode &&
      s.fontMode === settings.fontMode &&
      s.textMode === settings.textMode &&
      s.assetMode === settings.assetMode
  );
  return match ? match.id : null;
}

/** The first step not tried yet, or null once all were. */
export function nextStyle(tried: readonly StyleId[]): StylePreset | null {
  return STYLE_LADDER.find((style) => !tried.includes(style.id)) ?? null;
}
