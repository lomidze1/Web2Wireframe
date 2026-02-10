/**
 * CSS to Figma Style Parsers
 * Converts CSS properties to Figma-ready format
 *
 * Goal: 1:1 visual fidelity - website looks identical in Figma
 *
 * @fileoverview Converted from Browser_Extension TypeScript to CommonJS
 */

// ============================================================================
// COLOR PARSING
// ============================================================================

/**
 * Parse any CSS color to Figma RGBA (0-1 range)
 * @param {string | null | undefined} color
 * @param {boolean} [allowTransparent=false]
 * @returns {import('./types').FigmaColor | null}
 */
function parseColorToFigma(color, allowTransparent = false) {
  if (!color || color === "none") {
    return null;
  }

  const trimmed = color.trim();

  // Handle transparent
  if (trimmed === "transparent") {
    if (allowTransparent) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return null;
  }

  // Check for fully transparent
  if (trimmed === "rgba(0, 0, 0, 0)" || trimmed === "rgba(0,0,0,0)") {
    if (allowTransparent) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return null;
  }

  // Hex color
  if (trimmed.startsWith("#")) {
    return hexToFigma(trimmed);
  }

  // RGB/RGBA
  const rgbaMatch = trimmed.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i
  );
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    if (alpha === 0 && !allowTransparent) return null;
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      a: alpha,
    };
  }

  // HSL/HSLA
  const hslaMatch = trimmed.match(
    /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/i
  );
  if (hslaMatch) {
    const [, h, s, l, a] = hslaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    if (alpha === 0 && !allowTransparent) return null;
    return hslToFigma(parseFloat(h), parseFloat(s), parseFloat(l), alpha);
  }

  // Named colors
  const namedColors = {
    white: "#FFFFFF",
    black: "#000000",
    red: "#FF0000",
    green: "#008000",
    blue: "#0000FF",
    yellow: "#FFFF00",
    orange: "#FFA500",
    purple: "#800080",
    pink: "#FFC0CB",
    gray: "#808080",
    grey: "#808080",
  };

  if (namedColors[trimmed.toLowerCase()]) {
    return hexToFigma(namedColors[trimmed.toLowerCase()]);
  }

  return null;
}

/**
 * Hex to Figma color
 * @param {string} hex
 * @returns {import('./types').FigmaColor}
 */
function hexToFigma(hex) {
  let h = hex.replace("#", "");

  // Shorthand (#RGB → #RRGGBB)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  // 8-char hex with alpha
  let alpha = 1;
  if (h.length === 8) {
    alpha = parseInt(h.slice(6, 8), 16) / 255;
    h = h.slice(0, 6);
  }

  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: alpha,
  };
}

/**
 * HSL to Figma color
 * @param {number} h
 * @param {number} s
 * @param {number} l
 * @param {number} [a=1]
 * @returns {import('./types').FigmaColor}
 */
function hslToFigma(h, s, l, a = 1) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: r + m,
    g: g + m,
    b: b + m,
    a,
  };
}

// ============================================================================
// BACKGROUND PARSING → fills[]
// ============================================================================

/**
 * Parse CSS background to Figma fills array
 * @param {string | null} background - CSS background-image
 * @param {string | null} backgroundColor - CSS background-color
 * @param {Map<string, string>} [resolvedVariables]
 * @param {{width: number, height: number}} [elementDimensions]
 * @returns {import('./types').FigmaFill[]}
 */
function parseBackgroundToFills(
  background,
  backgroundColor,
  resolvedVariables = new Map(),
  elementDimensions
) {
  /** @type {import('./types').FigmaFill[]} */
  const fills = [];

  // Resolve CSS variables
  let resolvedBackground = background
    ? resolveCSSVariables(background, resolvedVariables)
    : null;

  if (resolvedBackground) {
    // Split multiple backgrounds
    const layers = splitMultipleBackgrounds(resolvedBackground);

    for (const layer of layers) {
      const fill = parseBackgroundLayer(layer.trim(), elementDimensions);
      if (fill) {
        fills.push(fill);
      }
    }
  }

  // Add solid background color as last layer
  if (backgroundColor) {
    const lastFill = fills[fills.length - 1];
    const alreadyHasSolidAtEnd = lastFill?.type === "SOLID";

    if (!alreadyHasSolidAtEnd) {
      const resolvedBgColor = resolveCSSVariables(
        backgroundColor,
        resolvedVariables
      );
      const color = parseColorToFigma(resolvedBgColor);
      if (color) {
        fills.push({
          type: "SOLID",
          visible: true,
          opacity: color.a,
          color: { ...color, a: 1 },
        });
      }
    }
  }

  return fills;
}

