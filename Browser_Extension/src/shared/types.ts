/**
 * CDP Captured Data Types
 * These types represent the data structure captured from websites using Chrome DevTools Protocol
 */

// CDP DOM Node representation
export interface CDPNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue?: string;
  childNodeCount?: number;
  children?: CDPNode[];
  attributes?: string[];
  documentURL?: string;
  baseURL?: string;
  publicId?: string;
  systemId?: string;
  internalSubset?: string;
  xmlVersion?: string;
  name?: string;
  value?: string;
  pseudoType?: string;
  shadowRootType?: string;
  frameId?: string;
  contentDocument?: CDPNode;
  shadowRoots?: CDPNode[];
  templateContent?: CDPNode;
  pseudoElements?: CDPNode[];
  importedDocument?: CDPNode;
  distributedNodes?: CDPNode[];
  isSVG?: boolean;
}

// CSS Rule from CDP
export interface CDPCSSRule {
  styleSheetId?: string;
  selectorList: {
    selectors: Array<{ text: string; range?: object }>;
    text: string;
  };
  origin: "injected" | "user-agent" | "inspector" | "regular";
  style: CDPCSSStyle;
  media?: Array<{ text: string; source: string }>;
}

// CSS Style declaration
export interface CDPCSSStyle {
  cssProperties: CDPCSSProperty[];
  shorthandEntries?: Array<{ name: string; value: string; important?: boolean }>;
  cssText?: string;
  range?: object;
}

// CSS Property
export interface CDPCSSProperty {
  name: string;
  value: string;
  important?: boolean;
  implicit?: boolean;
  text?: string;
  parsedOk?: boolean;
  disabled?: boolean;
  range?: object;
}

// Matched CSS rules for a node
export interface CDPMatchedStyles {
  inlineStyle?: CDPCSSStyle;
  attributesStyle?: CDPCSSStyle;
  matchedCSSRules: Array<{
    rule: CDPCSSRule;
    matchingSelectors: number[];
  }>;
  pseudoElements?: Array<{
    pseudoType: string;
    matches: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  }>;
  inherited?: Array<{
    inlineStyle?: CDPCSSStyle;
    matchedCSSRules: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  }>;
  cssKeyframesRules?: Array<{
    animationName: { text: string };
    keyframes: Array<{ keyText: { text: string }; style: CDPCSSStyle }>;
  }>;
}

// Computed style for a node
export interface CDPComputedStyle {
  name: string;
  value: string;
}

// Font face definition
export interface CDPFontFace {
  fontFamily: string;
  fontStyle: string;
  fontVariant: string;
  fontWeight: string;
  fontStretch: string;
  unicodeRange: string;
  src: string;
  platformFontFamily: string;
}

// Extracted element data (our processed format)
export interface ExtractedElement {
  id: string;
  tag: string;
  name: string;
  // Position & Size
  x: number;
  y: number;
  width: number;
  height: number;
  // Layout
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  // Colors (with original CSS values preserved)
  backgroundColor: string | null;
  backgroundGradient: string | null; // Original gradient string
  textColor: string | null;
  borderColor: string | null;
  // Borders
  borderWidth: number;
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  // Shadow
  boxShadow: string | null;
  // Typography
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
  textAlign: string;
  textContent: string;
  // States
  opacity: number;
  isPlaceholder: boolean;
  // Matched CSS (for advanced processing)
  matchedRules?: CDPCSSRule[];
  // Children
  children: ExtractedElement[];
}

// Full page capture result
export interface CaptureResult {
  url: string;
  title: string;
  timestamp: number;
  viewport: {
    width: number;
    height: number;
  };
  tree: ExtractedElement;
  fonts: ExtractedFont[];
  assets: ExtractedAsset[];
  stylesheets: ExtractedStylesheet[];
}

// Extracted font info
export interface ExtractedFont {
  family: string;
  style: string;
  weight: string;
  src: string;
  format: string;
  isGoogleFont: boolean;
}

// Extracted asset (image, SVG, etc.)
export interface ExtractedAsset {
  type: "image" | "svg" | "video" | "icon";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  base64?: string;
}

// Extracted stylesheet
export interface ExtractedStylesheet {
  url: string;
  content?: string;
  isExternal: boolean;
}

// Extension settings
export interface ExtensionSettings {
  backendUrl: string;
  autoCapture: boolean;
  captureAssets: boolean;
  captureFonts: boolean;
  compressData: boolean;
  defaultViewport: number;
}

// Message types for extension communication
export type ExtensionMessage =
  | { type: "CAPTURE_PAGE"; tabId: number }
  | { type: "CAPTURE_COMPLETE"; data: CaptureResult }
  | { type: "CAPTURE_ERROR"; error: string }
  | { type: "CAPTURE_PROGRESS"; progress: number; status: string }
  | { type: "SEND_TO_BACKEND"; data: CaptureResult }
  | { type: "DOWNLOAD_FILE"; data: CaptureResult; filename: string }
  | { type: "GET_SETTINGS" }
  | { type: "UPDATE_SETTINGS"; settings: Partial<ExtensionSettings> }
  | { type: "GET_CAPTURE_STATUS" };

// Backend API response
export interface BackendResponse {
  success: boolean;
  wireframeData?: object;
  error?: string;
}
