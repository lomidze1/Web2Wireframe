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
  paintKeyFromCSSColor,
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
  linkEffectStyleIfAvailable,
  linkGridStyleIfAvailable,
  paintKeyFromFigmaFill,
  paintKeyFromPaint,
  isColorValue,
  createPluginColorStyles,
  createUnifiedWebsiteColorStyles,
  createTextStyles,
  createEffectStyles,
  createGridStyles,
  effectsKey,
  gridKey,
  isRootGridContainer,
  parseFigmaLineHeight,
  lineHeightKeyStr,
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
