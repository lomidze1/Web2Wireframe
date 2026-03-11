// AI Wireframe Generator — Claude API integration
// Builds prompts, calls Anthropic API, validates and parses JSON output

const Anthropic = require("@anthropic-ai/sdk");

// ============================================================================
// Anthropic client
// ============================================================================

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_ELEMENT_TYPES = [
  "heading", "subheading", "paragraph", "button", "button-group",
  "image", "icon", "card", "input", "nav-links", "logo", "divider",
  "badge", "list", "avatar", "stat", "grid", "accordion",
];

const VALID_PAGE_TYPES = [
  "home", "about", "pricing", "contact", "blog",
  "login", "register", "faq", "landing", "portfolio",
  "dashboard", "settings", "404",
];

const VALID_BLOCK_TYPES = [
  "hero", "features", "pricing", "faq", "testimonials",
  "team", "contact", "cta", "stats", "footer",
  "header", "newsletter", "gallery", "blog-list",
];

// ============================================================================
// System prompt
// ============================================================================

const WIREFRAME_SYSTEM_PROMPT = `You are a wireframe layout generator for a Figma plugin. You generate structured JSON
that describes wireframe layouts for web pages and UI blocks.

OUTPUT FORMAT:
Return a JSON object with this exact structure:

{
  "totalHeight": <number>,
  "sections": [
    {
      "name": "<Section Name>",
      "sectionType": "<hero|features|pricing|faq|...>",
      "height": <number>,
      "background": "<background|surface|accent|transparent>",
      "layout": "<center-stacked|two-column|three-column-grid|four-column-grid|sidebar-left|sidebar-right>",
      "padding": { "top": <n>, "right": <n>, "bottom": <n>, "left": <n> },
      "gap": <number>,
      "elements": [
        {
          "type": "<heading|subheading|paragraph|button|button-group|image|icon|card|input|nav-links|logo|divider|badge|list|avatar|stat>",
          ... type-specific fields ...
        }
      ]
    }
  ]
}

ELEMENT TYPES AND THEIR FIELDS:

heading:
  { "type": "heading", "text": "...", "level": 1|2|3|4, "align": "left|center|right" }

subheading:
  { "type": "subheading", "text": "...", "align": "left|center|right" }

paragraph:
  { "type": "paragraph", "text": "...", "align": "left|center|right", "maxWidth": <number|null> }

button:
  { "type": "button", "text": "...", "variant": "primary|secondary|outline|ghost", "size": "sm|md|lg" }

button-group:
  { "type": "button-group", "direction": "horizontal|vertical", "buttons": [
    { "text": "...", "variant": "primary|secondary|outline", "size": "sm|md|lg" }
  ]}

image:
  { "type": "image", "width": "full|half|third|quarter|<number>", "aspectRatio": "16:9|4:3|1:1|3:2", "rounded": true|false }

card:
  { "type": "card", "elements": [ ...nested elements... ], "padding": <number>, "rounded": true|false, "shadow": true|false, "background": "surface|background|transparent" }

input:
  { "type": "input", "label": "...", "placeholder": "...", "inputType": "text|email|password|textarea" }

nav-links:
  { "type": "nav-links", "links": ["Home", "About", "Pricing", "Contact"], "direction": "horizontal|vertical" }

logo:
  { "type": "logo", "size": "sm|md|lg" }

divider:
  { "type": "divider" }

badge:
  { "type": "badge", "text": "...", "variant": "accent|surface|secondary" }

list:
  { "type": "list", "items": ["Item 1", "Item 2", ...], "style": "bullet|numbered|check|none" }

avatar:
  { "type": "avatar", "size": "sm|md|lg" }

stat:
  { "type": "stat", "value": "99%", "label": "Uptime" }

icon:
  { "type": "icon", "size": "sm|md|lg" }

LAYOUT RULES:
- "center-stacked": All elements vertically centered, stacked
- "two-column": Split into left/right columns (use nested arrays or specify column assignment)
- "three-column-grid": 3 equal columns, typically for cards/features
- "four-column-grid": 4 equal columns

BACKGROUND COLOR ROLES:
- "background" = page background (light gray)
- "surface" = card/container background (blue-gray)
- "accent" = emphasis background (light blue)
- "transparent" = no background, inherits parent

DENSITY GUIDE:
- "balanced": Essential elements only, generous whitespace, standard spacing
- "detailed": More elements, denser layout, additional sub-elements, less whitespace

VIEWPORT GUIDE:
- 1920px: Extra wide desktop, max-width containers recommended
- 1440px: Standard desktop
- 1024px: Tablet landscape — reduce columns (3→2, 4→2)
- 768px: Tablet portrait — stack columns, reduce padding
- 375px: Mobile — single column, compact spacing, smaller text

IMPORTANT:
- Generate realistic placeholder text (not lorem ipsum unless told otherwise)
- Match the density level exactly
- All heights must be reasonable (a hero section = 500-700px, not 2000px)
- Sections should feel like a real website wireframe
- Only include the requested sections
- Respond ONLY with JSON, no explanation`;

