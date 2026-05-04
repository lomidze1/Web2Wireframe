// Wireframe Converter: Simplified JSON (AI output) -> WireframeNode tree
// Output must match Plugin_Frontend/src/types/index.ts WireframeNode interface

import { DESIGN_TOKENS, getBreakpoint, getToken } from "./designTokens.js";

// ============================================================================
// Type definitions
// ============================================================================

type Breakpoint = "desktop" | "tablet" | "mobile";

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SolidFill {
  type: "SOLID";
  visible: boolean;
  opacity: number;
  color: FigmaColor;
}

export interface StrokeSides {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface Stroke {
  color: FigmaColor;
  weight: number;
  position: "INSIDE" | "OUTSIDE" | "CENTER";
  style: "SOLID" | "DASHED";
  sides?: StrokeSides;
}

export interface ShadowEffect {
  type: "DROP_SHADOW";
  visible: boolean;
  color: FigmaColor;
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type LayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL";
type LayoutSizing = "FIXED" | "HUG" | "FILL";
type JustifyContent = "center" | "flex-start" | "flex-end" | "space-between" | "space-around";
type AlignItems = "center" | "flex-start" | "flex-end" | "stretch";
type TextAlign = "left" | "center" | "right" | "justify";

export interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode: LayoutMode;
  itemSpacing: number;
  padding: Padding;
  layoutSizingHorizontal: LayoutSizing;
  layoutSizingVertical: LayoutSizing;
  backgroundColor: string | null;
  backgroundGradient: string | null;
  fills: SolidFill[];
  strokes: Stroke[];
  effects: ShadowEffect[];
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number;
  opacity: number;
  textContent: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: TextAlign;
  letterSpacing: number;
  isPlaceholder: boolean;
  children: WireframeNode[];
  // Optional layout properties
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  layoutGrow?: number;
  flexWrap?: "wrap";
  listStyleType?: string;
}

export interface PluginColors {
  text: string;
  background: string;
  secondary: string;
  surface: string;
  accent: string;
  [key: string]: string;
}

export interface ConvertContext {
  viewportWidth: number;
  breakpoint: Breakpoint;
  colors: PluginColors;
  font: string;
  nextId: () => string;
}

// --- Simplified input types (AI output) ---

type BackgroundRole = "background" | "surface" | "accent" | "transparent";

type ElementType =
  | "heading"
  | "subheading"
  | "paragraph"
  | "button"
  | "button-group"
  | "image"
  | "icon"
  | "card"
  | "input"
  | "nav-links"
  | "logo"
  | "divider"
  | "badge"
  | "list"
  | "avatar"
  | "stat"
  | "grid"
  | "accordion"
  | "section-bg";

type ButtonSize = "sm" | "md" | "lg";
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ImageWidth = "full" | "half" | "third" | "quarter";
type IconSize = "sm" | "md" | "lg";
type AvatarSize = "sm" | "md" | "lg";
type LogoSize = "sm" | "md" | "lg";
type ListStyle = "bullet" | "numbered" | "check" | "none";

export interface SimplifiedElement {
  type: ElementType;
  // Common
  column?: "left" | "right" | "sidebar";
  // Heading
  level?: number;
  text?: string;
  align?: TextAlign;
  // Button
  size?: ButtonSize | IconSize | AvatarSize | LogoSize;
  variant?: ButtonVariant | "accent" | "surface" | "secondary";
  // Button group
  direction?: "horizontal" | "vertical";
  buttons?: SimplifiedElement[];
  // Image
  width?: number | ImageWidth;
  aspectRatio?: string;
  rounded?: boolean;
  // Paragraph
  maxWidth?: number;
  // Card
  background?: BackgroundRole;
  padding?: number | Padding;
  shadow?: boolean;
  elements?: SimplifiedElement[];
  // Input
  label?: string;
  placeholder?: string;
  inputType?: "text" | "textarea";
  // Nav links
  links?: string[];
  // List
  items?: (string | AccordionItem | SimplifiedElement)[];
  style?: ListStyle;
  // Stat
  value?: string;
  // Grid
  columns?: number;
  gap?: number;
  // Accordion (items handled via AccordionItem)
  // Absolute positioning
  x?: number;
  y?: number;
  height?: number;
  name?: string;
}

export interface AccordionItem {
  question: string;
  answer: string;
}

export interface AbsoluteJSON {
  pageWidth?: number;
  pageHeight?: number;
  elements?: SimplifiedElement[];
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Convert hex color to FigmaColor { r, g, b, a }
 */
export function hexToFigmaColor(hex: string | null | undefined): FigmaColor {
  if (!hex || hex === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b, a: 1 };
}

/**
 * Create a SOLID fill object
 */
export function solidFill(hexColor: string): SolidFill {
  return {
    type: "SOLID",
    visible: true,
    opacity: 1,
    color: hexToFigmaColor(hexColor),
  };
}

/**
 * Resolve a background role name to an actual hex color
 */
export function resolveBackgroundColor(role: string | undefined, colors: PluginColors): string | null {
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

export function createIdGenerator(): () => string {
  let counter = 0;
  return function nextId(): string {
    return `ai-node-${++counter}`;
  };
}

// ============================================================================
// Default node factory
// ============================================================================

/**
 * Create a WireframeNode with all required fields defaulted
 */
export function createDefaultNode(nextId: () => string, overrides: Partial<WireframeNode> = {}): WireframeNode {
  const node: WireframeNode = {
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

  // Coerce numeric fields -- AI may return strings like "800" instead of 800
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
// Element dispatcher
// ============================================================================

export function convertElement(element: SimplifiedElement, ctx: ConvertContext): WireframeNode | null {
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

function convertHeading(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const level = element.level || 2;
  const key = `h${level}`;
  const fontSizeTokens = DESIGN_TOKENS.fontSize as Record<string, { desktop: number; tablet: number; mobile: number } | Record<string, number>>;
  const tokenVal = fontSizeTokens[key];
  const fontSize = tokenVal && "desktop" in tokenVal
    ? getToken(tokenVal as { desktop: number; tablet: number; mobile: number }, ctx.breakpoint)
    : typeof tokenVal === "number" ? tokenVal : 16;
  return createDefaultNode(ctx.nextId, {
    name: (element.text || "Heading").substring(0, 30),
    type: "text",
    tag: `h${level}`,
    width: 0,
    height: 0,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textContent: element.text || "",
    fontSize,
    fontWeight: DESIGN_TOKENS.fontWeight[key] || 700,
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: -0.5,
    textColor: ctx.colors.text,
  });
}

function convertSubheading(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
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

function convertParagraph(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
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

function convertButton(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const size = (element.size || "md") as ButtonSize;
  const variant = (element.variant || "primary") as ButtonVariant;
  const tokens = DESIGN_TOKENS.button[size];

  let bgColor: string;
  let textColor: string;
  let borderColor: string | null;
  let borderWidth: number;

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

  const btnStrokes: Stroke[] = borderColor
    ? [{ color: hexToFigmaColor(borderColor), weight: borderWidth, position: "INSIDE", style: "SOLID" }]
    : [];

  const buttonFontSize = DESIGN_TOKENS.fontSize.button as Record<string, number>;

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
    fontSize: buttonFontSize[size],
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
        fontSize: buttonFontSize[size],
        fontWeight: DESIGN_TOKENS.fontWeight.button,
        fontFamily: ctx.font,
        textAlign: "center",
        textColor,
      }),
    ],
  });
}

function convertButtonGroup(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
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

function convertImage(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const widthMap: Record<string, number> = {
    full: ctx.viewportWidth,
    half: Math.round(ctx.viewportWidth * 0.48),
    third: Math.round(ctx.viewportWidth * 0.31),
    quarter: Math.round(ctx.viewportWidth * 0.23),
  };
  const width = typeof element.width === "number"
    ? element.width
    : (widthMap[element.width as string] || ctx.viewportWidth);
  const ratio = DESIGN_TOKENS.imagePlaceholder.aspectRatios[element.aspectRatio || "16:9"] || 0.5625;
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

function convertIcon(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const size = (element.size || "md") as IconSize;
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

function convertCard(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const bgRole = element.background || "surface";
  const bgColor = resolveBackgroundColor(bgRole, ctx.colors);
  const padding = element.padding != null ? element.padding : DESIGN_TOKENS.card.padding;
  const padObj: Padding = typeof padding === "number"
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding as Padding;

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

function convertInput(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
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

function convertNavLinks(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
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

function convertLogo(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const size = (element.size || "md") as LogoSize;
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

function convertDivider(ctx: ConvertContext): WireframeNode {
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

function convertBadge(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const variantMap: Record<string, string> = {
    accent: ctx.colors.accent,
    surface: ctx.colors.surface,
    secondary: ctx.colors.secondary,
  };
  const bgColor = variantMap[element.variant as string] || ctx.colors.accent;

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

function convertList(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const items = (element.items || []) as string[];
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

  const prefixMap: Record<string, string | null> = {
    bullet: "\u2022 ",
    numbered: null, // handled with index
    check: "\u2713 ",
    none: "",
  };

  items.forEach((item: string, i: number) => {
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

function convertAvatar(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const size = (element.size || "md") as AvatarSize;
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

function convertStat(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
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

function convertGrid(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const columns = element.columns || 3;
  const gap = element.gap || 24;
  const items = (element.items || []) as SimplifiedElement[];
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

function convertAccordion(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const items = (element.items || []) as AccordionItem[];

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
 */
export function convertAbsoluteToWireframeTree(
  absoluteJSON: AbsoluteJSON,
  viewportWidth: number,
  pluginColors: PluginColors,
  pluginFont: string,
): WireframeNode {
  const breakpoint = getBreakpoint(viewportWidth);
  const nextId = createIdGenerator();

  const ctx: ConvertContext = {
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
 */
export function convertAbsoluteElement(element: SimplifiedElement, ctx: ConvertContext): WireframeNode | null {
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
  node.width = element.width as number || node.width;
  node.height = element.height || node.height;
  node.layoutSizingHorizontal = "FIXED";
  node.layoutSizingVertical = "FIXED";

  return node;
}

/**
 * Convert section-bg element to a colored rectangle
 */
export function convertSectionBackground(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const bgColor = resolveBackgroundColor(element.background, ctx.colors);

  return createDefaultNode(ctx.nextId, {
    name: element.name || "Section Background",
    type: "frame",
    tag: "section",
    x: element.x || 0,
    y: element.y || 0,
    width: (element.width as number) || ctx.viewportWidth,
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