/**
 * Split multiple backgrounds by comma
 * @param {string} background
 * @returns {string[]}
 */
function splitMultipleBackgrounds(background) {
  const layers = [];
  let depth = 0;
  let current = "";

  for (const char of background) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      layers.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    layers.push(current.trim());
  }

  return layers;
}

/**
 * Parse single background layer
 * @param {string} layer
 * @param {{width: number, height: number}} [elementDimensions]
 * @returns {import('./types').FigmaFill | null}
 */
function parseBackgroundLayer(layer, elementDimensions) {
  // Linear gradient
  if (layer.includes("linear-gradient")) {
    return parseLinearGradient(layer);
  }

  // Radial gradient
  if (layer.includes("radial-gradient")) {
    const fill = parseRadialGradient(layer);
    if (fill && elementDimensions) {
      fill.elementWidth = elementDimensions.width;
      fill.elementHeight = elementDimensions.height;
    }
    return fill;
  }

  // Conic gradient
  if (layer.includes("conic-gradient")) {
    return parseConicGradient(layer);
  }

  // URL (image) → placeholder
  if (layer.includes("url(")) {
    return {
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      isImagePlaceholder: true,
    };
  }

  // Solid color
  const color = parseColorToFigma(layer);
  if (color) {
    return {
      type: "SOLID",
      visible: true,
      opacity: color.a,
      color: { ...color, a: 1 },
    };
  }

  return null;
}

/**
 * Parse linear-gradient to Figma fill
 * @param {string} gradient
 * @returns {import('./types').FigmaFill | null}
 */
function parseLinearGradient(gradient) {
  const match = gradient.match(/linear-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];

  let angle = 180; // Default: to bottom
  let colorStopsStr = content;

  // Check for angle in degrees
  const degMatch = content.match(/^([\d.]+)deg\s*,\s*/i);
  if (degMatch) {
    angle = parseFloat(degMatch[1]);
    colorStopsStr = content.slice(degMatch[0].length);
  } else {
    // Check for "to direction"
    const dirMatch = content.match(
      /^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?\s*,\s*/i
    );
    if (dirMatch) {
      angle = directionToAngle(dirMatch[1], dirMatch[2]);
      colorStopsStr = content.slice(dirMatch[0].length);
    }
  }

  const stops = parseColorStops(colorStopsStr);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_LINEAR",
    visible: true,
    opacity: 1,
    angle,
    stops,
  };
}

/**
 * Parse radial-gradient to Figma fill
 * @param {string} gradient
 * @returns {import('./types').FigmaFill | null}
 */
function parseRadialGradient(gradient) {
  const match = gradient.match(/radial-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];

  let center = { x: 0.5, y: 0.5 };
  let shape = "ellipse";
  let size = "farthest-corner";

  // Parse shape
  const shapeMatch = content.match(/^(circle|ellipse)\b/i);
  if (shapeMatch) {
    shape = shapeMatch[1].toLowerCase();
  }

  // Parse size keyword
  const sizeMatch = content.match(
    /\b(closest-side|farthest-side|closest-corner|farthest-corner)\b/i
  );
  if (sizeMatch) {
    size = sizeMatch[1].toLowerCase();
  }

  // Parse position
  const atMatch = content.match(/at\s+([\d.]+%?)\s+([\d.]+%?)/i);
  if (atMatch) {
    center = {
      x: parsePercent(atMatch[1]),
      y: parsePercent(atMatch[2]),
    };
    console.log(`[RADIAL DEBUG] Parsed center: at ${atMatch[1]} ${atMatch[2]} → {x: ${center.x}, y: ${center.y}}`);
  } else {
    console.log(`[RADIAL DEBUG] No position found in: "${content.substring(0, 50)}..."`);
  }

  // Find where color stops begin
  const configPatterns = [
    /^(?:circle|ellipse)\s*/i,
    /^(?:closest-side|farthest-side|closest-corner|farthest-corner)\s*/i,
    /^at\s+[\d.]+%?\s+[\d.]+%?\s*/i,
  ];

  let remaining = content;
  let configFound = true;

  while (configFound) {
    configFound = false;
    for (const pattern of configPatterns) {
      const m = remaining.match(pattern);
      if (m) {
        remaining = remaining.slice(m[0].length);
        configFound = true;
        break;
      }
    }
  }

  remaining = remaining.replace(/^,\s*/, "");

  if (!looksLikeColor(remaining.split(",")[0]?.trim() || "")) {
    const commaIndex = content.indexOf(",");
    if (commaIndex > -1) {
      remaining = content.slice(commaIndex + 1).trim();
    }
  }

  const stops = parseColorStops(remaining);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_RADIAL",
    visible: true,
    opacity: 1,
    stops,
    center,
    shape,
    size,
  };
}

