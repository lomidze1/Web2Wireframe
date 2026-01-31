// Color and style utilities for Web2Wireframe

/**
 * Default Plugin Colors - 6 color palette
 * Used when colorMode = "plugin-colors"
 */
const DEFAULT_PLUGIN_COLORS = {
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
const DEFAULT_PLUGIN_FONTS = {
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
const NEUTRAL_COLORS = {
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

/**
 * Get colors based on color mode
 * @param {string} mode - Color mode: "plugin-colors" | "website-colors"
 * @param {object} websiteColors - Extracted colors from website
 * @param {object} customPluginColors - Custom plugin colors override
 * @returns {object} Color palette to use
 */
function getColorByMode(mode, websiteColors = {}, customPluginColors = {}) {
  switch (mode) {
    case "plugin-colors":
      return { ...DEFAULT_PLUGIN_COLORS, ...customPluginColors };

    case "website-colors":
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

/**
 * Get font based on typography mode
 * @param {string} mode - Typography mode: "plugin-fonts" | "website-fonts"
 * @param {object} websiteFonts - Extracted fonts from website
 * @param {string} customFont - Custom plugin font override
 * @returns {object} Font configuration to use
 */
function getFontByMode(mode, websiteFonts = {}, customFont = null) {
  switch (mode) {
    case "plugin-fonts":
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

    case "website-fonts":
      return websiteFonts;

    default:
      return DEFAULT_PLUGIN_FONTS;
  }
}

/**
 * Smart color mapping from website colors to plugin colors
 * Used to determine which plugin color to use for a website element
 * @param {string} elementType - Type of element (background, button, text, border)
 * @param {string} websiteColor - Original website color
 * @param {object} pluginColors - Plugin color palette
 * @returns {string} Mapped plugin color
 */
function mapColorToPlugin(elementType, websiteColor, pluginColors) {
  const colors = { ...DEFAULT_PLUGIN_COLORS, ...pluginColors };

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
 * @param {object} colors - Color palette
 * @param {object} fonts - Font configuration
 * @returns {object} Local styles structure
 */
function createLocalStylesStructure(colors = {}, fonts = {}) {
  const finalColors = { ...DEFAULT_PLUGIN_COLORS, ...colors };
  const finalFonts = { ...DEFAULT_PLUGIN_FONTS, ...fonts };

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
 * @param {string} color - Color string (rgb, rgba, hex, named)
 * @returns {string} Hex color string
 */
function normalizeColor(color) {
  if (!color) return null;

  // Remove spaces
  color = color.replace(/\s/g, "");

  // Handle transparent
  if (color === "transparent" || color === "rgba(0,0,0,0)") {
    return null;
  }

  // Handle rgb/rgba
  if (color.startsWith("rgb")) {
    return rgbToHex(color);
  }

  // Validate hex
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
    // Expand 3-digit hex
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toUpperCase();
    }
    return color.toUpperCase();
  }

  return null;
}

/**
 * Convert RGB/RGBA to hex
 * @param {string} rgb - RGB or RGBA string
 * @returns {string} Hex color string
 */
function rgbToHex(rgb) {
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return null;

  // Check alpha for transparency
  if (result.length >= 4 && parseInt(result[3]) === 0) {
    return null;
  }

  const r = parseInt(result[0]).toString(16).padStart(2, "0");
  const g = parseInt(result[1]).toString(16).padStart(2, "0");
  const b = parseInt(result[2]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

/**
 * Convert hex to Figma RGB (0-1 range)
 * @param {string} hex - Hex color string
 * @returns {object} RGB object with r, g, b values 0-1
 */
function hexToFigmaRGB(hex) {
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

module.exports = {
  DEFAULT_PLUGIN_COLORS,
  DEFAULT_PLUGIN_FONTS,
  NEUTRAL_COLORS,
  getColorByMode,
  getFontByMode,
  mapColorToPlugin,
  createLocalStylesStructure,
  normalizeColor,
  rgbToHex,
  hexToFigmaRGB,
};
