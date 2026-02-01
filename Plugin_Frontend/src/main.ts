import { showUI } from "@create-figma-plugin/utilities";
import { logger } from "./utils/logger";
import { errorHandler, ErrorCode } from "./utils/errorHandler";

// Types for nested wireframe data
interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;

  // Layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };

  // Style
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  opacity: number;

  // Text
  textContent: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: string;

  // Media
  isPlaceholder: boolean;

  // Nested children
  children: WireframeNode[];
}

interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
}

// CSS Variable extracted from the page
interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value
  category?: string; // color, spacing, typography, etc.
}

interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  localStyles?: object;
  pluginColors: {
    main: string;
    text: string;
    accent: string;
    surface: string;
    border: string;
    background: string;
  };
  cssVariables?: ExtractedCSSVariable[];
  variableMode?: "styles" | "direct";
}

// Context passed to render functions for style linking
interface RenderContext {
  pluginColors: RenderWireframeData["pluginColors"];
  fontFamily: string;
  variableMode: "styles" | "direct";
  cssVariables: ExtractedCSSVariable[];
  // Map from resolved color value → PaintStyle (for linking)
  colorStyleMap: Map<string, PaintStyle>;
  // Map from variable name → resolved value
  variableValueMap: Map<string, string>;
}

// Extract single border radius value from number or object
function getBorderRadius(value: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  // Return the maximum corner radius for uniform appearance
  return Math.max(value.topLeft || 0, value.topRight || 0, value.bottomRight || 0, value.bottomLeft || 0);
}

// Convert hex color to Figma RGB (0-1 range)
// Supports 6-digit (#RRGGBB) and 8-digit (#RRGGBBAA) hex
function hexToFigmaRGB(hex: string): RGB {
  if (!hex || hex === "transparent" || hex === "null") {
    return { r: 0.96, g: 0.96, b: 0.96 }; // Default light gray
  }

  const cleanHex = hex.replace("#", "");

  // Handle 8-digit hex (with alpha) - extract first 6 digits
  const colorHex = cleanHex.length === 8 ? cleanHex.slice(0, 6) : cleanHex;

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorHex);

  if (!result) {
    return { r: 0.96, g: 0.96, b: 0.96 };
  }

  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

// Parse CSS color to Figma RGB (handles hex, rgb, rgba)
function cssColorToFigmaRGB(color: string): { color: RGB; opacity: number } | null {
  if (!color || color === "transparent") return null;

  // Handle hex (6 or 8 digit)
  if (color.startsWith("#")) {
    const cleanHex = color.replace("#", "");
    let opacity = 1;

    // 8-digit hex has alpha in last 2 characters
    if (cleanHex.length === 8) {
      opacity = parseInt(cleanHex.slice(6, 8), 16) / 255;
    }

    return { color: hexToFigmaRGB(color), opacity };
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    return {
      color: {
        r: parseInt(r) / 255,
        g: parseInt(g) / 255,
        b: parseInt(b) / 255,
      },
      opacity: a !== undefined ? parseFloat(a) : 1,
    };
  }

  return null;
}

// Resolve CSS variables in a string (e.g., gradient or color)
function resolveCSSVariables(
  value: string,
  variableValueMap: Map<string, string>
): string {
  if (!value || !value.includes("var(")) return value;

  // Replace all var(--name) with resolved values
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (match, varName, fallback) => {
    const resolved = variableValueMap.get(varName);
    if (resolved) return resolved;
    if (fallback) return fallback.trim();
    return match; // Keep original if not found
  });
}

