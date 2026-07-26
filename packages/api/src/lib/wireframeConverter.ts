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
  // Estimated rendered line count for text nodes (screenshot absolute mode).
  // The plugin defaults to 1 when absent and routes single-line text through
  // a hug-width acceptance path that lets wrapped paragraphs overflow — so
  // the layout pass annotates anything that wraps.
  browserLineCount?: number;
  // True when the AI supplied this child's own bbox (converted to
  // parent-relative coords) — the layout pass must not re-stack it.
  absolutePositioned?: boolean;
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
  | "search"
  | "tabs"
  | "checkbox"
  | "toggle"
  | "breadcrumb"
  | "select"
  | "table"
  | "pagination"
  | "rating"
  | "carousel"
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
  // Per-element fidelity (screenshot absolute pipeline; all optional).
  // Explicit values win over the role/token defaults; the plugin decides
  // whether per-element COLOR is shown (only in colorMode="website").
  color?: string;      // text color, #RRGGBB
  fillColor?: string;  // container background, #RRGGBB
  fontSize?: number;   // px (8–200)
  fontWeight?: number; // 100–900
  // New element types (Phase 2)
  tabs?: string[];       // tabs
  activeIndex?: number;  // tabs / pagination active item
  checked?: boolean;     // checkbox
  on?: boolean;          // toggle
  headers?: string[];    // table column headers
  rows?: string[][];     // table body rows
  pages?: number;        // pagination page count
  rating?: number;       // rating filled count
  max?: number;          // rating max
  // Absolute positioning
  x?: number;
  y?: number;
  height?: number;
  name?: string;
}

// The AI prompt schema documents accordion items as {title, content}; the
// legacy {question, answer} shape is kept as a fallback for older payloads.
export interface AccordionItem {
  title?: string;
  content?: string;
  question?: string;
  answer?: string;
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

// ---------------------------------------------------------------------------
// Per-element fidelity resolvers (screenshot absolute pipeline)
// Explicit AI-provided values win over the role/token fallback; invalid or
// out-of-range values are ignored so a hallucinated value never renders.
// ---------------------------------------------------------------------------

const HEX6_RE = /^#[0-9A-Fa-f]{6}$/;

/** True only for a strict 6-digit hex string like "#0A1B2C". */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX6_RE.test(value);
}

/** Explicit per-element text color, else the caller's fallback. */
export function resolveTextColor(element: SimplifiedElement, fallback: string): string {
  return isHexColor(element.color) ? element.color : fallback;
}

/** Explicit per-element fill color, else the role-derived fallback. */
export function resolveFillColor(element: SimplifiedElement, roleFallback: string | null): string | null {
  return isHexColor(element.fillColor) ? element.fillColor : roleFallback;
}

/** Explicit font size in [8,200], else the token fallback. */
export function resolveFontSize(element: SimplifiedElement, fallback: number): number {
  const v = Number(element.fontSize);
  return Number.isFinite(v) && v >= 8 && v <= 200 ? v : fallback;
}

/** Explicit font weight in [100,900], else the token fallback. */
export function resolveFontWeight(element: SimplifiedElement, fallback: number): number {
  const v = Number(element.fontWeight);
  return Number.isFinite(v) && v >= 100 && v <= 900 ? v : fallback;
}

/**
 * Copy an AI-provided child bbox (page coordinates) onto the converted node
 * as parent-relative geometry. No-op when the child has no full bbox — the
 * absolute layout pass will stack it instead.
 */
