/**
 * Rendering module exports
 * Re-exports all rendering utilities for Figma wireframe creation
 */

// Color utilities
export {
  hexToFigmaRGB,
  cssColorToFigmaRGB,
  figmaRGBToHex,
  normalizeColorForLookup,
  resolveCSSVariables,
  isLightColorValue,
  isSaturatedColor,
  colorsAreTooSimilar,
  isHighlightedElement,
  determineColorRole,
  getPluginColorForRole,
  getAlternativePluginColor,
  getTextColorForBackground,
  getSmartTextColor,
  getDominantColorFromPaints,
} from "./colors";

// Gradient parsing
export {
  parseGradient,
  parseColorStops,
  calculateRadialGradientTransform,
  calculateLinearGradientTransform,
} from "./gradients";

// Layout conversion
export {
  getBorderRadius,
  getCornerRadii,
  cssJustifyToFigma,
  cssAlignToFigma,
  cssAlignSelfToFigma,
  needsMarginWrapper,
  createMarginWrapper,
  getSizingMode,
} from "./layout";

// Fill/stroke/effect conversion
export {
  convertFillsToPaints,
  convertStrokesToFigma,
  convertEffectsToFigma,
} from "./fills";

// Style linking and creation
export {
  linkFillStyleIfAvailable,
  linkStrokeStyleIfAvailable,
  isColorValue,
  createColorStylesFromVariables,
  createPluginColorStyles,
} from "./styles";

// Text node creation
export {
  collectTextSegments,
  createTextNode,
  createTextWithBackground,
} from "./text";

// Placeholder creation
export {
  createImagePlaceholderIcon,
  createPlaceholder,
} from "./placeholders";

// Node and frame creation
export {
  createNodeInFigma,
  createWireframeFrame,
} from "./nodes";