// Parse CSS gradient to Figma GradientPaint
function parseGradient(gradient: string, variableValueMap?: Map<string, string>): GradientPaint | null {
  if (!gradient) return null;

  // Resolve CSS variables first
  const resolvedGradient = variableValueMap
    ? resolveCSSVariables(gradient, variableValueMap)
    : gradient;

  // Match linear-gradient
  const linearMatch = resolvedGradient.match(/linear-gradient\s*\(\s*(\d+)deg\s*,\s*(.+)\)/i);
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

// Parse color stops from gradient string
function parseColorStops(colorStopsStr: string): ColorStop[] {
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

// Create gallery icon for image/video placeholders
async function createGalleryIcon(size: number): Promise<FrameNode> {
  const iconFrame = figma.createFrame();
  iconFrame.name = "Gallery Icon";
  iconFrame.resize(size, size);
  iconFrame.fills = [];

  // Create simple gallery icon using rectangles
  const iconColor: RGB = { r: 0.6, g: 0.6, b: 0.6 };
  const strokeWeight = Math.max(2, size / 20);

  // Outer rectangle (image frame)
  const outerRect = figma.createRectangle();
  outerRect.resize(size * 0.8, size * 0.7);
  outerRect.x = size * 0.1;
  outerRect.y = size * 0.15;
  outerRect.fills = [];
  outerRect.strokes = [{ type: "SOLID", color: iconColor }];
  outerRect.strokeWeight = strokeWeight;
  outerRect.cornerRadius = size * 0.05;
  iconFrame.appendChild(outerRect);

  // Mountain shape (triangle)
  const mountain = figma.createPolygon();
  mountain.pointCount = 3;
  mountain.resize(size * 0.4, size * 0.25);
  mountain.x = size * 0.2;
  mountain.y = size * 0.5;
  mountain.fills = [{ type: "SOLID", color: iconColor }];
  iconFrame.appendChild(mountain);

  // Sun circle
  const sun = figma.createEllipse();
  sun.resize(size * 0.15, size * 0.15);
  sun.x = size * 0.6;
  sun.y = size * 0.25;
  sun.fills = [{ type: "SOLID", color: iconColor }];
  iconFrame.appendChild(sun);

  return iconFrame;
}

// Create placeholder for images/videos
async function createPlaceholder(
  node: WireframeNode,
  surfaceColor: string
): Promise<FrameNode> {
  const placeholder = figma.createFrame();
  placeholder.name = node.name || "Image Placeholder";
  placeholder.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Surface background color
  placeholder.fills = [
    {
      type: "SOLID",
      color: hexToFigmaRGB(surfaceColor),
    },
  ];

  // Border radius
  if (getBorderRadius(node.borderRadius) > 0) {
    placeholder.cornerRadius = Math.min(
      getBorderRadius(node.borderRadius),
      Math.min(node.width, node.height) / 2
    );
  }

  // Add gallery icon in center
  const iconSize = Math.min(node.width, node.height) * 0.3;
  if (iconSize >= 20) {
    const icon = await createGalleryIcon(iconSize);
    icon.x = (node.width - iconSize) / 2;
    icon.y = (node.height - iconSize) / 2;
    placeholder.appendChild(icon);
  }

  return placeholder;
}

// Text segment for tracking styled ranges
interface TextSegment {
  text: string;
  color: string;
  fontWeight: number;
  fontSize: number;
}

// Collect all text segments from a node and its inline children
function collectTextSegments(node: WireframeNode): TextSegment[] {
  const segments: TextSegment[] = [];

  // Add parent text content if exists (may be partial)
  if (node.textContent && node.textContent.trim() !== "") {
    segments.push({
      text: node.textContent,
      color: node.textColor || "#333333",
      fontWeight: node.fontWeight || 400,
      fontSize: node.fontSize || 14,
    });
  }

  // Check for inline text children (like <a> inside <h2>)
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      // Only include inline text children
      if (child.type === "text" && child.textContent && child.textContent.trim() !== "") {
        segments.push({
          text: child.textContent,
          color: child.textColor || node.textColor || "#333333",
          fontWeight: child.fontWeight || node.fontWeight || 400,
          fontSize: child.fontSize || node.fontSize || 14,
        });
      }
    }
  }

  return segments;
}

