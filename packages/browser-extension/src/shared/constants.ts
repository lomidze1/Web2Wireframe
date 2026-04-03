/**
 * Extension Constants
 */

// API Endpoints
export const API_URL = "http://localhost:3002";
export const API_ENDPOINTS = {
  IMPORT_CDP: `${API_URL}/api/import-cdp`,
  IMPORT_URL: `${API_URL}/api/import-url`,
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  SETTINGS: "w2w_extension_settings",
  LAST_CAPTURE: "w2w_last_capture",
} as const;

// Default Settings
export const DEFAULT_SETTINGS = {
  backendUrl: API_URL,
  autoCapture: false,
  captureAssets: true,
  captureFonts: true,
  compressData: true,
  defaultViewport: 1440,
} as const;

// Viewports
export const VIEWPORTS = [
  { label: "1920", width: 1920 },
  { label: "1440", width: 1440 },
  { label: "1024", width: 1024 },
  { label: "768", width: 768 },
  { label: "375", width: 375 },
] as const;

// NOTE: Color, Font, Text, Variable options moved to Plugin_Frontend
// (Import-time transformation instead of capture-time)

// Skip these tags during extraction
export const SKIP_TAGS = [
  "script",
  "style",
  "meta",
  "noscript",
  "link",
  "head",
  "title",
  "br",
  "base",
  "template",
] as const;

// Text tags that should extract content
// NOTE: "li" is NOT included - list items are handled as frames with bullet + text children
export const TEXT_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "label",
  "td",
  "th",
  "button",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "mark",
  "sub",
  "sup",
] as const;

// List-related tags that need special handling
export const LIST_ITEM_TAG = "li" as const;
export const LIST_CONTAINER_TAGS = ["ul", "ol"] as const;

// Media tags (become placeholders)
export const MEDIA_TAGS = [
  "img",
  "video",
  "iframe",
  "picture",
  "canvas",
  "svg",
] as const;

// CDP Domains we use
export const CDP_DOMAINS = {
  DOM: "DOM",
  CSS: "CSS",
  PAGE: "Page",
  DOM_SNAPSHOT: "DOMSnapshot",
  NETWORK: "Network",
} as const;