/**
 * Check if string looks like a CSS color
 * @param {string} str
 * @returns {boolean}
 */
function looksLikeColor(str) {
  const trimmed = str.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("rgb") ||
    trimmed.startsWith("hsl") ||
    /^(transparent|white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)$/i.test(
      trimmed
    )
  );
}

/**
 * Parse conic-gradient to Figma fill
 * @param {string} gradient
 * @returns {import('./types').FigmaFill | null}
 */
function parseConicGradient(gradient) {
  const match = gradient.match(/conic-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];
  let colorStopsStr = content;
  let angle = 0;
  let center = { x: 0.5, y: 0.5 };

  // Check for "from Xdeg"
  const fromMatch = content.match(/from\s+([\d.]+)deg\s*/i);
  if (fromMatch) {
    angle = parseFloat(fromMatch[1]);
    colorStopsStr = content.replace(fromMatch[0], "");
  }

  // Check for "at X Y"
  const atMatch = colorStopsStr.match(/at\s+([\d.]+%?)\s+([\d.]+%?)\s*,?\s*/i);
  if (atMatch) {
    center = {
      x: parsePercent(atMatch[1]),
      y: parsePercent(atMatch[2]),
    };
    colorStopsStr = colorStopsStr.replace(atMatch[0], "");
  }

  colorStopsStr = colorStopsStr.replace(/^,\s*/, "");

  const stops = parseColorStops(colorStopsStr);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_CONIC",
    visible: true,
    opacity: 1,
    angle,
    stops,
    center,
  };
}

/**
 * Parse color stops from gradient
 * @param {string} stopsStr
 * @returns {import('./types').FigmaGradientStop[]}
 */
function parseColorStops(stopsStr) {
  /** @type {import('./types').FigmaGradientStop[]} */
  const stops = [];
  /** @type {number[]} */
  const transparentIndices = [];

  const parts = splitMultipleBackgrounds(stopsStr);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Skip pure position values
    if (/^[\d.]+%?$/.test(part)) {
      continue;
    }

    // Extract color and position
    const posMatch = part.match(/^(.+?)\s+([\d.]+%?)$/);

    let colorStr;
    let position;

    if (posMatch) {
      colorStr = posMatch[1].trim();
      position = parsePercent(posMatch[2]);
    } else {
      colorStr = part;
      position = parts.length > 1 ? i / (parts.length - 1) : 0;
    }

    const isTransparent =
      colorStr.toLowerCase() === "transparent" ||
      colorStr === "rgba(0, 0, 0, 0)" ||
      colorStr === "rgba(0,0,0,0)";

    const color = parseColorToFigma(colorStr, true);
    if (color) {
      stops.push({ color, position });
      if (isTransparent) {
        transparentIndices.push(stops.length - 1);
      }
    }
  }

  // Fix transparent stops (use adjacent color's RGB)
  for (const idx of transparentIndices) {
    let referenceColor = null;

    if (idx > 0 && !transparentIndices.includes(idx - 1)) {
      referenceColor = stops[idx - 1].color;
    } else if (idx < stops.length - 1 && !transparentIndices.includes(idx + 1)) {
      referenceColor = stops[idx + 1].color;
    }

    if (referenceColor) {
      stops[idx].color = {
        r: referenceColor.r,
        g: referenceColor.g,
        b: referenceColor.b,
        a: 0,
      };
    }
  }

  return stops;
}

/**
 * Convert CSS direction to angle
 * @param {string} dir1
 * @param {string} [dir2]
 * @returns {number}
 */
