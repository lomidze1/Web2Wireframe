// Wireframe Converter: Simplified JSON (AI output) → WireframeNode tree
// Output must match Plugin_Frontend/src/types/index.ts WireframeNode interface

const { DESIGN_TOKENS, getBreakpoint, getToken } = require("./designTokens");

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Convert hex color to FigmaColor { r, g, b, a }
 * @param {string} hex - "#RRGGBB" or "transparent"
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function hexToFigmaColor(hex) {
  if (!hex || hex === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b, a: 1 };
}

/**
 * Create a SOLID fill object
 * @param {string} hexColor
 * @returns {{ type: string, visible: boolean, opacity: number, color: object }}
 */
function solidFill(hexColor) {
  return {
    type: "SOLID",
    visible: true,
    opacity: 1,
    color: hexToFigmaColor(hexColor),
  };
}

/**
 * Resolve a background role name to an actual hex color
 * @param {string} role - "background"|"surface"|"accent"|"transparent"
 * @param {object} colors - pluginColors palette
 * @returns {string|null}
 */
function resolveBackgroundColor(role, colors) {
  switch (role) {
    case "background": return colors.background;
    case "surface": return colors.surface;
    case "accent": return colors.accent;
    case "transparent": return null;
    default: return null;
  }
}

// ============================================================================
// ID generator
// ============================================================================

function createIdGenerator() {
  let counter = 0;
  return function nextId() {
    return `ai-node-${++counter}`;
  };
}

// ============================================================================
// Default node factory
// ============================================================================

/**
 * Create a WireframeNode with all required fields defaulted
 * @param {function} nextId - ID generator
 * @param {object} overrides - fields to override
 * @returns {object} WireframeNode
 */