function applyChildBBox(node: WireframeNode, child: SimplifiedElement, parent: SimplifiedElement): void {
  if (typeof child.x !== "number" || typeof child.y !== "number") return;
  if (!(Number(child.width) > 0) || !(Number(child.height) > 0)) return;
  node.x = Math.max(0, Math.round(child.x - (Number(parent.x) || 0)));
  node.y = Math.max(0, Math.round(child.y - (Number(parent.y) || 0)));
  node.width = Math.round(Number(child.width));
  node.height = Math.round(Number(child.height));
  node.layoutSizingHorizontal = "FIXED";
  node.layoutSizingVertical = "FIXED";
  node.layoutGrow = 0;
  node.absolutePositioned = true;
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
    case "search": return convertSearch(element, ctx);
    case "tabs": return convertTabs(element, ctx);
    case "checkbox": return convertCheckbox(element, ctx);
    case "toggle": return convertToggle(element, ctx);
    case "breadcrumb": return convertBreadcrumb(element, ctx);
    case "select": return convertSelect(element, ctx);
    case "table": return convertTable(element, ctx);
    case "pagination": return convertPagination(element, ctx);
    case "rating": return convertRating(element, ctx);
    case "carousel": return convertCarousel(element, ctx);
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
    fontSize: resolveFontSize(element, fontSize),
    fontWeight: resolveFontWeight(element, DESIGN_TOKENS.fontWeight[key] || 700),
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: -0.5,
    textColor: resolveTextColor(element, ctx.colors.text),
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
    fontSize: resolveFontSize(element, getToken(DESIGN_TOKENS.fontSize.subheading, ctx.breakpoint)),
    fontWeight: resolveFontWeight(element, DESIGN_TOKENS.fontWeight.subheading),
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: 0,
    textColor: resolveTextColor(element, ctx.colors.secondary || ctx.colors.text),
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
    fontSize: resolveFontSize(element, getToken(DESIGN_TOKENS.fontSize.paragraph, ctx.breakpoint)),
    fontWeight: resolveFontWeight(element, DESIGN_TOKENS.fontWeight.paragraph),
    fontFamily: ctx.font,
    textAlign: element.align || "left",
    letterSpacing: 0,
    textColor: resolveTextColor(element, ctx.colors.text),
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

  // Per-element fidelity overrides (screenshot): explicit label color / bg / type.
  if (isHexColor(element.fillColor)) bgColor = element.fillColor;
  textColor = resolveTextColor(element, textColor);
  const btnFontSize = resolveFontSize(element, buttonFontSize[size]);
  const btnFontWeight = resolveFontWeight(element, DESIGN_TOKENS.fontWeight.button);

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
    fontSize: btnFontSize,
    fontWeight: btnFontWeight,
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
        fontSize: btnFontSize,
        fontWeight: btnFontWeight,
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
  const bgColor = resolveFillColor(element, resolveBackgroundColor(bgRole, ctx.colors));
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
    if (node) {
      applyChildBBox(node, child, element);
      cardNode.children.push(node);
    }
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
      textColor: resolveTextColor(element, ctx.colors.text),
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
      textColor: resolveTextColor(element, ctx.colors.text),
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
    textColor: resolveTextColor(element, ctx.colors.text),
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
  // The AI prompt schema puts grid children under "elements"; "items" is kept
  // as a fallback for older payloads.
  const items = (element.elements || element.items || []) as SimplifiedElement[];
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
      applyChildBBox(node, item, element);
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
    // Prompt schema uses {title, content}; {question, answer} is the legacy
    // fallback shape.
    const itemTitle = item.title ?? item.question;
    const itemContent = item.content ?? item.answer;
    // Each accordion item = frame with question + answer
    const itemNode = createDefaultNode(ctx.nextId, {
      name: (itemTitle || "Accordion Item").substring(0, 30),
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
      name: (itemTitle || "Question").substring(0, 30),
      type: "text",
      tag: "h4",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: itemTitle || "",
      fontSize: getToken(DESIGN_TOKENS.fontSize.h4, ctx.breakpoint),
      fontWeight: DESIGN_TOKENS.fontWeight.h4,
      fontFamily: ctx.font,
      textColor: ctx.colors.text,
    }));

    // Answer
    itemNode.children.push(createDefaultNode(ctx.nextId, {
      name: (itemContent || "Answer").substring(0, 30),
      type: "text",
      tag: "p",
      width: 0,
      height: 0,
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      textContent: itemContent || "",
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
// ============================================================================
// Phase 2 — additional element types (each composed from primitive nodes only:
// frame / text / placeholder → zero plugin changes required)
// ============================================================================

/** Small text-node helper for composite converters below. */
function textNode(ctx: ConvertContext, content: string, color: string, sizing: LayoutSizing = "HUG"): WireframeNode {
  return createDefaultNode(ctx.nextId, {
    name: (content || "Text").substring(0, 30),
    type: "text",
    tag: "span",
    layoutSizingHorizontal: sizing,
    layoutSizingVertical: "HUG",
    textContent: content,
    fontSize: getToken(DESIGN_TOKENS.fontSize.paragraph, ctx.breakpoint),
    fontWeight: DESIGN_TOKENS.fontWeight.paragraph,
    fontFamily: ctx.font,
    textColor: color,
  });
}

function convertSearch(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  return createDefaultNode(ctx.nextId, {
    name: "Search",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    alignItems: "center",
    padding: { top: 10, right: 14, bottom: 10, left: 14 },
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    borderRadius: 8,
    backgroundColor: ctx.colors.surface,
    fills: [solidFill(ctx.colors.surface)],
    borderColor: ctx.colors.secondary,
    borderWidth: 1,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children: [
      createDefaultNode(ctx.nextId, {
        name: "Search Icon",
        type: "placeholder",
        tag: "span",
        width: 16,
        height: 16,
        isPlaceholder: true,
        borderRadius: 8,
        backgroundColor: ctx.colors.secondary,
        fills: [solidFill(ctx.colors.secondary)],
      }),
      textNode(ctx, element.placeholder || "Search…", ctx.colors.secondary || ctx.colors.text, "FILL"),
    ],
  });
}

function convertTabs(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const tabs = element.tabs || [];
  const activeIndex = Number(element.activeIndex) || 0;

  const row = createDefaultNode(ctx.nextId, {
    name: "Tabs Row",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    itemSpacing: 24,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  tabs.forEach((t, i) => {
    const active = i === activeIndex;
    row.children.push(createDefaultNode(ctx.nextId, {
      name: t,
      type: "text",
      tag: "span",
      layoutSizingHorizontal: "HUG",
      layoutSizingVertical: "HUG",
      textContent: t,
      fontSize: getToken(DESIGN_TOKENS.fontSize.nav, ctx.breakpoint),
      fontWeight: active ? 700 : 400,
      fontFamily: ctx.font,
      textColor: active ? ctx.colors.accent : ctx.colors.text,
    }));
  });

  const divider = createDefaultNode(ctx.nextId, {
    name: "Tabs Divider",
    type: "frame",
    tag: "hr",
    height: 1,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "FIXED",
    backgroundColor: ctx.colors.secondary,
    fills: [solidFill(ctx.colors.secondary)],
  });

  return createDefaultNode(ctx.nextId, {
    name: "Tabs",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 8,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children: [row, divider],
  });
}

function convertCheckbox(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const box = createDefaultNode(ctx.nextId, {
    name: "Checkbox",
    type: "frame",
    tag: "span",
    width: 18,
    height: 18,
    borderRadius: 4,
    borderColor: ctx.colors.secondary,
    borderWidth: 2,
    backgroundColor: element.checked ? ctx.colors.accent : null,
    fills: element.checked ? [solidFill(ctx.colors.accent)] : [],
  });
  const children: WireframeNode[] = [box];
  if (element.label) children.push(textNode(ctx, element.label, ctx.colors.text));

  return createDefaultNode(ctx.nextId, {
    name: "Checkbox Field",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    alignItems: "center",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children,
  });
}

function convertToggle(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const trackColor = element.on ? ctx.colors.accent : ctx.colors.secondary;
  const pill = createDefaultNode(ctx.nextId, {
    name: "Toggle",
    type: "frame",
    tag: "span",
    width: 40,
    height: 22,
    layoutMode: "HORIZONTAL",
    justifyContent: element.on ? "flex-end" : "flex-start",
    alignItems: "center",
    padding: { top: 2, right: 2, bottom: 2, left: 2 },
    borderRadius: 100,
    backgroundColor: trackColor,
    fills: [solidFill(trackColor)],
    children: [
      createDefaultNode(ctx.nextId, {
        name: "Knob",
        type: "frame",
        tag: "span",
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: ctx.colors.background,
        fills: [solidFill(ctx.colors.background)],
      }),
    ],
  });
  const children: WireframeNode[] = [pill];
  if (element.label) children.push(textNode(ctx, element.label, ctx.colors.text));

  return createDefaultNode(ctx.nextId, {
    name: "Toggle Field",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    alignItems: "center",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children,
  });
}

function convertBreadcrumb(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const items = ((element.items as string[]) || element.links || []) as string[];
  const wrap = createDefaultNode(ctx.nextId, {
    name: "Breadcrumb",
    type: "frame",
    tag: "nav",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    alignItems: "center",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  items.forEach((item, i) => {
    wrap.children.push(textNode(ctx, String(item), ctx.colors.text));
    if (i < items.length - 1) wrap.children.push(textNode(ctx, "/", ctx.colors.secondary || ctx.colors.text));
  });
  return wrap;
}

function convertSelect(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const box = createDefaultNode(ctx.nextId, {
    name: element.label || "Select",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    justifyContent: "space-between",
    alignItems: "center",
    padding: { top: 10, right: 14, bottom: 10, left: 14 },
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    borderRadius: 8,
    backgroundColor: ctx.colors.surface,
    fills: [solidFill(ctx.colors.surface)],
    borderColor: ctx.colors.secondary,
    borderWidth: 1,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children: [
      textNode(ctx, element.placeholder || "Select…", ctx.colors.secondary || ctx.colors.text, "FILL"),
      createDefaultNode(ctx.nextId, {
        name: "Chevron",
        type: "placeholder",
        tag: "span",
        width: 12,
        height: 12,
        isPlaceholder: true,
        backgroundColor: ctx.colors.secondary,
        fills: [solidFill(ctx.colors.secondary)],
      }),
    ],
  });

  if (!element.label) return box;

  return createDefaultNode(ctx.nextId, {
    name: "Select Field",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 6,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children: [textNode(ctx, element.label, ctx.colors.text, "FILL"), box],
  });
}

function convertTable(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const headers = (element.headers as string[]) || [];
  const rows = (element.rows as string[][]) || [];

  const outer = createDefaultNode(ctx.nextId, {
    name: "Table",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    borderColor: ctx.colors.secondary,
    borderWidth: 1,
    borderRadius: 6,
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });

  const makeRow = (cells: string[], header: boolean): WireframeNode => {
    const row = createDefaultNode(ctx.nextId, {
      name: header ? "Header Row" : "Row",
      type: "frame",
      tag: "div",
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      padding: { top: 10, right: 12, bottom: 10, left: 12 },
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      backgroundColor: header ? ctx.colors.surface : null,
      fills: header ? [solidFill(ctx.colors.surface)] : [],
      textColor: ctx.colors.text,
      fontFamily: ctx.font,
    });
    cells.forEach((cell) => {
      const cellNode = textNode(ctx, String(cell), ctx.colors.text, "FILL");
      cellNode.tag = header ? "th" : "td";
      if (header) cellNode.fontWeight = 700;
      row.children.push(cellNode);
    });
    return row;
  };

  if (headers.length) outer.children.push(makeRow(headers, true));
  rows.forEach((r) => outer.children.push(makeRow(r, false)));
  return outer;
}

function convertPagination(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const pages = Math.max(1, Math.min(20, Number(element.pages) || 3));
  const active = Number(element.activeIndex) || 0;

  const wrap = createDefaultNode(ctx.nextId, {
    name: "Pagination",
    type: "frame",
    tag: "nav",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (let i = 0; i < pages; i++) {
    const isActive = i === active;
    wrap.children.push(createDefaultNode(ctx.nextId, {
      name: `Page ${i + 1}`,
      type: "frame",
      tag: "a",
      width: 32,
      height: 32,
      layoutMode: "HORIZONTAL",
      justifyContent: "center",
      alignItems: "center",
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "FIXED",
      borderRadius: 6,
      borderColor: ctx.colors.secondary,
      borderWidth: isActive ? 0 : 1,
      backgroundColor: isActive ? ctx.colors.accent : null,
      fills: isActive ? [solidFill(ctx.colors.accent)] : [],
      textColor: ctx.colors.text,
      fontFamily: ctx.font,
      children: [textNode(ctx, String(i + 1), ctx.colors.text)],
    }));
  }
  return wrap;
}

function convertRating(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const max = Math.max(1, Math.min(10, Number(element.max) || 5));
  const value = Math.max(0, Math.min(max, Number(element.rating) || 0));

  const wrap = createDefaultNode(ctx.nextId, {
    name: "Rating",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    itemSpacing: 4,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (let i = 0; i < max; i++) {
    const filled = i < value;
    const color = filled ? ctx.colors.accent : ctx.colors.secondary;
    wrap.children.push(createDefaultNode(ctx.nextId, {
      name: filled ? "Star" : "Star Empty",
      type: "placeholder",
      tag: "span",
      width: 18,
      height: 18,
      isPlaceholder: true,
      borderRadius: 3,
      backgroundColor: color,
      fills: [solidFill(color)],
    }));
  }
  return wrap;
}

function convertCarousel(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const h = Number(element.height) || 300;
  const image = createDefaultNode(ctx.nextId, {
    name: "Carousel Image",
    type: "placeholder",
    tag: "div",
    height: Math.max(120, h - 30),
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "FIXED",
    isPlaceholder: true,
    borderRadius: 8,
    backgroundColor: ctx.colors.secondary,
    fills: [solidFill(ctx.colors.secondary)],
  });

  const dots = createDefaultNode(ctx.nextId, {
    name: "Carousel Dots",
    type: "frame",
    tag: "div",
    layoutMode: "HORIZONTAL",
    itemSpacing: 6,
    justifyContent: "center",
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
  });
  for (let i = 0; i < 3; i++) {
    const color = i === 0 ? ctx.colors.accent : ctx.colors.secondary;
    dots.children.push(createDefaultNode(ctx.nextId, {
      name: "Dot",
      type: "placeholder",
      tag: "span",
      width: 8,
      height: 8,
      isPlaceholder: true,
      borderRadius: 4,
      backgroundColor: color,
      fills: [solidFill(color)],
    }));
  }

  return createDefaultNode(ctx.nextId, {
    name: "Carousel",
    type: "frame",
    tag: "div",
    layoutMode: "VERTICAL",
    itemSpacing: 12,
    alignItems: "center",
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    textColor: ctx.colors.text,
    fontFamily: ctx.font,
    children: [image, dots],
  });
}

// ============================================================================
// Absolute-mode layout pass
//
// The plugin renders screenshot imports with layoutMode "absolute", where
// nested auto-layout is DISABLED (plugin nodes.ts shouldUseAutoLayout returns
// false for the whole tree) and every node is drawn at its explicit
// x/y/width/height (0 → clamped to a 1px dot). Composite converters
// (table/card/grid/accordion/button/...) emit children with HUG/FILL sizing
// and no geometry, so without this pass they collapse to 1×1 at (0,0).
//
// This pass assigns real parent-relative geometry to every descendant
// server-side: vertical/horizontal stacking with padding + itemSpacing,
// FILL children share the remaining main-axis space, text gets a coarse
// size estimate (wireframe-grade fidelity is enough). Runs identically for
// every viewport since it executes after per-viewport scaling.
// ============================================================================

const TEXT_AVG_CHAR_W = 0.55; // rough average glyph width as a fraction of fontSize
const TEXT_LINE_HEIGHT = 1.4;

function estimateTextBox(node: WireframeNode, availWidth: number): { width: number; height: number; lines: number } {
  const fontSize = node.fontSize || 16;
  const chars = (node.textContent || "").length || 1;
  const naturalWidth = Math.max(12, chars * fontSize * TEXT_AVG_CHAR_W);
  const width = node.layoutSizingHorizontal === "FILL"
    ? availWidth
    : Math.min(availWidth, naturalWidth);
  const lines = Math.max(1, Math.ceil(naturalWidth / Math.max(width, 1)));
  const height = lines * fontSize * TEXT_LINE_HEIGHT;
  return { width: Math.max(2, Math.round(width)), height: Math.max(2, Math.round(height)), lines };
}

/**
 * Recursively assign explicit geometry to `node` (except its x/y — the caller
 * owns placement) and lay out its children. `availWidth` is the space the
 * parent offers for this node's width when it is FILL/HUG.
 */
function layoutAbsoluteSubtree(node: WireframeNode, availWidth: number): void {
  if (node.type === "text") {
    // Measure against the final width (explicit AI box or the offered space)
    // so the line estimate matches what will actually render.
    const box = estimateTextBox(node, node.width > 0 ? node.width : availWidth);
    if (!(node.width > 0)) node.width = box.width;
    if (!(node.height > 0)) node.height = box.height;
    // Annotate wrapping text — without this the plugin's single-line path
    // renders wrapped paragraphs as one long overflowing line.
    if (box.lines > 1) node.browserLineCount = box.lines;
    node.layoutSizingHorizontal = "FIXED";
    node.layoutSizingVertical = "FIXED";
    return;
  }

  if (node.type === "placeholder") {
    if (!(node.width > 0)) {
      node.width = node.layoutSizingHorizontal === "FILL" ? Math.max(2, availWidth) : 24;
    }
    if (!(node.height > 0)) node.height = 24;
    node.layoutSizingHorizontal = "FIXED";
    node.layoutSizingVertical = "FIXED";
    return;
  }

  // --- frame ---
  const pad = node.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  const children = node.children || [];
  const gap = node.itemSpacing || 0;

  let width = node.width > 0
    ? node.width
    : node.layoutSizingHorizontal === "FILL" ? availWidth : 0; // 0 = HUG, resolved below
  const provisionalWidth = width > 0 ? width : availWidth;
  const innerWidth = Math.max(2, provisionalWidth - pad.left - pad.right);

  if (children.length === 0) {
    node.width = Math.max(1, Math.round(width > 0 ? width : innerWidth));
    if (!(node.height > 0)) node.height = Math.max(2, pad.top + pad.bottom + 8);
    node.layoutSizingHorizontal = "FIXED";
    node.layoutSizingVertical = "FIXED";
    return;
  }

  // AI-positioned children (absolutePositioned) keep their exact boxes — only
  // recurse for their own descendants; geometry-less "flow" children stack.
  const positioned = children.filter((c) => c.absolutePositioned);
  const flow = children.filter((c) => !c.absolutePositioned);
  for (const child of positioned) {
    layoutAbsoluteSubtree(child, child.width);
  }
  const positionedBottom = positioned.length
    ? Math.max(...positioned.map((c) => c.y + c.height))
    : 0;
  const positionedRight = positioned.length
    ? Math.max(...positioned.map((c) => c.x + c.width))
    : 0;

  const gapsTotal = gap * Math.max(0, flow.length - 1);

  if (node.layoutMode === "HORIZONTAL") {
    // Measure non-FILL flow children first, then split the remaining width
    // equally among FILL children (table cells, grid items).
    const fillChildren: WireframeNode[] = [];
    let fixedSum = 0;
    for (const child of flow) {
      const isFill = child.layoutSizingHorizontal === "FILL" || (child.layoutGrow ?? 0) > 0;
      if (isFill) { fillChildren.push(child); continue; }
      layoutAbsoluteSubtree(child, innerWidth);
      fixedSum += child.width;
    }
    if (fillChildren.length > 0) {
      const remaining = Math.max(0, innerWidth - fixedSum - gapsTotal);
      const fillWidth = Math.max(2, Math.floor(remaining / fillChildren.length));
      for (const child of fillChildren) {
        child.layoutSizingHorizontal = "FILL";
        layoutAbsoluteSubtree(child, fillWidth);
        child.width = fillWidth; // exact share regardless of content estimate
      }
    }

    const contentWidth = flow.reduce((sum, c) => sum + c.width, 0) + gapsTotal;
    const contentHeight = flow.reduce((max, c) => Math.max(max, c.height), 0);
    if (!(width > 0)) width = Math.max(contentWidth + pad.left + pad.right, positionedRight + pad.right); // HUG
    const height = node.height > 0
      ? node.height
      : Math.max(contentHeight + pad.top + pad.bottom, positionedBottom + pad.bottom);
    // Justify against the FINAL inner width (hug or explicit) — using the
    // parent-offered width mis-centers content far outside hug frames.
    const finalInnerWidth = Math.max(0, width - pad.left - pad.right);
    const innerHeight = Math.max(0, height - pad.top - pad.bottom);

    // Flow content starts after any positioned children on the main axis.
    let cursorX = positioned.length ? Math.max(pad.left, positionedRight + gap) : pad.left;
    if (node.justifyContent === "center") {
      cursorX += Math.max(0, (finalInnerWidth - contentWidth) / 2);
    } else if (node.justifyContent === "flex-end") {
      cursorX += Math.max(0, finalInnerWidth - contentWidth);
    }
    const extraGap = node.justifyContent === "space-between" && flow.length > 1
      ? Math.max(0, (finalInnerWidth - contentWidth) / (flow.length - 1))
      : 0;

    for (const child of flow) {
      child.x = Math.round(cursorX);
      child.y = Math.round(pad.top + (node.alignItems === "center"
        ? Math.max(0, (innerHeight - child.height) / 2)
        : 0));
      cursorX += child.width + gap + extraGap;
    }

    node.width = Math.max(2, Math.round(width));
    node.height = Math.max(2, Math.round(height));
  } else {
    // VERTICAL — and NONE-frames with children fall back to a vertical stack.
    // Flow content starts below any positioned children.
    let cursorY = positioned.length ? Math.max(pad.top, positionedBottom + gap) : pad.top;
    let maxChildWidth = 0;
    for (const child of flow) {
      layoutAbsoluteSubtree(child, innerWidth);
      child.y = Math.round(cursorY);
      child.x = Math.round(node.alignItems === "center"
        ? pad.left + Math.max(0, (innerWidth - child.width) / 2)
        : pad.left);
      cursorY += child.height + gap;
      maxChildWidth = Math.max(maxChildWidth, child.width);
    }
    const contentHeight = Math.max(
      flow.length > 0 ? cursorY - gap + pad.bottom : pad.top + pad.bottom,
      positionedBottom + pad.bottom,
    );
    if (!(width > 0)) width = Math.max(maxChildWidth + pad.left + pad.right, positionedRight + pad.right); // HUG
    node.width = Math.max(2, Math.round(width));
    node.height = Math.max(2, Math.round(node.height > 0 ? node.height : contentHeight));
  }

  node.layoutSizingHorizontal = "FIXED";
  node.layoutSizingVertical = "FIXED";
}

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

  // Composite elements (table/card/grid/...) carry children without geometry;
  // the plugin's absolute mode disables nested auto-layout, so lay them out
  // here with explicit parent-relative boxes. Also runs on childless text
  // nodes to annotate browserLineCount (the AI box stays untouched).
  layoutAbsoluteSubtree(node, node.width);

  return node;
}

/**
 * Convert section-bg element to a colored rectangle
 */
export function convertSectionBackground(element: SimplifiedElement, ctx: ConvertContext): WireframeNode {
  const bgColor = resolveFillColor(element, resolveBackgroundColor(element.background, ctx.colors));

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