function directionToAngle(dir1, dir2) {
  const d1 = dir1.toLowerCase();
  const d2 = dir2?.toLowerCase();

  if (d1 === "top" && !d2) return 0;
  if (d1 === "right" && !d2) return 90;
  if (d1 === "bottom" && !d2) return 180;
  if (d1 === "left" && !d2) return 270;

  // Corners
  if ((d1 === "top" && d2 === "right") || (d1 === "right" && d2 === "top"))
    return 45;
  if ((d1 === "bottom" && d2 === "right") || (d1 === "right" && d2 === "bottom"))
    return 135;
  if ((d1 === "bottom" && d2 === "left") || (d1 === "left" && d2 === "bottom"))
    return 225;
  if ((d1 === "top" && d2 === "left") || (d1 === "left" && d2 === "top"))
    return 315;

  return 180;
}

/**
 * Parse percentage string to 0-1
 * @param {string} value
 * @returns {number}
 */
function parsePercent(value) {
  if (value.endsWith("%")) {
    return parseFloat(value) / 100;
  }
  return parseFloat(value);
}

// ============================================================================
// BOX-SHADOW PARSING → effects[]
// ============================================================================

/**
 * Parse CSS box-shadow to Figma effects array
 * @param {string | null} boxShadow
 * @returns {import('./types').FigmaEffect[]}
 */
function parseBoxShadowToEffects(boxShadow) {
  if (!boxShadow || boxShadow === "none") {
    return [];
  }

  /** @type {import('./types').FigmaEffect[]} */
  const effects = [];

  const shadows = splitMultipleBackgrounds(boxShadow);

  for (const shadow of shadows) {
    const effect = parseSingleShadow(shadow.trim());
    if (effect) {
      effects.push(effect);
    }
  }

  return effects;
}

/**
 * Parse single box-shadow
 * @param {string} shadow
 * @returns {import('./types').FigmaEffect | null}
 */
function parseSingleShadow(shadow) {
  if (!shadow || shadow === "none") return null;

  console.log(`[BOX-SHADOW DEBUG] Input: "${shadow}"`);

  const isInset = shadow.toLowerCase().includes("inset");
  let cleanShadow = shadow.replace(/inset/gi, "").trim();

  let color = null;

  // Try to find color
  const colorPatterns = [
    /rgba?\s*\([^)]+\)\s*$/i,
    /hsla?\s*\([^)]+\)\s*$/i,
    /#[0-9a-f]{3,8}\s*$/i,
    /\b(white|black|red|green|blue|gray|grey|transparent)\s*$/i,
  ];

  for (const pattern of colorPatterns) {
    const match = cleanShadow.match(pattern);
    if (match) {
      color = parseColorToFigma(match[0].trim());
      console.log(`[BOX-SHADOW DEBUG] Found color: "${match[0]}" → ${JSON.stringify(color)}`);
      cleanShadow = cleanShadow.slice(0, match.index).trim();
      break;
    }
  }

  if (!color) {
    color = { r: 0, g: 0, b: 0, a: 0.25 };
    console.log(`[BOX-SHADOW DEBUG] No color found, using default black 25%`);
  }

  // Parse numeric values
  const values = cleanShadow.match(/-?[\d.]+(?:px)?/g);
  console.log(`[BOX-SHADOW DEBUG] cleanShadow: "${cleanShadow}", values: ${JSON.stringify(values)}`);
  if (!values || values.length < 2) return null;

  const nums = values.map((v) => parseFloat(v.replace("px", "")));
  const [offsetX, offsetY, blur = 0, spread = 0] = nums;

  console.log(`[BOX-SHADOW DEBUG] Parsed: offsetX=${offsetX}, offsetY=${offsetY}, blur=${blur}, spread=${spread}`);

  return {
    type: isInset ? "INNER_SHADOW" : "DROP_SHADOW",
    visible: true,
    color,
    offset: { x: offsetX, y: offsetY },
    radius: blur,
    spread,
  };
}

// ============================================================================
// BACKDROP-FILTER PARSING → effects[]
// ============================================================================

/**
 * Parse CSS backdrop-filter to Figma effects
 * @param {string | null} backdropFilter
 * @returns {import('./types').FigmaEffect[]}
 */
