/**
 * Gradient parsing and transform calculation for Figma
 * Handles CSS gradients (linear, radial, conic) conversion
 */

import type { ColorStop, FigmaFill } from "../types";
import { cssColorToFigmaRGB, resolveCSSVariables } from "./colors";

// ============================================================================
// Gradient Parsing
// ============================================================================

/**
 * Parse CSS gradient to Figma GradientPaint
 */
export function parseGradient(
  gradient: string,
  variableValueMap?: Map<string, string>
): GradientPaint | null {
  if (!gradient) return null;

  // Resolve CSS variables first
  const resolvedGradient = variableValueMap
    ? resolveCSSVariables(gradient, variableValueMap)
    : gradient;

  // Match linear-gradient
  const linearMatch = resolvedGradient.match(
    /linear-gradient\s*\(\s*(\d+)deg\s*,\s*(.+)\)/i
  );
  if (linearMatch) {
    const [, angleDeg, colorStopsStr] = linearMatch;
    const angle = parseInt(angleDeg);

    // Parse color stops
    const colorStops = parseColorStops(colorStopsStr);
    if (colorStops.length < 2) return null;

    // Convert CSS angle to Figma gradient handles
    // CSS: 0deg = bottom to top, 90deg = left to right
    // Figma: uses transform matrix
    const angleRad = ((angle - 90) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return {
      type: "GRADIENT_LINEAR",
      gradientStops: colorStops,
      gradientTransform: [
        [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
        [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
      ],
    };
  }

  // Match radial-gradient (simplified)
  const radialMatch = resolvedGradient.match(/radial-gradient\s*\(\s*(.+)\)/i);
  if (radialMatch) {
    const colorStops = parseColorStops(radialMatch[1]);
    if (colorStops.length < 2) return null;

    return {
      type: "GRADIENT_RADIAL",
      gradientStops: colorStops,
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    };
  }

  return null;
}

/**
 * Parse color stops from gradient string
 */
export function parseColorStops(colorStopsStr: string): ColorStop[] {
  const stops: ColorStop[] = [];

  // Split by comma but respect parentheses (for rgb/rgba)
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of colorStopsStr) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());

  // Parse each color stop
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    // Extract color and position
    // Handle: "#fff 0%", "rgb(0,0,0) 50%", "var(--color)", "#fff"
    let colorStr = part;
    let position = i / (parts.length - 1); // Default: evenly distributed

    // Check for percentage at end
    const posMatch = part.match(/^(.+?)\s+(\d+)%$/);
    if (posMatch) {
      colorStr = posMatch[1].trim();
      position = parseInt(posMatch[2]) / 100;
    }

    // Parse color
    const parsed = cssColorToFigmaRGB(colorStr);
    if (parsed) {
      stops.push({
        position,
        color: { ...parsed.color, a: parsed.opacity },
      });
    }
  }

  return stops;
}

// ============================================================================
// Gradient Transform Calculation
// ============================================================================

/**
 * Calculate radial gradient transform for Figma
 *
 * CSS radial gradients have complex positioning and sizing that must be properly converted.
 * The gradientTransform is a 2x3 affine matrix: [[scaleX, skewX, tx], [skewY, scaleY, ty]]
 *
 * Key insight: Figma's radial gradient default center is at (0.5, 0.5) in gradient space.
 * To position it at CSS "at X% Y%", we need to:
 * 1. Calculate gradient size based on CSS size keyword (farthest-corner, etc.)
 * 2. Apply scale to match the calculated size
 * 3. Translate to position the center correctly (accounting for scale)
 */
