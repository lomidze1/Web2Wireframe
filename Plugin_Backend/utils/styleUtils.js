// Color and style utilities
const DEFAULT_PLUGIN_COLORS = {
  primary: "#264653", // primary-dark-blue-900
  accent: "#2a9d8f", // primary-neutral-lightblue-500
  additional: "#e9c46a", // primary-neutral-gold-400
  text: "#264653",
  background: "#ffffff",
};

const DEFAULT_PLUGIN_FONTS = {
  heading: {
    fontFamily: "Montserrat",
    fontSize: 24,
    fontWeight: 600,
  },
  body: {
    fontFamily: "Open Sans",
    fontSize: 14,
    fontWeight: 400,
  },
};

const NEUTRAL_COLORS = {
  light: {
    background: "#f5f5f5",
    text: "#333333",
    border: "#cccccc",
    box: "#eeeeee",
  },
  gray: {
    background: "#f0f0f0",
    text: "#404040",
    border: "#999999",
    box: "#e0e0e0",
  },
  blue: {
    background: "#e8f4f8",
    text: "#1a3a52",
    border: "#b3d9e8",
    box: "#d0e8f2",
  },
};

function getColorByMode(mode, extractedColors = {}) {
  switch (mode) {
    case "plugin-colors":
      return DEFAULT_PLUGIN_COLORS;
    case "website-colors":
      return extractedColors || DEFAULT_PLUGIN_COLORS;
    case "create-styles":
      // Extract top 3 colors from website for creating styles
      return extractedColors && extractedColors.length > 0
        ? extractedColors.slice(0, 3).reduce((acc, color, idx) => {
            const keys = ["primary", "accent", "additional"];
            acc[keys[idx] || "other"] = color;
            return acc;
          }, {})
        : DEFAULT_PLUGIN_COLORS;
    case "figma-styles":
      // Return extracted colors to be matched with Figma's Local Styles
      return extractedColors || DEFAULT_PLUGIN_COLORS;
    case "neutral-light":
      return NEUTRAL_COLORS.light;
    case "neutral-gray":
      return NEUTRAL_COLORS.gray;
    case "neutral-blue":
      return NEUTRAL_COLORS.blue;
    default:
      return DEFAULT_PLUGIN_COLORS;
  }
}

function getFontByMode(mode, extractedFonts = {}) {
  switch (mode) {
    case "plugin-fonts":
      return DEFAULT_PLUGIN_FONTS;
    case "website-fonts":
      return extractedFonts || DEFAULT_PLUGIN_FONTS;
    case "figma-styles":
      // Return extracted fonts to be matched with Figma's Text Styles
      return extractedFonts || DEFAULT_PLUGIN_FONTS;
    default:
      return DEFAULT_PLUGIN_FONTS;
  }
}

// Create Local Styles structure for Figma
function createLocalStylesStructure(colors = {}, fonts = {}) {
  return {
    colors: [
      {
        id: "color-primary",
        name: "Primary",
        value: colors.primary || DEFAULT_PLUGIN_COLORS.primary,
        category: "background",
      },
      {
        id: "color-accent",
        name: "Accent",
        value: colors.accent || DEFAULT_PLUGIN_COLORS.accent,
        category: "accent",
      },
      {
        id: "color-additional",
        name: "Additional",
        value: colors.additional || DEFAULT_PLUGIN_COLORS.additional,
        category: "highlight",
      },
    ],
    typography: [
      {
        id: "typography-heading",
        name: "Heading",
        fontFamily:
          fonts.heading?.fontFamily || DEFAULT_PLUGIN_FONTS.heading.fontFamily,
        fontSize:
          fonts.heading?.fontSize || DEFAULT_PLUGIN_FONTS.heading.fontSize,
        fontWeight:
          fonts.heading?.fontWeight || DEFAULT_PLUGIN_FONTS.heading.fontWeight,
      },
      {
        id: "typography-body",
        name: "Body",
        fontFamily:
          fonts.body?.fontFamily || DEFAULT_PLUGIN_FONTS.body.fontFamily,
        fontSize: fonts.body?.fontSize || DEFAULT_PLUGIN_FONTS.body.fontSize,
        fontWeight:
          fonts.body?.fontWeight || DEFAULT_PLUGIN_FONTS.body.fontWeight,
      },
    ],
  };
}

function normalizeColor(color) {
  if (!color) return "#000000";
  // Remove spaces
  color = color.replace(/\s/g, "");
  // Handle rgb/rgba
  if (color.startsWith("rgb")) {
    return rgbToHex(color);
  }
  // Validate hex
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
    return color;
  }
  return "#000000";
}

function rgbToHex(rgb) {
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return "#000000";
  const r = parseInt(result[0]).toString(16).padStart(2, "0");
  const g = parseInt(result[1]).toString(16).padStart(2, "0");
  const b = parseInt(result[2]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

module.exports = {
  DEFAULT_PLUGIN_COLORS,
  DEFAULT_PLUGIN_FONTS,
  NEUTRAL_COLORS,
  getColorByMode,
  getFontByMode,
  createLocalStylesStructure,
  normalizeColor,
  rgbToHex,
};