// Create text node with support for inline styled children
async function createTextNode(
  node: WireframeNode,
  fontFamily: string,
  context?: RenderContext
): Promise<TextNode | null> {
  // Collect all text segments (parent + inline children)
  const segments = collectTextSegments(node);

  if (segments.length === 0) {
    return null;
  }

  const textNode = figma.createText();

  // Determine main font style based on parent weight
  let mainFontStyle = "Regular";
  if (node.fontWeight >= 600) {
    mainFontStyle = "Bold";
  } else if (node.fontWeight >= 500) {
    mainFontStyle = "Medium";
  }

  // Load required fonts
  const fontsToLoad = new Set<string>();
  fontsToLoad.add(mainFontStyle);
  for (const seg of segments) {
    if (seg.fontWeight >= 600) fontsToLoad.add("Bold");
    else if (seg.fontWeight >= 500) fontsToLoad.add("Medium");
    else fontsToLoad.add("Regular");
  }

  let usedFontFamily = fontFamily;
  const fontStyles = Array.from(fontsToLoad);
  try {
    for (const style of fontStyles) {
      await figma.loadFontAsync({ family: fontFamily, style });
    }
  } catch {
    try {
      usedFontFamily = "Inter";
      for (const style of fontStyles) {
        await figma.loadFontAsync({ family: "Inter", style });
      }
    } catch {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      usedFontFamily = "Inter";
    }
  }

  // Set initial font
  textNode.fontName = { family: usedFontFamily, style: mainFontStyle };

  // Combine all text content
  const fullText = segments.map((s) => s.text).join("");
  textNode.characters = fullText;

  // Apply base font size
  textNode.fontSize = Math.max(node.fontSize || 14, 8);

  // Apply range-specific styling if there are multiple segments
  if (segments.length > 1) {
    let charIndex = 0;
    for (const segment of segments) {
      const startIdx = charIndex;
      const endIdx = charIndex + segment.text.length;
      charIndex = endIdx;

      if (startIdx >= endIdx) continue;

      // Apply segment color
      const colorWithOpacity = cssColorToFigmaRGB(segment.color);
      if (colorWithOpacity) {
        // Check if we should link to a style
        let linkedStyle: PaintStyle | undefined;
        if (context && context.variableMode === "styles") {
          // Normalize color for lookup
          const normalizedColor = normalizeColorForLookup(segment.color);
          linkedStyle = context.colorStyleMap.get(normalizedColor);
        }

        if (linkedStyle) {
          textNode.setRangeFillStyleId(startIdx, endIdx, linkedStyle.id);
        } else {
          textNode.setRangeFills(startIdx, endIdx, [
            {
              type: "SOLID",
              color: colorWithOpacity.color,
              opacity: colorWithOpacity.opacity,
            },
          ]);
        }
      }

      // Apply segment font weight
      let segStyle = "Regular";
      if (segment.fontWeight >= 600) segStyle = "Bold";
      else if (segment.fontWeight >= 500) segStyle = "Medium";

      try {
        textNode.setRangeFontName(startIdx, endIdx, {
          family: usedFontFamily,
          style: segStyle,
        });
      } catch {
        // Keep default
      }

      // Apply segment font size if different
      if (segment.fontSize && segment.fontSize !== node.fontSize) {
        textNode.setRangeFontSize(startIdx, endIdx, Math.max(segment.fontSize, 8));
      }
    }
  } else {
    // Single segment - apply simple styling
    const segment = segments[0];
    const colorWithOpacity = cssColorToFigmaRGB(segment.color);

    if (colorWithOpacity) {
      // Check if we should link to a style
      let linkedStyle: PaintStyle | undefined;
      if (context && context.variableMode === "styles") {
        const normalizedColor = normalizeColorForLookup(segment.color);
        linkedStyle = context.colorStyleMap.get(normalizedColor);
      }

      if (linkedStyle) {
        textNode.fillStyleId = linkedStyle.id;
      } else {
        textNode.fills = [
          {
            type: "SOLID",
            color: colorWithOpacity.color,
            opacity: colorWithOpacity.opacity,
          },
        ];
      }
    }
  }

  // Text alignment
  const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
    left: "LEFT",
    center: "CENTER",
    right: "RIGHT",
    justify: "JUSTIFIED",
    start: "LEFT",
    end: "RIGHT",
  };
  textNode.textAlignHorizontal = alignMap[node.textAlign] || "LEFT";

  // Set text box size
  textNode.resize(Math.max(node.width, 1), Math.max(node.height, 1));
  textNode.textAutoResize = "HEIGHT";

  return textNode;
}

// Normalize color value for style lookup (lowercase, consistent format)
function normalizeColorForLookup(color: string): string {
  if (!color) return "";
  const trimmed = color.trim().toLowerCase();

  // For hex colors, ensure consistent format
  if (trimmed.startsWith("#")) {
    // Convert 3-digit to 6-digit if needed
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return trimmed;
  }

  return trimmed;
}

