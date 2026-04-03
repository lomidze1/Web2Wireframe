// Design tokens for AI wireframe generation
// Responsive font sizes, weights, spacing, and component dimensions

type Breakpoint = "desktop" | "tablet" | "mobile";

interface ResponsiveValue {
  desktop: number;
  tablet: number;
  mobile: number;
}

interface ButtonSize {
  paddingH: number;
  paddingV: number;
  borderRadius: number;
  height: number;
}

interface LogoSize {
  width: number;
  height: number;
}

interface DesignTokens {
  fontSize: {
    h1: ResponsiveValue;
    h2: ResponsiveValue;
    h3: ResponsiveValue;
    h4: ResponsiveValue;
    subheading: ResponsiveValue;
    paragraph: ResponsiveValue;
    small: ResponsiveValue;
    badge: ResponsiveValue;
    nav: ResponsiveValue;
    stat_value: ResponsiveValue;
    stat_label: ResponsiveValue;
    button: { sm: number; md: number; lg: number };
    input_label: ResponsiveValue;
    input_placeholder: ResponsiveValue;
  };
  fontWeight: Record<string, number>;
  spacing: {
    section_gap: number;
    element_gap: {
      balanced: ResponsiveValue;
      detailed: ResponsiveValue;
    };
  };
  button: { sm: ButtonSize; md: ButtonSize; lg: ButtonSize };
  imagePlaceholder: {
    aspectRatios: Record<string, number>;
  };
  card: { borderRadius: number; padding: number; borderWidth: number };
  input: {
    height: number;
    borderRadius: number;
    borderWidth: number;
    padding: { top: number; right: number; bottom: number; left: number };
  };
  avatar: { sm: number; md: number; lg: number };
  icon: { sm: number; md: number; lg: number };
  logo: { sm: LogoSize; md: LogoSize; lg: LogoSize };
}

export const DESIGN_TOKENS: DesignTokens = {
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
 */
export function getBreakpoint(viewportWidth: number): Breakpoint {
  if (viewportWidth >= 1024) return "desktop";
  if (viewportWidth >= 768) return "tablet";
  return "mobile";
}

/**
 * Get token value for a given breakpoint
 */
export function getToken(
  tokenObj: ResponsiveValue | number | null | undefined,
  breakpoint: Breakpoint
): number {
  if (tokenObj == null) return 0;
  if (typeof tokenObj === "number") return tokenObj;
  return tokenObj[breakpoint] != null ? tokenObj[breakpoint] : tokenObj.desktop || 0;
}
