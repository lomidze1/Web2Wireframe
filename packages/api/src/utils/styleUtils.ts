// Color and style utilities for Web2Wireframe

export interface ColorPalette {
  main: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  background: string;
}

export interface FontStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}

export interface FontConfig {
  primary: string;
  fallback: string;
  heading: FontStyle;
  body: FontStyle;
}

export interface ColorStyleEntry {
  id: string;
  name: string;
  value: string;
  category: string;
}

export interface TypographyStyleEntry {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}

export interface LocalStylesStructure {
  colors: ColorStyleEntry[];
  typography: TypographyStyleEntry[];
}

export interface FigmaRGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Default Plugin Colors - 6 color palette
 * Used when colorMode = "plugin-colors"
 */
export const DEFAULT_PLUGIN_COLORS: ColorPalette = {
  main: "#1f3a5f",      // Brand color, primary elements
  text: "#333333",      // All text colors
  accent: "#3b82f6",    // Buttons, links, CTAs
  surface: "#f5f5f5",   // Cards, containers, placeholders
  border: "#e0e0e0",    // Borders, dividers
  background: "#ffffff", // Page background
};

/**
 * Default Plugin Fonts
 * Used when typographyMode = "plugin-fonts"
 */
export const DEFAULT_PLUGIN_FONTS: FontConfig = {
  primary: "Montserrat",
  fallback: "Arial",
  heading: {
    fontFamily: "Montserrat",
    fontSize: 24,
    fontWeight: 600,
  },
  body: {
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 400,
  },
};

/**
 * Neutral wireframe color schemes
 */
export const NEUTRAL_COLORS: Record<string, ColorPalette> = {
  light: {
    main: "#6b7280",
    text: "#374151",
    accent: "#9ca3af",
    surface: "#f9fafb",
    border: "#e5e7eb",
    background: "#ffffff",
  },
  gray: {
    main: "#4b5563",
    text: "#1f2937",
    accent: "#6b7280",
    surface: "#f3f4f6",
    border: "#d1d5db",
    background: "#ffffff",
  },
  blue: {
    main: "#1e40af",
    text: "#1e3a5f",
    accent: "#3b82f6",
    surface: "#eff6ff",
    border: "#bfdbfe",
    background: "#ffffff",
  },
};

type ColorMode = "plugin" | "website" | "neutral-light" | "neutral-gray" | "neutral-blue";

/**
 * Get colors based on color mode
 * @param mode - Color mode
 * @param websiteColors - Extracted colors from website
 * @param customPluginColors - Custom plugin colors override
 * @returns Color palette to use
 */
export function getColorByMode(
  mode: ColorMode | string,
  websiteColors: Partial<ColorPalette> = {},
  customPluginColors: Partial<ColorPalette> = {},
): ColorPalette | Partial<ColorPalette> {
  switch (mode) {
    case "plugin":
      return { ...DEFAULT_PLUGIN_COLORS, ...customPluginColors };

    case "website":
      // Return website colors as-is (1:1 copy)
      return websiteColors;

    case "neutral-light":
      return NEUTRAL_COLORS.light;

    case "neutral-gray":
      return NEUTRAL_COLORS.gray;

    case "neutral-blue":
      return NEUTRAL_COLORS.blue;

    default:
      return { ...DEFAULT_PLUGIN_COLORS, ...customPluginColors };
  }
}

type TypographyMode = "plugin" | "website" | "lines";

/**
 * Get font based on typography mode
 * @param mode - Typography mode
 * @param websiteFonts - Extracted fonts from website
 * @param customFont - Custom plugin font override
 * @returns Font configuration to use
 */
export function getFontByMode(
  mode: TypographyMode | string,
  websiteFonts: Partial<FontConfig> = {},
  customFont: string | null = null,
): FontConfig | Partial<FontConfig> {
  switch (mode) {
    case "plugin": {
      const fontFamily = customFont || DEFAULT_PLUGIN_FONTS.primary;
      return {
        primary: fontFamily,
        fallback: DEFAULT_PLUGIN_FONTS.fallback,
        heading: {
          ...DEFAULT_PLUGIN_FONTS.heading,
          fontFamily,
        },
        body: {
          ...DEFAULT_PLUGIN_FONTS.body,
          fontFamily,
        },
      };
    }

    case "website":
      return websiteFonts;

    default:
      return DEFAULT_PLUGIN_FONTS;
  }
}

type ElementType =
  | "page-background"
  | "container"
  | "card"
  | "surface"
  | "button"
  | "link"
  | "cta"
  | "text"
  | "heading"
  | "border"
  | "divider"
  | "placeholder"
  | "image"
  | "video";