// Apply fill to a frame with optional style linking
function applyFillToFrame(
  frame: FrameNode,
  color: string,
  context: RenderContext
): void {
  const colorWithOpacity = cssColorToFigmaRGB(color);
  if (!colorWithOpacity) {
    frame.fills = [];
    return;
  }

  // Check if we should link to a style
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(color);
    const linkedStyle = context.colorStyleMap.get(normalizedColor);

    if (linkedStyle) {
      frame.fillStyleId = linkedStyle.id;
      return;
    }
  }

  // Apply direct color
  frame.fills = [
    {
      type: "SOLID",
      color: colorWithOpacity.color,
      opacity: colorWithOpacity.opacity,
    },
  ];
}

// Apply stroke to a frame with optional style linking
function applyStrokeToFrame(
  frame: FrameNode,
  color: string,
  strokeWeight: number,
  context: RenderContext
): void {
  const colorWithOpacity = cssColorToFigmaRGB(color);
  if (!colorWithOpacity) return;

  // Check if we should link to a style
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(color);
    const linkedStyle = context.colorStyleMap.get(normalizedColor);

    if (linkedStyle) {
      frame.strokeStyleId = linkedStyle.id;
      frame.strokeWeight = strokeWeight;
      return;
    }
  }

  // Apply direct color
  frame.strokes = [
    {
      type: "SOLID",
      color: colorWithOpacity.color,
      opacity: colorWithOpacity.opacity,
    },
  ];
  frame.strokeWeight = strokeWeight;
}