// ============================================================================
// Prompt builder
// ============================================================================

/**
 * Build user prompt for Claude API
 * @param {object} params
 * @param {"page"|"block"} params.type
 * @param {string} [params.pageType]
 * @param {string} [params.blockType]
 * @param {string[]} [params.sections]
 * @param {"balanced"|"detailed"} params.density
 * @param {number} params.viewportWidth
 * @param {string} [params.notes]
 * @returns {string}
 */
function buildUserPrompt({ type, pageType, blockType, sections, density, viewportWidth, notes }) {
  if (type === "page") {
    let prompt = `Generate a wireframe layout for a "${pageType}" page.
Viewport width: ${viewportWidth}px
Density: ${density}`;
    if (sections && sections.length > 0) {
      prompt += `\nSections to include (in order): ${sections.join(", ")}`;
    }
    if (notes) {
      prompt += `\nSpecial requirements: ${notes}`;
    }
    prompt += "\n\nReturn the complete JSON structure.";
    return prompt;
  }

  if (type === "block") {
    let prompt = `Generate a wireframe layout for a single "${blockType}" block/section.
Viewport width: ${viewportWidth}px
Density: ${density}`;
    if (notes) {
      prompt += `\nSpecial requirements: ${notes}`;
    }
    prompt += "\n\nReturn the complete JSON structure with a single section.";
    return prompt;
  }

  throw new Error(`Invalid type: ${type}. Must be "page" or "block".`);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate simplified JSON format from AI output
 * @param {object} json
 * @returns {{ success: boolean, errors: string[] }}
 */
function validateSimplifiedFormat(json) {
  const errors = [];

  if (!json || typeof json !== "object") {
    return { success: false, errors: ["Response is not a valid object"] };
  }

  if (!Array.isArray(json.sections)) {
    return { success: false, errors: ["Missing or invalid 'sections' array"] };
  }

  if (json.sections.length === 0) {
    errors.push("'sections' array is empty");
  }

  for (let i = 0; i < json.sections.length; i++) {
    const section = json.sections[i];
    if (!section.name) {
      errors.push(`Section[${i}]: missing 'name'`);
    }
    if (!Array.isArray(section.elements)) {
      errors.push(`Section[${i}]: missing or invalid 'elements' array`);
    } else {
      for (let j = 0; j < section.elements.length; j++) {
        const el = section.elements[j];
        if (!el.type) {
          errors.push(`Section[${i}].elements[${j}]: missing 'type'`);
        } else if (!VALID_ELEMENT_TYPES.includes(el.type)) {
          errors.push(`Section[${i}].elements[${j}]: unknown type '${el.type}'`);
        }
      }
    }
  }

  if (json.totalHeight != null && (typeof json.totalHeight !== "number" || json.totalHeight <= 0)) {
    errors.push("'totalHeight' must be a positive number");
  }

  return { success: errors.length === 0, errors };
}

// ============================================================================
// JSON parsing from AI response
// ============================================================================

/**
 * Parse JSON from Claude's response text
 * Handles both raw JSON and ```json fenced blocks
 * @param {string} text
 * @returns {object}
 */
function parseJSONFromResponse(text) {
  // Try extracting from ```json code block first
  const fencedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1].trim());
  }
  // Otherwise try parsing the whole text as JSON
  return JSON.parse(text.trim());
}

// ============================================================================
// Core API call
// ============================================================================

/**
 * Call Claude API and return parsed simplified JSON
 * @param {object} params - Same as buildUserPrompt params
 * @returns {Promise<object>} Parsed simplified JSON
 */
async function generateWireframeStructure(params) {
  const client = getClient();
  const model = process.env.AI_MODEL || "claude-sonnet-4-20250514";
  const maxTokens = params.type === "page" ? 8000 : 4000;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: WIREFRAME_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(params),
      },
    ],
  });

  const content = response.content[0].text;
  return parseJSONFromResponse(content);
}

// ============================================================================
// Retry wrapper
// ============================================================================

/**
 * Generate with retry on validation failure or API error
 * @param {object} params - Same as buildUserPrompt params
 * @param {number} [maxRetries=1] - Number of retries (total attempts = 1 + maxRetries)
 * @returns {Promise<object>} Validated simplified JSON
 */