export function calculateRadialGradientTransform(fill: FigmaFill): Transform {
  const cx = fill.center?.x ?? 0.5;
  const cy = fill.center?.y ?? 0.5;
  const shape = fill.shape ?? "ellipse";
  const size = fill.size ?? "farthest-corner";
  const elementWidth = fill.elementWidth ?? 100;
  const elementHeight = fill.elementHeight ?? 100;

  // Step 1: Calculate distances from center to edges
  const distLeft = cx * elementWidth;
  const distRight = (1 - cx) * elementWidth;
  const distTop = cy * elementHeight;
  const distBottom = (1 - cy) * elementHeight;

  // Step 2: Calculate gradient radius based on size keyword
  let radiusX: number;
  let radiusY: number;

  switch (size) {
    case "closest-side":
      radiusX = Math.min(distLeft, distRight);
      radiusY = Math.min(distTop, distBottom);
      break;
    case "farthest-side":
      radiusX = Math.max(distLeft, distRight);
      radiusY = Math.max(distTop, distBottom);
      break;
    case "closest-corner": {
      const closestX = Math.min(distLeft, distRight);
      const closestY = Math.min(distTop, distBottom);
      const dist = Math.sqrt(closestX ** 2 + closestY ** 2);
      radiusX = radiusY = dist;
      break;
    }
    case "farthest-corner":
    default: {
      const farthestX = Math.max(distLeft, distRight);
      const farthestY = Math.max(distTop, distBottom);
      const dist = Math.sqrt(farthestX ** 2 + farthestY ** 2);
      radiusX = radiusY = dist;
      break;
    }
  }

  // Step 3: For circle shape, use equal radii
  if (shape === "circle") {
    const radius = Math.max(radiusX, radiusY);
    radiusX = radiusY = radius;
  }

  // Step 4: Calculate scale factors (gradient size relative to element)
  // Figma's radial gradient extends from center to edge in unit space
  const scaleX = radiusX / elementWidth;
  const scaleY = radiusY / elementHeight;

  // Step 5: Calculate translation
  // Figma's default gradient center is at (0.5, 0.5) in gradient space
  // NOTE: Figma's gradient Y-axis is INVERTED (0=bottom, 1=top)
  const tx = cx - scaleX * 0.5;
  const ty = 1 - cy - scaleY * 0.5;

  return [
    [scaleX, 0, tx],
    [0, scaleY, ty],
  ];
}

/**
 * Gradient transform for a CSS conic gradient rendered as Figma
 * GRADIENT_ANGULAR. Figma's angular sweep starts at 3 o'clock while CSS
 * conic starts at 12 o'clock, so the base rotation is (angle − 90°); the
 * matrix (layer coords → gradient coords) also maps the CSS `at` center
 * onto the gradient-space center (0.5, 0.5).
 */
export function calculateConicGradientTransform(
  angleDeg: number,
  cx: number,
  cy: number,
): Transform {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    [cos, sin, 0.5 - cos * cx - sin * cy],
    [-sin, cos, 0.5 + sin * cx - cos * cy],
  ];
}

/**
 * Calculate linear gradient transform for a given CSS angle
 *
 * When elementWidth/elementHeight are provided, uses the CSS gradient line formula
 * to account for aspect ratio. Without dimensions, falls back to pure rotation
 * (correct only for square elements).
 *
 * CSS gradient line: passes through center, extends to corners.
 * Length = |W * sin(θ)| + |H * cos(θ)|
 */
export function calculateLinearGradientTransform(
  angleDeg: number,
  elementWidth?: number,
  elementHeight?: number
): Transform {
  // Fallback: pure rotation (backward compatible, correct for squares)
  if (!elementWidth || !elementHeight) {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return [
      [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
      [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
    ];
  }

  const theta = (angleDeg * Math.PI) / 180;
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // CSS gradient line half-length (extends to cover corners)
  const halfLen =
    (Math.abs(elementWidth * sinT) + Math.abs(elementHeight * cosT)) / 2;

  // Start (0%) and end (100%) points in pixel space
  // CSS direction vector: (sin θ, -cos θ) in screen coords (y-down)
  const cx = elementWidth / 2;
  const cy = elementHeight / 2;
  const sx = cx - halfLen * sinT;
  const sy = cy + halfLen * cosT;
  const ex = cx + halfLen * sinT;
  const ey = cy - halfLen * cosT;

  // Convert to normalized [0,1] unit space
  const sxn = sx / elementWidth;
  const syn = sy / elementHeight;
  const exn = ex / elementWidth;
  const eyn = ey / elementHeight;

  // Direction vector in unit space
  const dx = exn - sxn;
  const dy = eyn - syn;
  const lenSq = dx * dx + dy * dy;

  // Row 1: gradient position (gx) = projection onto gradient direction
  const a = dx / lenSq;
  const b = dy / lenSq;
  const c = -(dx * sxn + dy * syn) / lenSq;

  // Row 2: perpendicular direction, centered at 0.5
  const d = -dy / lenSq;
  const e = dx / lenSq;
  const f = 0.5 - d * 0.5 - e * 0.5;

  return [
    [a, b, c],
    [d, e, f],
  ];
}