function createDefaultNode(nextId, overrides = {}) {
  const node = {
    id: nextId(),
    name: "",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    backgroundColor: null,
    backgroundGradient: null,
    fills: [],
    strokes: [],
    effects: [],
    textColor: "#000000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };

  // Coerce numeric fields — AI may return strings like "800" instead of 800
  node.width = Number(node.width) || 0;
  node.height = Number(node.height) || 0;
  node.itemSpacing = Number(node.itemSpacing) || 0;
  node.borderWidth = Number(node.borderWidth) || 0;
  node.borderRadius = Number(node.borderRadius) || 0;
  if (node.padding) {
    node.padding = {
      top: Number(node.padding.top) || 0,
      right: Number(node.padding.right) || 0,
      bottom: Number(node.padding.bottom) || 0,
      left: Number(node.padding.left) || 0,
    };
  }

  return node;
}

// ============================================================================
// Context type for passing through converters
// ============================================================================

/**
 * @typedef {object} ConvertContext
 * @property {number} viewportWidth
 * @property {string} breakpoint
 * @property {object} colors - pluginColors
 * @property {string} font - pluginFont
 * @property {function} nextId - ID generator
 */

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Convert simplified AI JSON to a WireframeNode tree
 * @param {object} simplifiedJSON - AI output { totalHeight, sections[] }
 * @param {number} viewportWidth
 * @param {object} pluginColors - { text, background, secondary, surface, accent }
 * @param {string} pluginFont
 * @returns {object} WireframeNode root (body)
 */
function convertToWireframeTree(simplifiedJSON, viewportWidth, pluginColors, pluginFont) {
  const breakpoint = getBreakpoint(viewportWidth);
  const nextId = createIdGenerator();

  const ctx = {
    viewportWidth,
    breakpoint,
    colors: pluginColors,
    font: pluginFont,
    nextId,
  };

  const rootNode = createDefaultNode(nextId, {
    name: "Body",
    type: "frame",
    tag: "body",
    width: viewportWidth,
    height: Number(simplifiedJSON.totalHeight) || 0,
    layoutMode: "VERTICAL",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "HUG",
    backgroundColor: pluginColors.background,
    fills: [solidFill(pluginColors.background)],
    textColor: pluginColors.text,
    fontFamily: pluginFont,
  });

  for (const section of simplifiedJSON.sections || []) {
    const sectionNode = convertSection(section, ctx);
    if (sectionNode) rootNode.children.push(sectionNode);
  }

  return rootNode;
}

// ============================================================================
// Section converter
// ============================================================================

function getAlignFromLayout(layout) {
  switch (layout) {
    case "center-stacked": return "center";
    case "two-column": return "stretch";
    case "three-column-grid":
    case "four-column-grid": return "stretch";
    case "sidebar-left":
    case "sidebar-right": return "stretch";
    default: return "stretch";
  }
}

function convertSection(section, ctx) {
  const bgColor = resolveBackgroundColor(section.background, ctx.colors);
  const defaultPadding = ctx.breakpoint === "mobile"
    ? { top: 40, right: 20, bottom: 40, left: 20 }
    : ctx.breakpoint === "tablet"
      ? { top: 56, right: 40, bottom: 56, left: 40 }
      : { top: 64, right: 80, bottom: 64, left: 80 };

  const sectionNode = createDefaultNode(ctx.nextId, {
    name: section.name || "Section",
    type: "frame",
    tag: "section",
    width: ctx.viewportWidth,
    height: section.height || 0,
    layoutMode: "VERTICAL",
    itemSpacing: section.gap != null ? section.gap : 24,
    padding: section.padding || defaultPadding,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    justifyContent: "center",
    alignItems: getAlignFromLayout(section.layout),
    backgroundColor: bgColor,
    fills: bgColor ? [solidFill(bgColor)] : [],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  const elements = section.elements || [];

  switch (section.layout) {
    case "center-stacked":
      sectionNode.children = convertCenterStacked(elements, ctx);
      break;
    case "two-column":
      sectionNode.children = [convertTwoColumn(elements, ctx)];
      break;
    case "three-column-grid":
      sectionNode.children = [convertColumnGrid(elements, 3, ctx)];
      break;
    case "four-column-grid":
      sectionNode.children = [convertColumnGrid(elements, 4, ctx)];
      break;
    case "sidebar-left":
      sectionNode.children = [convertSidebarLayout(elements, "left", ctx)];
      break;
    case "sidebar-right":
      sectionNode.children = [convertSidebarLayout(elements, "right", ctx)];
      break;
    default:
      // Fallback: treat as center-stacked
      sectionNode.children = convertCenterStacked(elements, ctx);
      break;
  }

  return sectionNode;
}

// ============================================================================
// Layout converters
// ============================================================================

function convertCenterStacked(elements, ctx) {
  const nodes = [];
  for (const el of elements) {
    const node = convertElement(el, ctx);
    if (node) nodes.push(node);
  }
  return nodes;
}

function convertTwoColumn(elements, ctx) {
  const leftElements = elements.filter((el) => el.column === "left");
  const rightElements = elements.filter((el) => el.column === "right");
  // Elements without column assignment go to left
  const unassigned = elements.filter((el) => !el.column);
  leftElements.push(...unassigned);

  const columnGap = ctx.breakpoint === "mobile" ? 16 : 32;
  const isMobile = ctx.breakpoint === "mobile";

  const rowNode = createDefaultNode(ctx.nextId, {
    name: "Row",
    type: "frame",
    tag: "div",
    width: 0,
    height: 0,
    layoutMode: isMobile ? "VERTICAL" : "HORIZONTAL",
    itemSpacing: columnGap,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  // Left column
  const leftCol = createDefaultNode(ctx.nextId, {
    name: "Column Left",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 16,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    layoutGrow: 1,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (const el of leftElements) {
    const node = convertElement(el, ctx);
    if (node) leftCol.children.push(node);
  }

  // Right column
  const rightCol = createDefaultNode(ctx.nextId, {
    name: "Column Right",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 16,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    layoutGrow: 1,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (const el of rightElements) {
    const node = convertElement(el, ctx);
    if (node) rightCol.children.push(node);
  }

  rowNode.children = [leftCol, rightCol];
  return rowNode;
}

function convertColumnGrid(elements, columns, ctx) {
  const gap = ctx.breakpoint === "mobile" ? 12 : 24;
  const isMobile = ctx.breakpoint === "mobile";
  const effectiveCols = isMobile ? 1 : columns;

  const gridNode = createDefaultNode(ctx.nextId, {
    name: `${columns}-Column Grid`,
    type: "frame",
    tag: "div",
    layoutMode: isMobile ? "VERTICAL" : "HORIZONTAL",
    itemSpacing: gap,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    flexWrap: isMobile ? undefined : "wrap",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  for (const el of elements) {
    const node = convertElement(el, ctx);
    if (node) {
      if (!isMobile) node.layoutGrow = 1;
      if (!isMobile) node.layoutSizingHorizontal = "FILL";
      gridNode.children.push(node);
    }
  }

  return gridNode;
}

function convertSidebarLayout(elements, sidebarSide, ctx) {
  const sidebarWidth = ctx.breakpoint === "mobile" ? 0 : 280;
  const isMobile = ctx.breakpoint === "mobile";

  const rowNode = createDefaultNode(ctx.nextId, {
    name: "Sidebar Layout",
    type: "frame",
    tag: "div",
    layoutMode: isMobile ? "VERTICAL" : "HORIZONTAL",
    itemSpacing: 24,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  const sidebarElements = elements.filter((el) => el.column === "sidebar");
  const mainElements = elements.filter((el) => el.column !== "sidebar");

  const sidebarCol = createDefaultNode(ctx.nextId, {
    name: "Sidebar",
    type: "frame",
    tag: "aside",
    width: isMobile ? 0 : sidebarWidth,
    layoutMode: "VERTICAL",
    itemSpacing: 12,
    layoutSizingHorizontal: isMobile ? "FILL" : "FIXED",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (const el of sidebarElements) {
    const node = convertElement(el, ctx);
    if (node) sidebarCol.children.push(node);
  }

  const mainCol = createDefaultNode(ctx.nextId, {
    name: "Main Content",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 16,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    layoutGrow: 1,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (const el of mainElements) {
    const node = convertElement(el, ctx);
    if (node) mainCol.children.push(node);
  }

  if (sidebarSide === "left") {
    rowNode.children = [sidebarCol, mainCol];
  } else {
    rowNode.children = [mainCol, sidebarCol];
  }

  return rowNode;
}

// ============================================================================
// Element dispatcher
// ============================================================================

function convertElement(element, ctx) {
  if (!element || !element.type) return null;

  switch (element.type) {
    case "heading": return convertHeading(element, ctx);
    case "subheading": return convertSubheading(element, ctx);
    case "paragraph": return convertParagraph(element, ctx);
    case "button": return convertButton(element, ctx);
    case "button-group": return convertButtonGroup(element, ctx);
    case "image": return convertImage(element, ctx);
    case "icon": return convertIcon(element, ctx);
    case "card": return convertCard(element, ctx);
    case "input": return convertInput(element, ctx);
    case "nav-links": return convertNavLinks(element, ctx);
    case "logo": return convertLogo(element, ctx);
    case "divider": return convertDivider(ctx);
    case "badge": return convertBadge(element, ctx);
    case "list": return convertList(element, ctx);
    case "avatar": return convertAvatar(element, ctx);
    case "stat": return convertStat(element, ctx);
    case "grid": return convertGrid(element, ctx);
    case "accordion": return convertAccordion(element, ctx);
    default: return null;
  }
}

// ============================================================================
// Element converters
// ============================================================================

function convertHeading(element, ctx) {
  const level = element.level || 2;
  const key = `h${level}`;
  return createDefaultNode(ctx.nextId, {
    name: (element.text || "Heading").substring(0, 30),
    type: "text",
    tag: `h${level}`,
    width: 0,
    height: 0,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textContent: element.text || "",
    fontSize: getToken(DESIGN_TOKENS.fontSize[key], ctx.breakpoint),
    fontWeight: DESIGN_TOKENS.fontWeight[key] || 700,
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: -0.5,
    textColor: ctx.colors.text,
  });
}

function convertSubheading(element, ctx) {
  return createDefaultNode(ctx.nextId, {
    name: (element.text || "Subheading").substring(0, 30),
    type: "text",
    tag: "p",
    width: 0,
    height: 0,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textContent: element.text || "",
    fontSize: getToken(DESIGN_TOKENS.fontSize.subheading, ctx.breakpoint),
    fontWeight: DESIGN_TOKENS.fontWeight.subheading,
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: 0,
    textColor: ctx.colors.secondary || ctx.colors.text,
  });
}

function convertParagraph(element, ctx) {
  const node = createDefaultNode(ctx.nextId, {
    name: (element.text || "Paragraph").substring(0, 30),
    type: "text",
    tag: "p",
    width: 0,
    height: 0,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textContent: element.text || "",
    fontSize: getToken(DESIGN_TOKENS.fontSize.paragraph, ctx.breakpoint),
    fontWeight: DESIGN_TOKENS.fontWeight.paragraph,
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: 0,
    textColor: ctx.colors.text,
  });
  if (element.maxWidth) {
    node.width = Number(element.maxWidth) || 0;
    node.layoutSizingHorizontal = "FIXED";
  }
  return node;
}

function convertButton(element, ctx) {
  const size = element.size || "md";
  const variant = element.variant || "primary";
  const tokens = DESIGN_TOKENS.button[size];

  let bgColor, textColor, borderColor, borderWidth;
  switch (variant) {
    case "primary":
      bgColor = ctx.colors.accent;
      textColor = ctx.colors.text;
      borderColor = null;
      borderWidth = 0;
      break;
    case "secondary":
      bgColor = ctx.colors.surface;
      textColor = ctx.colors.text;
      borderColor = null;
      borderWidth = 0;
      break;
    case "outline":
      bgColor = "transparent";
      textColor = ctx.colors.text;
      borderColor = ctx.colors.secondary;
      borderWidth = 1;
      break;
    case "ghost":
      bgColor = "transparent";
      textColor = ctx.colors.text;
      borderColor = null;
      borderWidth = 0;
      break;
    default:
      bgColor = ctx.colors.accent;
      textColor = ctx.colors.text;
      borderColor = null;
      borderWidth = 0;
  }

  const btnStrokes = borderColor
    ? [{ color: hexToFigmaColor(borderColor), weight: borderWidth, position: "INSIDE", style: "SOLID" }]
    : [];

  // Button = frame with text child
  return createDefaultNode(ctx.nextId, {
    name: element.text || "Button",
    type: "frame",
    tag: "button",
    width: 0,
    height: tokens.height,
    layoutMode: "HORIZONTAL",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "FIXED",
    justifyContent: "center",
    alignItems: "center",
    itemSpacing: 8,
    padding: { top: tokens.paddingV, right: tokens.paddingH, bottom: tokens.paddingV, left: tokens.paddingH },
    backgroundColor: bgColor === "transparent" ? null : bgColor,
    fills: bgColor !== "transparent" ? [solidFill(bgColor)] : [],
    strokes: btnStrokes,
    borderColor,
    borderWidth,
    borderRadius: tokens.borderRadius,
    textColor,
    fontFamily: ctx.font,
    fontSize: DESIGN_TOKENS.fontSize.button[size],
    fontWeight: DESIGN_TOKENS.fontWeight.button,
    children: [
      createDefaultNode(ctx.nextId, {
        name: element.text || "Button Text",
        type: "text",
        tag: "span",
        width: 0,
        height: 0,
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "HUG",
        textContent: element.text || "",
        fontSize: DESIGN_TOKENS.fontSize.button[size],
        fontWeight: DESIGN_TOKENS.fontWeight.button,
        fontFamily: ctx.font,
        textAlign: "center",
        textColor,
      }),
    ],
  });
}

function convertButtonGroup(element, ctx) {
  const direction = element.direction || "horizontal";
  const buttons = element.buttons || [];

  const groupNode = createDefaultNode(ctx.nextId, {
    name: "Button Group",
    type: "frame",
    tag: "div",
    layoutMode: direction === "horizontal" ? "HORIZONTAL" : "VERTICAL",
    itemSpacing: 12,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  for (const btn of buttons) {
    const btnNode = convertButton({ ...btn, type: "button" }, ctx);
    if (btnNode) groupNode.children.push(btnNode);
  }

  return groupNode;
}

function convertImage(element, ctx) {
  const widthMap = {
    full: ctx.viewportWidth,
    half: Math.round(ctx.viewportWidth * 0.48),
    third: Math.round(ctx.viewportWidth * 0.31),
    quarter: Math.round(ctx.viewportWidth * 0.23),
  };
  const width = typeof element.width === "number" ? element.width : (widthMap[element.width] || ctx.viewportWidth);
  const ratio = DESIGN_TOKENS.imagePlaceholder.aspectRatios[element.aspectRatio] || 0.5625;
  const height = Math.round(width * ratio);

  return createDefaultNode(ctx.nextId, {
    name: "Image Placeholder",
    type: "placeholder",
    tag: "img",
    width,
    height,
    layoutSizingHorizontal: element.width === "full" ? "FILL" : "FIXED",
    layoutSizingVertical: "FIXED",
    isPlaceholder: true,
    borderRadius: element.rounded ? 12 : 0,
    backgroundColor: ctx.colors.secondary || ctx.colors.surface,
    fills: [solidFill(ctx.colors.secondary || ctx.colors.surface)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
}

function convertIcon(element, ctx) {
  const size = element.size || "md";
  const dim = DESIGN_TOKENS.icon[size];
  return createDefaultNode(ctx.nextId, {
    name: "Icon",
    type: "placeholder",
    tag: "span",
    width: dim,
    height: dim,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    isPlaceholder: true,
    borderRadius: dim / 2,
    backgroundColor: ctx.colors.secondary || ctx.colors.surface,
    fills: [solidFill(ctx.colors.secondary || ctx.colors.surface)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
}

function convertCard(element, ctx) {
  const bgRole = element.background || "surface";
  const bgColor = resolveBackgroundColor(bgRole, ctx.colors);
  const padding = element.padding != null ? element.padding : DESIGN_TOKENS.card.padding;
  const padObj = typeof padding === "number"
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding;

  const cardNode = createDefaultNode(ctx.nextId, {
    name: "Card",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 12,
    padding: padObj,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    borderRadius: element.rounded !== false ? DESIGN_TOKENS.card.borderRadius : 0,
    backgroundColor: bgColor,
    fills: bgColor ? [solidFill(bgColor)] : [],
    borderColor: ctx.colors.secondary,
    borderWidth: bgRole === "transparent" ? 0 : DESIGN_TOKENS.card.borderWidth,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  if (element.shadow) {
    cardNode.effects = [{
      type: "DROP_SHADOW",
      visible: true,
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 2 },
      radius: 8,
      spread: 0,
    }];
  }

  for (const child of element.elements || []) {
    const node = convertElement(child, ctx);
    if (node) cardNode.children.push(node);
  }

  return cardNode;
}

function convertInput(element, ctx) {
  const tokens = DESIGN_TOKENS.input;
  const isTextarea = element.inputType === "textarea";
  const inputHeight = isTextarea ? tokens.height * 3 : tokens.height;

  const wrapperNode = createDefaultNode(ctx.nextId, {
    name: element.label || "Input",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 6,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  // Label
  if (element.label) {
    wrapperNode.children.push(createDefaultNode(ctx.nextId, {
      name: element.label,
      type: "text",
      tag: "label",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: element.label,
      fontSize: getToken(DESIGN_TOKENS.fontSize.input_label, ctx.breakpoint),
      fontWeight: 500,
      fontFamily: ctx.font,
      textColor: ctx.colors.text,
    }));
  }

  // Input field
  const inputField = createDefaultNode(ctx.nextId, {
    name: "Input Field",
    type: "frame",
    tag: isTextarea ? "textarea" : "input",
    height: inputHeight,
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    padding: tokens.padding,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "FIXED",
    alignItems: isTextarea ? "flex-start" : "center",
    borderRadius: tokens.borderRadius,
    borderColor: ctx.colors.secondary,
    borderWidth: tokens.borderWidth,
    strokes: [{
      color: hexToFigmaColor(ctx.colors.secondary),
      weight: tokens.borderWidth,
      position: "INSIDE",
      style: "SOLID",
    }],
    backgroundColor: ctx.colors.background,
    fills: [solidFill(ctx.colors.background)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  // Placeholder text
  if (element.placeholder) {
    inputField.children.push(createDefaultNode(ctx.nextId, {
      name: "Placeholder",
      type: "text",
      tag: "span",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: element.placeholder,
      fontSize: getToken(DESIGN_TOKENS.fontSize.input_placeholder, ctx.breakpoint),
      fontWeight: 400,
      fontFamily: ctx.font,
      textColor: ctx.colors.secondary,
    }));
  }

  wrapperNode.children.push(inputField);
  return wrapperNode;
}

function convertNavLinks(element, ctx) {
  const direction = element.direction || "horizontal";
  const links = element.links || [];

  const navNode = createDefaultNode(ctx.nextId, {
    name: "Nav Links",
    type: "frame",
    tag: "nav",
    layoutMode: direction === "horizontal" ? "HORIZONTAL" : "VERTICAL",
    itemSpacing: direction === "horizontal" ? 24 : 8,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  for (const link of links) {
    navNode.children.push(createDefaultNode(ctx.nextId, {
      name: link,
      type: "text",
      tag: "a",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "HUG",
      layoutSizingVertical: "HUG",
      textContent: link,
      fontSize: getToken(DESIGN_TOKENS.fontSize.nav, ctx.breakpoint),
      fontWeight: DESIGN_TOKENS.fontWeight.nav,
      fontFamily: ctx.font,
      textColor: ctx.colors.text,
    }));
  }

  return navNode;
}

function convertLogo(element, ctx) {
  const size = element.size || "md";
  const dims = DESIGN_TOKENS.logo[size];
  return createDefaultNode(ctx.nextId, {
    name: "Logo",
    type: "placeholder",
    tag: "div",
    width: dims.width,
    height: dims.height,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    isPlaceholder: true,
    borderRadius: 4,
    backgroundColor: ctx.colors.secondary || ctx.colors.surface,
    fills: [solidFill(ctx.colors.secondary || ctx.colors.surface)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
}

function convertDivider(ctx) {
  return createDefaultNode(ctx.nextId, {
    name: "Divider",
    type: "frame",
    tag: "hr",
    height: 1,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "FIXED",
    backgroundColor: ctx.colors.secondary,
    fills: [solidFill(ctx.colors.secondary)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
}

function convertBadge(element, ctx) {
  const variantMap = {
    accent: ctx.colors.accent,
    surface: ctx.colors.surface,
    secondary: ctx.colors.secondary,
  };
  const bgColor = variantMap[element.variant] || ctx.colors.accent;

  return createDefaultNode(ctx.nextId, {
    name: element.text || "Badge",
    type: "frame",
    tag: "span",
    layoutMode: "HORIZONTAL",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    justifyContent: "center",
    alignItems: "center",
    padding: { top: 4, right: 12, bottom: 4, left: 12 },
    borderRadius: 100,
    backgroundColor: bgColor,
    fills: [solidFill(bgColor)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children: [
      createDefaultNode(ctx.nextId, {
        name: element.text || "Badge Text",
        type: "text",
        tag: "span",
        width: 0,
        height: 0,
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "HUG",
        textContent: element.text || "",
        fontSize: getToken(DESIGN_TOKENS.fontSize.badge, ctx.breakpoint),
        fontWeight: DESIGN_TOKENS.fontWeight.badge,
        fontFamily: ctx.font,
        textColor: ctx.colors.text,
      }),
    ],
  });
}

function convertList(element, ctx) {
  const items = element.items || [];
  const style = element.style || "bullet";

  const listNode = createDefaultNode(ctx.nextId, {
    name: "List",
    type: "frame",
    tag: style === "numbered" ? "ol" : "ul",
    layoutMode: "VERTICAL",
    itemSpacing: 8,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  const prefixMap = {
    bullet: "\u2022 ",
    numbered: null, // handled with index
    check: "\u2713 ",
    none: "",
  };

  items.forEach((item, i) => {
    const prefix = style === "numbered" ? `${i + 1}. ` : (prefixMap[style] || "");
    listNode.children.push(createDefaultNode(ctx.nextId, {
      name: (item || "Item").substring(0, 30),
      type: "text",
      tag: "li",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: prefix + (item || ""),
      fontSize: getToken(DESIGN_TOKENS.fontSize.paragraph, ctx.breakpoint),
      fontWeight: DESIGN_TOKENS.fontWeight.paragraph,
      fontFamily: ctx.font,
      textColor: ctx.colors.text,
      listStyleType: style,
    }));
  });

  return listNode;
}

function convertAvatar(element, ctx) {
  const size = element.size || "md";
  const dim = DESIGN_TOKENS.avatar[size];
  return createDefaultNode(ctx.nextId, {
    name: "Avatar",
    type: "placeholder",
    tag: "div",
    width: dim,
    height: dim,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    isPlaceholder: true,
    borderRadius: dim / 2,
    backgroundColor: ctx.colors.secondary || ctx.colors.surface,
    fills: [solidFill(ctx.colors.secondary || ctx.colors.surface)],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
}

function convertStat(element, ctx) {
  const statNode = createDefaultNode(ctx.nextId, {
    name: "Stat",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 4,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    alignItems: "center",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  // Value
  statNode.children.push(createDefaultNode(ctx.nextId, {
    name: element.value || "0",
    type: "text",
    tag: "span",
    width: 0,
    height: 0,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textContent: element.value || "0",
    fontSize: getToken(DESIGN_TOKENS.fontSize.stat_value, ctx.breakpoint),
    fontWeight: 700,
    fontFamily: ctx.font,
    textAlign: "center",
    textColor: ctx.colors.text,
  }));

  // Label
  statNode.children.push(createDefaultNode(ctx.nextId, {
    name: element.label || "Label",
    type: "text",
    tag: "span",
    width: 0,
    height: 0,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textContent: element.label || "",
    fontSize: getToken(DESIGN_TOKENS.fontSize.stat_label, ctx.breakpoint),
    fontWeight: 400,
    fontFamily: ctx.font,
    textAlign: "center",
    textColor: ctx.colors.secondary || ctx.colors.text,
  }));

  return statNode;
}

function convertGrid(element, ctx) {
  const columns = element.columns || 3;
  const gap = element.gap || 24;
  const items = element.items || [];
  const isMobile = ctx.breakpoint === "mobile";

  const gridNode = createDefaultNode(ctx.nextId, {
    name: `${columns}-Column Grid`,
    type: "frame",
    tag: "div",
    layoutMode: isMobile ? "VERTICAL" : "HORIZONTAL",
    itemSpacing: isMobile ? 16 : gap,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  for (const item of items) {
    const node = convertElement(item, ctx);
    if (node) {
      if (!isMobile) {
        node.layoutGrow = 1;
        node.layoutSizingHorizontal = "FILL";
      }
      gridNode.children.push(node);
    }
  }

  return gridNode;
}

function convertAccordion(element, ctx) {
  const items = element.items || [];

  const accordionNode = createDefaultNode(ctx.nextId, {
    name: "Accordion",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  for (const item of items) {
    // Each accordion item = frame with question + answer
    const itemNode = createDefaultNode(ctx.nextId, {
      name: (item.question || "Accordion Item").substring(0, 30),
      type: "frame",
      tag: "div",
      layoutMode: "VERTICAL",
      itemSpacing: 8,
      padding: { top: 16, right: 0, bottom: 16, left: 0 },
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      borderColor: ctx.colors.secondary,
      borderWidth: 1,
      strokes: [{
        color: hexToFigmaColor(ctx.colors.secondary),
        weight: 1,
        position: "INSIDE",
        style: "SOLID",
        sides: { top: false, right: false, bottom: true, left: false },
      }],
      textColor: ctx.colors.text,
      fontFamily: ctx.font,
    });

    // Question
    itemNode.children.push(createDefaultNode(ctx.nextId, {
      name: (item.question || "Question").substring(0, 30),
      type: "text",
      tag: "h4",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: item.question || "",
      fontSize: getToken(DESIGN_TOKENS.fontSize.h4, ctx.breakpoint),
      fontWeight: DESIGN_TOKENS.fontWeight.h4,
      fontFamily: ctx.font,
      textColor: ctx.colors.text,
    }));

    // Answer
    itemNode.children.push(createDefaultNode(ctx.nextId, {
      name: (item.answer || "Answer").substring(0, 30),
      type: "text",
      tag: "p",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: item.answer || "",
      fontSize: getToken(DESIGN_TOKENS.fontSize.paragraph, ctx.breakpoint),
      fontWeight: DESIGN_TOKENS.fontWeight.paragraph,
      fontFamily: ctx.font,
      textColor: ctx.colors.text,
    }));

    accordionNode.children.push(itemNode);
  }

  return accordionNode;
}

// ============================================================================
// Absolute Positioning Converter
// ============================================================================

/**
 * Convert absolute AI JSON to a WireframeNode tree
 * Root frame uses layoutMode: "NONE" with children positioned by x/y
 * @param {object} absoluteJSON - AI output { pageWidth, pageHeight, elements[] }
 * @param {number} viewportWidth
 * @param {object} pluginColors - { text, background, secondary, surface, accent }
 * @param {string} pluginFont
 * @returns {object} WireframeNode root (body)
 */
function convertAbsoluteToWireframeTree(absoluteJSON, viewportWidth, pluginColors, pluginFont) {
  const breakpoint = getBreakpoint(viewportWidth);
  const nextId = createIdGenerator();

  const ctx = {
    viewportWidth,
    breakpoint,
    colors: pluginColors,
    font: pluginFont,
    nextId,
  };

  const rootNode = createDefaultNode(nextId, {
    name: "Body",
    type: "frame",
    tag: "body",
    width: absoluteJSON.pageWidth || viewportWidth,
    height: absoluteJSON.pageHeight || 0,
    layoutMode: "NONE",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    backgroundColor: pluginColors.background,
    fills: [solidFill(pluginColors.background)],
    textColor: pluginColors.text,
    fontFamily: pluginFont,
  });

  for (const element of absoluteJSON.elements || []) {
    const childNode = convertAbsoluteElement(element, ctx);
    if (childNode) rootNode.children.push(childNode);
  }

  return rootNode;
}

/**
 * Convert a single element with absolute positioning
 * Reuses existing convertElement() and overrides x/y/width/height
 * @param {object} element - Element with x, y, width, height
 * @param {object} ctx - ConvertContext
 * @returns {object|null} WireframeNode
 */
function convertAbsoluteElement(element, ctx) {
  if (!element || !element.type) return null;

  // section-bg = colored rectangle
  if (element.type === "section-bg") {
    return convertSectionBackground(element, ctx);
  }

  // Use existing element converter
  const node = convertElement(element, ctx);
  if (!node) return null;

  // Override with absolute positioning
  node.x = element.x || 0;
  node.y = element.y || 0;
  node.width = element.width || node.width;
  node.height = element.height || node.height;
  node.layoutSizingHorizontal = "FIXED";
  node.layoutSizingVertical = "FIXED";

  return node;
}

/**
 * Convert section-bg element to a colored rectangle
 * @param {object} element - { type: "section-bg", name, x, y, width, height, background }
 * @param {object} ctx - ConvertContext
 * @returns {object} WireframeNode
 */
function convertSectionBackground(element, ctx) {
  const bgColor = resolveBackgroundColor(element.background, ctx.colors);

  return createDefaultNode(ctx.nextId, {
    name: element.name || "Section Background",
    type: "frame",
    tag: "section",
    x: element.x || 0,
    y: element.y || 0,
    width: element.width || ctx.viewportWidth,
    height: element.height || 0,
    layoutMode: "NONE",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    backgroundColor: bgColor,
    fills: bgColor ? [solidFill(bgColor)] : [],
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  convertToWireframeTree,
  convertAbsoluteToWireframeTree,
  // Exported for testing
  hexToFigmaColor,
  solidFill,
  resolveBackgroundColor,
  createDefaultNode,
  createIdGenerator,
  convertElement,
  convertAbsoluteElement,
  convertSectionBackground,
  convertSection,
  convertCenterStacked,
  convertTwoColumn,
  convertColumnGrid,
  convertSidebarLayout,
};