/**
 * Smart color mapping from website colors to plugin colors
 * Used to determine which plugin color to use for a website element
 * @param elementType - Type of element
 * @param websiteColor - Original website color
 * @param pluginColors - Plugin color palette
 * @returns Mapped plugin color
 */
export function mapColorToPlugin(
  elementType: ElementType | string,
  websiteColor: string | null | undefined,
  pluginColors: Partial<ColorPalette>,
): string {
  const colors: ColorPalette = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

  switch (elementType) {
    case "page-background":
      return colors.background;

    case "container":
    case "card":
    case "surface":
      return colors.surface;

    case "button":
    case "link":
    case "cta":
      return colors.accent;

    case "text":
    case "heading":
      return colors.text;

    case "border":
    case "divider":
      return colors.border;

    case "placeholder":
    case "image":
    case "video":
      return colors.surface;

    default:
      return websiteColor || colors.surface;
  }
}

/**
 * Create local styles structure for Figma
 * @param colors - Color palette
 * @param fonts - Font configuration
 * @returns Local styles structure
 */
export function createLocalStylesStructure(
  colors: Partial<ColorPalette> = {},
  fonts: Partial<FontConfig> = {},
): LocalStylesStructure {
  const finalColors: ColorPalette = { ...DEFAULT_PLUGIN_COLORS, ...colors };
  const finalFonts: FontConfig = { ...DEFAULT_PLUGIN_FONTS, ...fonts };

  return {
    colors: [
      {
        id: "color-main",
        name: "Main",
        value: finalColors.main,
        category: "primary",
      },
      {
        id: "color-text",
        name: "Text",
        value: finalColors.text,
        category: "text",
      },
      {
        id: "color-accent",
        name: "Accent",
        value: finalColors.accent,
        category: "accent",
      },
      {
        id: "color-surface",
        name: "Surface",
        value: finalColors.surface,
        category: "background",
      },
      {
        id: "color-border",
        name: "Border",
        value: finalColors.border,
        category: "border",
      },
      {
        id: "color-background",
        name: "Background",
        value: finalColors.background,
        category: "background",
      },
    ],
    typography: [
      {
        id: "typography-heading",
        name: "Heading",
        fontFamily: finalFonts.heading?.fontFamily || finalFonts.primary,
        fontSize: finalFonts.heading?.fontSize || 24,
        fontWeight: finalFonts.heading?.fontWeight || 600,
      },
      {
        id: "typography-body",
        name: "Body",
        fontFamily: finalFonts.body?.fontFamily || finalFonts.primary,
        fontSize: finalFonts.body?.fontSize || 14,
        fontWeight: finalFonts.body?.fontWeight || 400,
      },
    ],
  };
}

/**
 * Normalize color to hex format
 * @param color - Color string (rgb, rgba, hex, named)
 * @returns Hex color string or null
 */
export function normalizeColor(color: string | null | undefined): string | null {
  if (!color) return null;

  // Remove spaces
  const cleaned = color.replace(/\s/g, "");

  // Handle transparent
  if (cleaned === "transparent" || cleaned === "rgba(0,0,0,0)") {
    return null;
  }

  // Handle rgb/rgba
  if (cleaned.startsWith("rgb")) {
    return rgbToHex(cleaned);
  }

  // Validate hex
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(cleaned)) {
    // Expand 3-digit hex
    if (cleaned.length === 4) {
      return `#${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}${cleaned[3]}${cleaned[3]}`.toUpperCase();
    }
    return cleaned.toUpperCase();
  }

  return null;
}

/**
 * Convert RGB/RGBA to hex
 * @param rgb - RGB or RGBA string
 * @returns Hex color string or null
 */
export function rgbToHex(rgb: string): string | null {
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return null;

  // Check alpha for transparency
  if (result.length >= 4 && parseFloat(result[3]) === 0) {
    return null;
  }

  const r = parseInt(result[0]).toString(16).padStart(2, "0");
  const g = parseInt(result[1]).toString(16).padStart(2, "0");
  const b = parseInt(result[2]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

/**
 * Convert hex to Figma RGB (0-1 range)
 * @param hex - Hex color string
 * @returns RGB object with r, g, b values 0-1
 */
export function hexToFigmaRGB(hex: string | null | undefined): FigmaRGB {
  if (!hex || hex === "transparent") {
    return { r: 0, g: 0, b: 0 };
  }

  const cleanHex = hex.replace("#", "");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);

  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}
