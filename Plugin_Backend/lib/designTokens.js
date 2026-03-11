// Design tokens for AI wireframe generation
// Responsive font sizes, weights, spacing, and component dimensions

const DESIGN_TOKENS = {
  // Font sizes by heading level (breakpoint-responsive)
  fontSize: {
    h1: { desktop: 48, tablet: 40, mobile: 32 },
    h2: { desktop: 36, tablet: 32, mobile: 28 },
    h3: { desktop: 24, tablet: 22, mobile: 20 },
    h4: { desktop: 18, tablet: 17, mobile: 16 },
    subheading: { desktop: 18, tablet: 16, mobile: 14 },
    paragraph: { desktop: 16, tablet: 15, mobile: 14 },
    small: { desktop: 14, tablet: 13, mobile: 12 },
    badge: { desktop: 12, tablet: 12, mobile: 11 },
    nav: { desktop: 14, tablet: 14, mobile: 14 },
    stat_value: { desktop: 48, tablet: 40, mobile: 32 },
    stat_label: { desktop: 14, tablet: 13, mobile: 12 },
    button: { sm: 13, md: 14, lg: 16 },
    input_label: { desktop: 14, tablet: 14, mobile: 14 },
    input_placeholder: { desktop: 14, tablet: 14, mobile: 14 },
  },

  // Font weights
  fontWeight: {
    h1: 700,
    h2: 700,
    h3: 600,
    h4: 600,
    subheading: 500,
    paragraph: 400,
    badge: 600,
    nav: 500,
    button: 600,
  },

  // Spacing
  spacing: {
    section_gap: 0,
    element_gap: {
      balanced: { desktop: 24, tablet: 20, mobile: 16 },
      detailed: { desktop: 16, tablet: 14, mobile: 12 },
    },
  },

  // Button sizing
  button: {
    sm: { paddingH: 16, paddingV: 8, borderRadius: 6, height: 32 },
    md: { paddingH: 24, paddingV: 12, borderRadius: 8, height: 40 },
    lg: { paddingH: 32, paddingV: 16, borderRadius: 10, height: 48 },
  },

  // Image placeholder aspect ratios
  imagePlaceholder: {
    aspectRatios: { "16:9": 0.5625, "4:3": 0.75, "1:1": 1, "3:2": 0.667 },
  },

  // Card defaults
  card: {
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
  },

  // Input defaults
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    padding: { top: 10, right: 12, bottom: 10, left: 12 },
  },

  // Avatar sizes
  avatar: {
    sm: 32,
    md: 48,
    lg: 64,
  },

  // Icon placeholder sizes
  icon: {
    sm: 20,
    md: 24,
    lg: 48,
  },

  // Logo placeholder
  logo: {
    sm: { width: 80, height: 24 },
    md: { width: 120, height: 32 },
    lg: { width: 160, height: 40 },
  },
};

/**
 * Get breakpoint name from viewport width
 * @param {number} viewportWidth
 * @returns {"desktop"|"tablet"|"mobile"}
 */
function getBreakpoint(viewportWidth) {
  if (viewportWidth >= 1024) return "desktop";
  if (viewportWidth >= 768) return "tablet";
  return "mobile";
}

/**
 * Get token value for a given breakpoint
 * @param {object} tokenObj - e.g. { desktop: 48, tablet: 40, mobile: 32 }
 * @param {string} breakpoint - "desktop"|"tablet"|"mobile"
 * @returns {number}
 */
function getToken(tokenObj, breakpoint) {
  if (tokenObj == null) return 0;
  if (typeof tokenObj === "number") return tokenObj;
  return tokenObj[breakpoint] != null ? tokenObj[breakpoint] : tokenObj.desktop || 0;
}

module.exports = {
  DESIGN_TOKENS,
  getBreakpoint,
  getToken,
};
