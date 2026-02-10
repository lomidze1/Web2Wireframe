/**
 * CDP Type Definitions for Puppeteer Extraction
 * Figma-ready data structures for 1:1 visual fidelity
 *
 * @fileoverview JSDoc type definitions for CDP extraction
 */

// ============================================================================
// FIGMA-READY TYPES
// ============================================================================

/**
 * RGBA color normalized to 0-1 range (Figma format)
 * @typedef {Object} FigmaColor
 * @property {number} r - Red 0-1
 * @property {number} g - Green 0-1
 * @property {number} b - Blue 0-1
 * @property {number} a - Alpha 0-1
 */

/**
 * Gradient stop
 * @typedef {Object} FigmaGradientStop
 * @property {FigmaColor} color
 * @property {number} position - 0-1
 */

/**
 * Fill layer - supports solid, gradient, image placeholder
 * @typedef {Object} FigmaFill
 * @property {'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_CONIC' | 'IMAGE_PLACEHOLDER'} type
 * @property {boolean} visible
 * @property {number} opacity
 * @property {string} [blendMode]
 * @property {FigmaColor} [color] - For SOLID
 * @property {number} [angle] - For GRADIENT_LINEAR (degrees 0-360)
 * @property {FigmaGradientStop[]} [stops] - For gradients
 * @property {{x: number, y: number}} [center] - For RADIAL/CONIC (0-1 normalized)
 * @property {'circle' | 'ellipse'} [shape] - For RADIAL
 * @property {'closest-side' | 'farthest-side' | 'closest-corner' | 'farthest-corner'} [size] - For RADIAL
 * @property {number} [elementWidth] - For radial gradient transform calculation
 * @property {number} [elementHeight]
 * @property {boolean} [isImagePlaceholder]
 */

/**
 * Stroke layer - border
 * @typedef {Object} FigmaStroke
 * @property {FigmaColor} color
 * @property {number} weight
 * @property {'INSIDE' | 'CENTER' | 'OUTSIDE'} position
 * @property {'SOLID' | 'DASHED' | 'DOTTED'} style
 * @property {{top: boolean, right: boolean, bottom: boolean, left: boolean}} [sides]
 */

/**
 * Effect layer - shadow or blur
 * @typedef {Object} FigmaEffect
 * @property {'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'} type
 * @property {boolean} visible
 * @property {FigmaColor} [color] - For shadows
 * @property {{x: number, y: number}} [offset] - For shadows
 * @property {number} [radius] - blur radius
 * @property {number} [spread] - shadow spread
 * @property {number} [blurRadius] - For blur effects
 */

// ============================================================================
// EXTRACTED ELEMENT (Figma-ready structure)
// ============================================================================

/**
 * Extracted element with Figma-ready styling
 * @typedef {Object} ExtractedElement
 * @property {string} id
 * @property {'frame' | 'text' | 'placeholder'} type
 * @property {string} tag
 * @property {string} [className]
 * @property {string} name
 *
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 *
 * @property {'static' | 'relative' | 'absolute' | 'fixed' | 'sticky'} [position]
 * @property {number} [zIndex]
 *
 * @property {'NONE' | 'HORIZONTAL' | 'VERTICAL'} layoutMode
 * @property {number} itemSpacing
 * @property {{top: number, right: number, bottom: number, left: number}} padding
 *
 * @property {string} [justifyContent]
 * @property {string} [alignItems]
 * @property {string} [flexWrap]
 * @property {0 | 1} [layoutGrow]
 * @property {'STRETCH' | 'INHERIT'} [layoutAlign]
 * @property {'FIXED' | 'HUG' | 'FILL'} [layoutSizingHorizontal]
 * @property {'FIXED' | 'HUG' | 'FILL'} [layoutSizingVertical]
 *
 * @property {FigmaFill[]} fills
 * @property {FigmaStroke[]} strokes
 * @property {FigmaEffect[]} effects
 *
 * @property {string | null} backgroundColor - Legacy (kept for compatibility)
 * @property {string | null} backgroundGradient - Legacy
 * @property {string | null} textColor - Legacy
 * @property {string | null} borderColor - Legacy
 * @property {number} borderWidth - Legacy
 * @property {{topLeft: number, topRight: number, bottomRight: number, bottomLeft: number}} borderRadius
 * @property {string | null} boxShadow - Legacy
 *
 * @property {string} fontFamily
 * @property {number} fontSize
 * @property {number} fontWeight
 * @property {number | string} lineHeight
 * @property {number} letterSpacing
 * @property {string} textAlign
 * @property {string} textContent
 *
 * @property {number} opacity
 * @property {boolean} isPlaceholder
 * @property {'visible' | 'hidden' | 'scroll' | 'auto'} [overflow]
 * @property {boolean} [horizontallyCentered]
 *
 * @property {ExtractedElement[]} children
 */

// ============================================================================
// CDP TYPES
// ============================================================================

/**
 * CDP CSS Property
 * @typedef {Object} CDPCSSProperty
 * @property {string} name
 * @property {string} value
 * @property {boolean} [important]
 * @property {boolean} [implicit]
 * @property {string} [text]
 * @property {boolean} [parsedOk]
 * @property {boolean} [disabled]
 */

/**
 * CDP CSS Style declaration
 * @typedef {Object} CDPCSSStyle
 * @property {CDPCSSProperty[]} cssProperties
 * @property {Array<{name: string, value: string, important?: boolean}>} [shorthandEntries]
 * @property {string} [cssText]
 */

/**
 * CDP CSS Rule
 * @typedef {Object} CDPCSSRule
 * @property {string} [styleSheetId]
 * @property {{selectors: Array<{text: string}>, text: string}} selectorList
 * @property {'injected' | 'user-agent' | 'inspector' | 'regular'} origin
 * @property {CDPCSSStyle} style
 * @property {Array<{text: string, source: string}>} [media]
 */

/**
 * Matched CSS rules for a node
 * @typedef {Object} CDPMatchedStyles
 * @property {CDPCSSStyle} [inlineStyle]
 * @property {CDPCSSStyle} [attributesStyle]
 * @property {Array<{rule: CDPCSSRule, matchingSelectors: number[]}>} matchedCSSRules
 * @property {Array<{pseudoType: string, matches: Array<{rule: CDPCSSRule, matchingSelectors: number[]}>}>} [pseudoElements]
 * @property {Array<{inlineStyle?: CDPCSSStyle, matchedCSSRules: Array<{rule: CDPCSSRule, matchingSelectors: number[]}>}>} [inherited]
 */

/**
 * Captured frame result
 * @typedef {Object} CapturedFrame
 * @property {{width: number, height: number}} viewport
 * @property {ExtractedElement} tree
 */

/**
 * CSS Variable extracted from the page
 * @typedef {Object} ExtractedCSSVariable
 * @property {string} name
 * @property {string} value - Resolved value
 * @property {string} rawValue - Original value
 * @property {string} [category]
 */

// Export empty object for CommonJS compatibility
module.exports = {};
