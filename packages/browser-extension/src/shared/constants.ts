/**
 * Extension-local constants — intentionally NOT in @w2w/shared.
 *
 * STORAGE_KEYS, DEFAULT_SETTINGS, API_ENDPOINTS, API_URL are chrome.storage
 * and runtime-config shapes that exist only inside the extension. They
 * must not be imported by @w2w/api or the figma-plugin.
 */

// API Endpoints — production default. For local development, override the
// backend URL via the extension's Options page (settings.backendUrl).
export const API_URL = "https://api.web2wireframe.design";
export const API_ENDPOINTS = {
  IMPORT_CDP: `${API_URL}/api/import-cdp`,
  IMPORT_URL: `${API_URL}/api/import-url`,
} as const;

// Storage Keys
//
// SESSION is separate from SETTINGS so logout can wipe auth state without
// touching user prefs (backendUrl, capture toggles, etc.). Owned by
// shared/session.ts — the only module allowed to read/write this key.
export const STORAGE_KEYS = {
  SETTINGS: "w2w_extension_settings",
  LAST_CAPTURE: "w2w_last_capture",
  SESSION: "w2w_extension_session",
} as const;

// Default Settings
export const DEFAULT_SETTINGS = {
  backendUrl: API_URL,
  autoCapture: false,
  captureAssets: true,
  captureFonts: true,
  compressData: true,
  defaultViewport: 1440,
  pairingCode: "",
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