async function generateWithRetry(params, maxRetries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateWireframeStructure(params);
      const validation = validateSimplifiedFormat(result);

      if (validation.success) {
        return result;
      }

      // Validation failed — log and retry
      lastError = new Error(`Validation failed: ${validation.errors.join(", ")}`);
      lastError.validationErrors = validation.errors;
      console.warn(`[AI] Attempt ${attempt + 1} validation failed:`, validation.errors);
    } catch (err) {
      lastError = err;
      console.warn(`[AI] Attempt ${attempt + 1} error:`, err.message);

      // Don't retry on auth errors or invalid API key
      if (err.status === 401 || err.status === 403) {
        throw err;
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Screenshot Analysis — Vision API
// ============================================================================

const SCREENSHOT_SYSTEM_PROMPT = `You are a wireframe layout analyzer for a Figma plugin. You analyze screenshots of websites
and convert them into structured JSON wireframe descriptions.

OUTPUT FORMAT:
Return a JSON object with this exact structure:

{
  "totalHeight": <number>,
  "sections": [
    {
      "name": "<Section Name>",
      "sectionType": "<hero|features|pricing|faq|...>",
      "height": <number>,
      "background": "<background|surface|accent|transparent>",
      "layout": "<center-stacked|two-column|three-column-grid|four-column-grid|sidebar-left|sidebar-right>",
      "padding": { "top": <n>, "right": <n>, "bottom": <n>, "left": <n> },
      "gap": <number>,
      "elements": [
        {
          "type": "<heading|subheading|paragraph|button|button-group|image|icon|card|input|nav-links|logo|divider|badge|list|avatar|stat>",
          ... type-specific fields ...
        }
      ]
    }
  ]
}

ELEMENT TYPES AND THEIR FIELDS:

heading:
  { "type": "heading", "text": "...", "level": 1|2|3|4, "align": "left|center|right" }

subheading:
  { "type": "subheading", "text": "...", "align": "left|center|right" }

paragraph:
  { "type": "paragraph", "text": "...", "align": "left|center|right", "maxWidth": <number|null> }

button:
  { "type": "button", "text": "...", "variant": "primary|secondary|outline|ghost", "size": "sm|md|lg" }

button-group:
  { "type": "button-group", "direction": "horizontal|vertical", "buttons": [
    { "text": "...", "variant": "primary|secondary|outline", "size": "sm|md|lg" }
  ]}

image:
  { "type": "image", "width": "full|half|third|quarter|<number>", "aspectRatio": "16:9|4:3|1:1|3:2", "rounded": true|false }

card:
  { "type": "card", "elements": [ ...nested elements... ], "padding": <number>, "rounded": true|false, "shadow": true|false, "background": "surface|background|transparent" }

input:
  { "type": "input", "label": "...", "placeholder": "...", "inputType": "text|email|password|textarea" }

nav-links:
  { "type": "nav-links", "links": ["Home", "About", "Pricing", "Contact"], "direction": "horizontal|vertical" }

logo:
  { "type": "logo", "size": "sm|md|lg" }

divider:
  { "type": "divider" }

badge:
  { "type": "badge", "text": "...", "variant": "accent|surface|secondary" }

list:
  { "type": "list", "items": ["Item 1", "Item 2", ...], "style": "bullet|numbered|check|none" }

avatar:
  { "type": "avatar", "size": "sm|md|lg" }

stat:
  { "type": "stat", "value": "99%", "label": "Uptime" }

icon:
  { "type": "icon", "size": "sm|md|lg" }

ANALYSIS RULES:
- Carefully analyze the screenshot layout, identifying distinct sections from top to bottom
- Read actual text visible in the screenshot and use it in the output
- Detect the layout pattern of each section (centered, columns, grid, sidebar)
- Estimate reasonable pixel heights for each section based on proportions in the image
- Identify UI elements: headings, paragraphs, buttons, images, cards, inputs, navigation, etc.
- Map visual elements to the closest element type from the list above
- Preserve the visual hierarchy and spatial relationships
- Background colors should be inferred from the screenshot (use background/surface/accent/transparent)

LAYOUT RULES:
- "center-stacked": All elements vertically centered, stacked
- "two-column": Split into left/right columns
- "three-column-grid": 3 equal columns, typically for cards/features
- "four-column-grid": 4 equal columns

BACKGROUND COLOR ROLES:
- "background" = page background (light gray)
- "surface" = card/container background (blue-gray)
- "accent" = emphasis background (light blue)
- "transparent" = no background, inherits parent

COLOR EXTRACTION:
Also return an "extractedColors" object at the root level with HEX values:
{
  "extractedColors": {
    "text": "#XXXXXX",
    "background": "#XXXXXX",
    "secondary": "#XXXXXX",
    "surface": "#XXXXXX",
    "accent": "#XXXXXX"
  }
}
- Extract actual colors from the screenshot
- "text" = dominant text color, "background" = page background
- "accent" = brand/CTA color, "surface" = card background, "secondary" = border/muted color
- Always return valid 6-digit HEX

IMPORTANT:
- Analyze what you SEE in the screenshot — do not invent content
- All heights must be reasonable proportional estimates
- Sections should match the visual structure of the screenshot
- Respond ONLY with JSON, no explanation`;

/**
 * Detect media type from a base64 image string
 * @param {string} base64String - Base64 image data (may include data URI prefix)
 * @returns {string} MIME type
 */
function detectMediaType(base64String) {
  if (base64String.startsWith("data:image/png")) return "image/png";
  if (base64String.startsWith("data:image/jpeg") || base64String.startsWith("data:image/jpg")) return "image/jpeg";
  if (base64String.startsWith("data:image/webp")) return "image/webp";
  if (base64String.startsWith("data:image/gif")) return "image/gif";
  return "image/png"; // default
}

/**
 * Build user prompt for screenshot analysis
 * @param {object} params
 * @param {number} params.viewportWidth
 * @param {number} params.imageWidth
 * @param {number} params.imageHeight
 * @param {string} params.textMode
 * @returns {string}
 */
function buildScreenshotUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }) {
  let textInstruction;
  switch (textMode) {
    case "lorem":
      textInstruction = "Replace all visible text with Lorem Ipsum placeholder text of similar length.";
      break;
    case "semantic":
      textInstruction = "Replace text with short semantic labels describing the content purpose (e.g. 'Hero Headline', 'Feature Description', 'CTA Button').";
      break;
    default: // "website"
      textInstruction = "Read and preserve the actual text visible in the screenshot as closely as possible.";
  }

  return `Analyze this website screenshot and convert it into a wireframe structure.

Screenshot dimensions: ${imageWidth}x${imageHeight}px
Target viewport width: ${viewportWidth}px

Text handling: ${textInstruction}

Identify all visible sections from top to bottom, detect the layout structure, and map UI elements to the supported element types. Return the complete JSON structure.`;
}