// Recursively create Figma nodes from tree structure
async function createNodeInFigma(
  node: WireframeNode,
  context: RenderContext,
  depth: number = 0
): Promise<SceneNode | null> {
  // Depth limit to prevent infinite recursion
  if (depth > 20) {
    logger.warn("Max depth reached", { nodeId: node.id, depth });
    return null;
  }

  // Handle text nodes (including those with inline children like <a> inside <h2>)
  if (node.type === "text") {
    return await createTextNode(node, context.fontFamily, context);
  }

  // Handle placeholders (images/videos)
  if (node.type === "placeholder" || node.isPlaceholder) {
    return await createPlaceholder(node, context.pluginColors.surface);
  }

  // Create frame for containers
  const frame = figma.createFrame();
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout if detected
  if (node.layoutMode && node.layoutMode !== "NONE") {
    frame.layoutMode = node.layoutMode;
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";

    if (node.itemSpacing > 0) {
      frame.itemSpacing = node.itemSpacing;
    }

    if (node.padding) {
      frame.paddingTop = node.padding.top || 0;
      frame.paddingRight = node.padding.right || 0;
      frame.paddingBottom = node.padding.bottom || 0;
      frame.paddingLeft = node.padding.left || 0;
    }
  }

  // Apply background (gradient takes priority over solid color)
  if (node.backgroundGradient) {
    // Resolve CSS variables in gradient
    const gradientPaint = parseGradient(node.backgroundGradient, context.variableValueMap);
    if (gradientPaint) {
      frame.fills = [gradientPaint];
    } else if (node.backgroundColor) {
      // Fallback to solid color if gradient parsing fails
      applyFillToFrame(frame, node.backgroundColor, context);
    } else {
      frame.fills = [];
    }
  } else if (node.backgroundColor) {
    applyFillToFrame(frame, node.backgroundColor, context);
  } else {
    frame.fills = [];
  }

  // Apply border/stroke
  if (node.borderWidth > 0 && node.borderColor) {
    applyStrokeToFrame(frame, node.borderColor, node.borderWidth, context);
  }

  // Apply border radius
  if (getBorderRadius(node.borderRadius) > 0) {
    frame.cornerRadius = Math.min(
      getBorderRadius(node.borderRadius),
      Math.min(node.width, node.height) / 2
    );
  }

  // Apply opacity
  if (node.opacity < 1 && node.opacity > 0) {
    frame.opacity = node.opacity;
  }

  // Clips content
  frame.clipsContent = true;

  // Recursively create children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      try {
        const childNode = await createNodeInFigma(child, context, depth + 1);

        if (childNode) {
          // Position child relative to parent
          childNode.x = child.x;
          childNode.y = child.y;
          frame.appendChild(childNode);
        }
      } catch (err) {
        logger.error("Error creating child node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  return frame;
}

// Create a single wireframe frame with nested structure
async function createWireframeFrame(
  frameData: WireframeFrame,
  sourceUrl: string,
  context: RenderContext,
  index: number
): Promise<FrameNode> {
  const { pluginColors, fontFamily } = context;

  // Load required fonts
  try {
    await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    await figma.loadFontAsync({ family: fontFamily, style: "Medium" });
    await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  } catch {
    logger.warn("Failed to load custom fonts, using Inter", { fontFamily });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  }

  // Create main frame
  const wireframeFrame = figma.createFrame();

  // Extract hostname for naming
  let hostname = "website";
  try {
    hostname = new URL(sourceUrl).hostname.replace("www.", "");
  } catch {
    // Use default
  }

  wireframeFrame.name = `Wireframe - ${hostname} (${frameData.viewportWidth}px)`;
  wireframeFrame.resize(
    frameData.viewportWidth,
    Math.min(frameData.viewportHeight, 15000)
  );

  // Position: Viewport center + offset for multiple frames
  const viewport = figma.viewport.center;
  wireframeFrame.x =
    viewport.x - frameData.viewportWidth / 2 + index * (frameData.viewportWidth + 100);
  wireframeFrame.y = viewport.y - 200;

  // Set frame background
  wireframeFrame.fills = [
    {
      type: "SOLID",
      color: hexToFigmaRGB(pluginColors.background),
    },
  ];

  // Clip contents
  wireframeFrame.clipsContent = true;

  // Create nested structure from tree
  if (frameData.tree && frameData.tree.children) {
    for (const child of frameData.tree.children) {
      try {
        const childNode = await createNodeInFigma(child, context, 1);

        if (childNode) {
          childNode.x = child.x;
          childNode.y = child.y;
          wireframeFrame.appendChild(childNode);
        }
      } catch (err) {
        logger.error("Error creating top-level node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  return wireframeFrame;
}

// Check if a color value is a valid color (not a spacing/size value)
function isColorValue(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();

  // Check for hex colors
  if (trimmed.startsWith("#")) return true;

  // Check for rgb/rgba/hsl/hsla
  if (
    trimmed.startsWith("rgb") ||
    trimmed.startsWith("hsl") ||
    trimmed.startsWith("oklab") ||
    trimmed.startsWith("oklch")
  )
    return true;

  // Check for named colors (common ones)
  const namedColors = [
    "black",
    "white",
    "red",
    "green",
    "blue",
    "yellow",
    "transparent",
  ];
  if (namedColors.includes(trimmed)) return true;

  return false;
}

// Create Figma color styles from CSS variables
async function createColorStylesFromVariables(
  cssVariables: ExtractedCSSVariable[],
  sourceUrl: string
): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();

  // Filter to only color variables
  const colorVariables = cssVariables.filter(
    (v) => v.category === "color" || isColorValue(v.value)
  );

  if (colorVariables.length === 0) {
    return styleMap;
  }

  // Extract hostname for style naming
  let hostname = "Website";
  try {
    hostname = new URL(sourceUrl).hostname.replace("www.", "").split(".")[0];
    hostname = hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    // Use default
  }

  logger.info("Creating color styles from CSS variables", {
    variableCount: colorVariables.length,
  });

  for (const variable of colorVariables) {
    try {
      const parsed = cssColorToFigmaRGB(variable.value);
      if (!parsed) continue;

      // Create style name: "Website / --variable-name"
      const styleName = `${hostname} / ${variable.name}`;

      // Check if style already exists
      const existingStyles = figma.getLocalPaintStyles();
      const existing = existingStyles.find((s) => s.name === styleName);

      if (existing) {
        styleMap.set(variable.name, existing);
        continue;
      }

      // Create new paint style
      const style = figma.createPaintStyle();
      style.name = styleName;
      style.paints = [
        {
          type: "SOLID",
          color: parsed.color,
          opacity: parsed.opacity,
        },
      ];

      styleMap.set(variable.name, style);
    } catch (err) {
      logger.warn("Failed to create style for variable", {
        variable: variable.name,
        error: err,
      });
    }
  }

  return styleMap;
}

// Main plugin function
export default function () {
  showUI({ width: 400, height: 600 });

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Handle render-wireframe message
    if (msg.type === "render-wireframe") {
      const data = msg.data as RenderWireframeData;
      const {
        frames,
        sourceUrl,
        pluginColors,
        cssVariables,
        variableMode,
      } = data;

      // Default colors if not provided
      const colors = pluginColors || {
        main: "#1f3a5f",
        text: "#333333",
        accent: "#3b82f6",
        surface: "#f5f5f5",
        border: "#e0e0e0",
        background: "#ffffff",
      };

      // Default font
      const fontFamily = "Montserrat";

      if (!frames || frames.length === 0) {
        errorHandler.handle({
          code: ErrorCode.NO_DATA_RECEIVED,
          message: "No wireframe data received",
        });
        return;
      }

      logger.info("Creating wireframe", {
        frameCount: frames.length,
        sourceUrl,
        variableMode: variableMode || "direct",
        cssVariablesCount: cssVariables?.length || 0,
      });
      figma.notify("Creating wireframe...", { timeout: 2000 });

      // Build context for rendering
      const colorStyleMap = new Map<string, PaintStyle>();
      const variableValueMap = new Map<string, string>();

      // Populate variable value map (for resolving var() references)
      if (cssVariables && cssVariables.length > 0) {
        for (const variable of cssVariables) {
          variableValueMap.set(variable.name, variable.value);
        }
      }

      // Create color styles from CSS variables if mode is "styles"
      if (variableMode === "styles" && cssVariables && cssVariables.length > 0) {
        figma.notify("Creating color styles from CSS variables...", { timeout: 1500 });
        try {
          const styleMap = await createColorStylesFromVariables(cssVariables, sourceUrl);
          logger.info("Created color styles", { styleCount: styleMap.size });

          // Build color lookup map (resolved value → style)
          for (const variable of cssVariables) {
            const normalizedValue = normalizeColorForLookup(variable.value);
            const style = styleMap.get(variable.name);
            if (style && normalizedValue) {
              colorStyleMap.set(normalizedValue, style);
            }
          }
        } catch (err) {
          logger.warn("Failed to create color styles", { error: err });
        }
      }

      // Create render context
      const renderContext: RenderContext = {
        pluginColors: colors,
        fontFamily,
        variableMode: variableMode || "direct",
        cssVariables: cssVariables || [],
        colorStyleMap,
        variableValueMap,
      };

      try {
        const createdFrames: FrameNode[] = [];

        for (let i = 0; i < frames.length; i++) {
          figma.notify(`Processing viewport ${i + 1}/${frames.length}...`, {
            timeout: 1000,
          });

          const wireframeFrame = await createWireframeFrame(
            frames[i],
            sourceUrl,
            renderContext,
            i
          );
          createdFrames.push(wireframeFrame);
        }

        // Select all created frames
        figma.currentPage.selection = createdFrames;

        // Zoom to fit created frames
        figma.viewport.scrollAndZoomIntoView(createdFrames);

        logger.info("Wireframe created successfully", {
          frameCount: createdFrames.length,
        });
        figma.notify(`Created ${createdFrames.length} wireframe frame(s)!`, {
          timeout: 3000,
        });

        // Send success message back to UI
        figma.ui.postMessage({
          type: "wireframe-created",
          data: {
            success: true,
            frameCount: createdFrames.length,
          },
        });
      } catch (error) {
        errorHandler.handle({
          code: ErrorCode.WIREFRAME_CREATION_FAILED,
          message: "Error creating wireframe",
          originalError: error,
          context: { sourceUrl, frameCount: frames.length },
        });

        // Send error message back to UI
        figma.ui.postMessage({
          type: "wireframe-error",
          data: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    // Handle open-wireframe message from Library
    if (msg.type === "open-wireframe") {
      logger.debug("Open wireframe requested", { data: msg.data });
      // TODO: Implement opening saved wireframes
    }

    // Handle community wireframe usage
    if (msg.type === "use-community-wireframe") {
      logger.debug("Use community wireframe requested", { data: msg.data });
      // TODO: Implement community wireframe insertion
    }
  };
}