function parseBackdropFilterToEffects(backdropFilter) {
  if (!backdropFilter || backdropFilter === "none") {
    return [];
  }

  /** @type {import('./types').FigmaEffect[]} */
  const effects = [];

  const blurMatch = backdropFilter.match(/blur\s*\(\s*([\d.]+)(?:px)?\s*\)/i);
  if (blurMatch) {
    effects.push({
      type: "BACKGROUND_BLUR",
      visible: true,
      blurRadius: parseFloat(blurMatch[1]),
    });
  }

  return effects;
}

// ============================================================================
// BORDER PARSING → strokes[]
// ============================================================================

/**
 * Parse CSS borders to Figma strokes array
 * @param {string | null} borderWidth
 * @param {string | null} borderColor
 * @param {string | null} borderStyle
 * @param {string | null} [borderTop]
 * @param {string | null} [borderRight]
 * @param {string | null} [borderBottom]
 * @param {string | null} [borderLeft]
 * @param {Map<string, string>} [resolvedVariables]
 * @returns {import('./types').FigmaStroke[]}
 */
function parseBordersToStrokes(
  borderWidth,
  borderColor,
  borderStyle,
  borderTop,
  borderRight,
  borderBottom,
  borderLeft,
  resolvedVariables = new Map()
) {
  /** @type {import('./types').FigmaStroke[]} */
  const strokes = [];

  const hasSideBorders = borderTop || borderRight || borderBottom || borderLeft;

  if (hasSideBorders) {
    const sides = [
      { css: borderTop, side: "top" },
      { css: borderRight, side: "right" },
      { css: borderBottom, side: "bottom" },
      { css: borderLeft, side: "left" },
    ];

    for (const { css, side } of sides) {
      if (css && css !== "none" && css !== "0px") {
        const stroke = parseBorderShorthand(css, resolvedVariables);
        if (stroke) {
          stroke.sides = {
            top: side === "top",
            right: side === "right",
            bottom: side === "bottom",
            left: side === "left",
          };
          strokes.push(stroke);
        }
      }
    }

    return strokes;
  }

  const width = parseFloat(borderWidth || "0");
  if (width <= 0) return strokes;

  const resolvedColor = resolveCSSVariables(borderColor || "", resolvedVariables);
  const color = parseColorToFigma(resolvedColor);
  if (!color) return strokes;

  const style = mapBorderStyle(borderStyle);

  strokes.push({
    color,
    weight: width,
    position: "INSIDE",
    style,
    sides: { top: true, right: true, bottom: true, left: true },
  });

  return strokes;
}

/**
 * Parse border shorthand
 * @param {string} border
 * @param {Map<string, string>} resolvedVariables
 * @returns {import('./types').FigmaStroke | null}
 */
function parseBorderShorthand(border, resolvedVariables) {
  const resolved = resolveCSSVariables(border, resolvedVariables);

  const match = resolved.match(
    /^([\d.]+)(?:px)?\s+(solid|dashed|dotted|double|none)\s+(.+)$/i
  );
  if (!match) return null;

  const [, widthStr, style, colorStr] = match;
  const width = parseFloat(widthStr);
  if (width <= 0) return null;

  const color = parseColorToFigma(colorStr.trim());
  if (!color) return null;

  return {
    color,
    weight: width,
    position: "INSIDE",
    style: mapBorderStyle(style),
  };
}

/**
 * Map CSS border-style to Figma
 * @param {string | null} style
 * @returns {'SOLID' | 'DASHED' | 'DOTTED'}
 */
function mapBorderStyle(style) {
  switch (style?.toLowerCase()) {
    case "dashed":
      return "DASHED";
    case "dotted":
      return "DOTTED";
    default:
      return "SOLID";
  }
}

// ============================================================================
// CSS VARIABLE RESOLUTION
// ============================================================================

/**
 * Resolve CSS variables in a string
 * @param {string} value
 * @param {Map<string, string>} variables
 * @returns {string}
 */
function resolveCSSVariables(value, variables) {
  if (!value.includes("var(")) return value;

  return value.replace(
    /var\(\s*--([^,)]+)(?:\s*,\s*([^)]+))?\s*\)/gi,
    (match, name, fallback) => {
      const resolved = variables.get(`--${name}`);
      if (resolved) return resolved;
      if (fallback) return fallback.trim();
      return match;
    }
  );
}

module.exports = {
  parseColorToFigma,
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
  resolveCSSVariables,
};