/**
 * Analyze a screenshot using Claude Vision API
 * @param {object} params
 * @param {string} params.imageBase64 - Base64 encoded image (with or without data URI prefix)
 * @param {number} params.imageWidth
 * @param {number} params.imageHeight
 * @param {number} params.viewportWidth
 * @param {string} params.textMode
 * @returns {Promise<object>} Parsed simplified JSON
 */
async function analyzeScreenshot({ imageBase64, imageWidth, imageHeight, viewportWidth, textMode }) {
  const client = getClient();
  const model = process.env.AI_MODEL || "claude-sonnet-4-20250514";
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const mediaType = detectMediaType(imageBase64);

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SCREENSHOT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          },
          {
            type: "text",
            text: buildScreenshotUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }),
          },
        ],
      },
    ],
  });

  return parseJSONFromResponse(response.content[0].text);
}

/**
 * Analyze screenshot with retry on validation failure
 * @param {object} params - Same as analyzeScreenshot params
 * @param {number} [maxRetries=1]
 * @returns {Promise<object>} Validated simplified JSON
 */
async function analyzeScreenshotWithRetry(params, maxRetries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await analyzeScreenshot(params);
      const validation = validateSimplifiedFormat(result);

      if (validation.success) {
        return result;
      }

      lastError = new Error(`Validation failed: ${validation.errors.join(", ")}`);
      lastError.validationErrors = validation.errors;
      console.warn(`[Screenshot AI] Attempt ${attempt + 1} validation failed:`, validation.errors);
    } catch (err) {
      lastError = err;
      console.warn(`[Screenshot AI] Attempt ${attempt + 1} error:`, err.message);

      if (err.status === 401 || err.status === 403) {
        throw err;
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Extracted colors validation
// ============================================================================

/**
 * Validate AI-extracted colors from screenshot analysis
 * @param {object|null|undefined} colors
 * @returns {{ valid: boolean, colors: object|null }}
 */
function validateExtractedColors(colors) {
  if (!colors || typeof colors !== "object") return { valid: false, colors: null };
  const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
  const KEYS = ["text", "background", "secondary", "surface", "accent"];
  const out = {};
  for (const k of KEYS) {
    if (!colors[k] || !HEX_RE.test(colors[k])) return { valid: false, colors: null };
    out[k] = colors[k];
  }
  return { valid: true, colors: out };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  WIREFRAME_SYSTEM_PROMPT,
  SCREENSHOT_SYSTEM_PROMPT,
  VALID_ELEMENT_TYPES,
  VALID_PAGE_TYPES,
  VALID_BLOCK_TYPES,
  buildUserPrompt,
  buildScreenshotUserPrompt,
  detectMediaType,
  validateSimplifiedFormat,
  parseJSONFromResponse,
  generateWireframeStructure,
  generateWithRetry,
  analyzeScreenshot,
  analyzeScreenshotWithRetry,
  validateExtractedColors,
  // For testing: allow replacing the client
  _setClient(client) { _client = client; },
  _getClient: getClient,
};
