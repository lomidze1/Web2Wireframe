// Screenshot AI Analyzer — Claude Vision API integration
// Analyzes screenshots, validates and parses JSON output for the Screenshot import flow.

import Anthropic from "@anthropic-ai/sdk";

// ============================================================================
// Types
// ============================================================================

type TextMode = "lorem" | "semantic" | "website";

type LayoutType =
  | "center-stacked"
  | "two-column"
  | "three-column-grid"
  | "four-column-grid"
  | "sidebar-left"
  | "sidebar-right";

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
  | "accordion";

type AbsoluteElementType = ElementType | "section-bg";

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface SectionPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WireframeElement {
  type: ElementType;
  [key: string]: unknown;
}

export interface GeneratedSection {
  name: string;
  sectionType?: string;
  height?: number;
  background?: BackgroundRole | string;
  layout?: LayoutType | string;
  padding?: SectionPadding | number;
  gap?: number | string;
  elements: WireframeElement[];
}

export interface GeneratedWireframe {
  totalHeight?: number;
  sections: GeneratedSection[];
}

export interface ExtractedColors {
  text: string;
  background: string;
  secondary: string;
  surface: string;
  accent: string;
}

export interface ScreenshotAnalysisResult extends GeneratedWireframe {
  extractedColors?: ExtractedColors;
}

export interface AnalyzeScreenshotParams {
  imageBase64: string;
  imageWidth: number;
  imageHeight: number;
  viewportWidth: number;
  textMode: TextMode | string;
}

export interface AbsoluteElement {
  type: AbsoluteElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface AbsoluteAnalysisResult {
  pageWidth?: number;
  pageHeight?: number;
  extractedColors?: ExtractedColors;
  elements: AbsoluteElement[];
}

export interface ValidationResult {
  success: boolean;
  errors: string[];
}

export interface ExtractedColorsValidation {
  valid: boolean;
  colors: ExtractedColors | null;
}

interface ValidationError extends Error {
  validationErrors?: string[];
}

interface ApiError extends Error {
  status?: number;
}

// ============================================================================
// Anthropic client
// ============================================================================

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ============================================================================
// Constants
// ============================================================================

export const VALID_ELEMENT_TYPES: readonly string[] = [
  "heading", "subheading", "paragraph", "button", "button-group",
  "image", "icon", "card", "input", "nav-links", "logo", "divider",
  "badge", "list", "avatar", "stat", "grid", "accordion",
];

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate simplified JSON format from AI output
 */
export function validateSimplifiedFormat(json: unknown): ValidationResult {
  const errors: string[] = [];

  if (!json || typeof json !== "object") {
    return { success: false, errors: ["Response is not a valid object"] };
  }

  const data = json as Record<string, unknown>;

  if (!Array.isArray(data.sections)) {
    return { success: false, errors: ["Missing or invalid 'sections' array"] };
  }

  if (data.sections.length === 0) {
    errors.push("'sections' array is empty");
  }

  const VALIDATE_LAYOUTS = ["center-stacked", "two-column", "three-column-grid", "four-column-grid", "sidebar-left", "sidebar-right"];
  const VALIDATE_BACKGROUNDS = ["background", "surface", "accent", "transparent"];

  for (let i = 0; i < data.sections.length; i++) {
    const section = data.sections[i] as Record<string, unknown>;
    if (!section.name) {
      errors.push(`Section[${i}]: missing 'name'`);
    }

    // Validate layout (warning-level — still counts as error for strict validation)
    if (section.layout && !VALIDATE_LAYOUTS.includes(section.layout as string)) {
      errors.push(`Section[${i}]: invalid layout '${section.layout}'`);
    }

    // Auto-correct invalid background
    if (section.background && !VALIDATE_BACKGROUNDS.includes(section.background as string)) {
      section.background = "background";
    }

    if (!Array.isArray(section.elements)) {
      errors.push(`Section[${i}]: missing or invalid 'elements' array`);
    } else {
      for (let j = 0; j < section.elements.length; j++) {
        const el = section.elements[j] as Record<string, unknown>;
        if (!el.type) {
          errors.push(`Section[${i}].elements[${j}]: missing 'type'`);
        } else if (!VALID_ELEMENT_TYPES.includes(el.type as string)) {
          errors.push(`Section[${i}].elements[${j}]: unknown type '${el.type}'`);
        }
      }
    }
  }

  if (data.totalHeight != null && (typeof data.totalHeight !== "number" || data.totalHeight <= 0)) {
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
 */
export function parseJSONFromResponse(text: string): unknown {
  // Try extracting from ```json code block first
  const fencedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1].trim());
  }
  // Otherwise try parsing the whole text as JSON
  return JSON.parse(text.trim());
}

// ============================================================================
// Screenshot Analysis — Vision API
// ============================================================================

export const SCREENSHOT_SYSTEM_PROMPT = `You are a wireframe layout analyzer for a Figma plugin. You analyze website screenshots and output structured JSON wireframe descriptions.

OUTPUT SCHEMA:
{
  "totalHeight": <number>,
  "extractedColors": {
    "text": "#XXXXXX",
    "background": "#XXXXXX",
    "secondary": "#XXXXXX",
    "surface": "#XXXXXX",
    "accent": "#XXXXXX"
  },
  "sections": [
    {
      "name": "<Section Name>",
      "sectionType": "<hero|features|pricing|faq|testimonials|team|contact|cta|stats|footer|header|newsletter|gallery|blog-list>",
      "height": <number>,
      "background": "<background|surface|accent|transparent>",
      "layout": "<center-stacked|two-column|three-column-grid|four-column-grid|sidebar-left|sidebar-right>",
      "padding": { "top": <n>, "right": <n>, "bottom": <n>, "left": <n> },
      "gap": <number>,
      "elements": [
        {
          "type": "<element type>",
          "column": "<left|right|sidebar|main>",
          ... type-specific fields ...
        }
      ]
    }
  ]
}

ALL 18 ELEMENT TYPES:

heading:     { "type": "heading", "text": "...", "level": 1|2|3|4, "align": "left|center|right" }
subheading:  { "type": "subheading", "text": "...", "align": "left|center|right" }
paragraph:   { "type": "paragraph", "text": "...", "align": "left|center|right", "maxWidth": <number|null> }
button:      { "type": "button", "text": "...", "variant": "primary|secondary|outline|ghost", "size": "sm|md|lg" }
button-group: { "type": "button-group", "direction": "horizontal|vertical", "buttons": [ { "text": "...", "variant": "primary|secondary|outline", "size": "sm|md|lg" } ] }
image:       { "type": "image", "width": "full|half|third|quarter|<number>", "aspectRatio": "16:9|4:3|1:1|3:2", "rounded": true|false }
icon:        { "type": "icon", "size": "sm|md|lg" }
card:        { "type": "card", "elements": [...nested elements...], "padding": <number>, "rounded": true|false, "shadow": true|false, "background": "surface|background|transparent" }
input:       { "type": "input", "label": "...", "placeholder": "...", "inputType": "text|email|password|textarea" }
nav-links:   { "type": "nav-links", "links": ["Home","About","Pricing","Contact"], "direction": "horizontal|vertical" }
logo:        { "type": "logo", "size": "sm|md|lg" }
divider:     { "type": "divider" }
badge:       { "type": "badge", "text": "...", "variant": "accent|surface|secondary" }
list:        { "type": "list", "items": ["Item 1","Item 2",...], "style": "bullet|numbered|check|none" }
avatar:      { "type": "avatar", "size": "sm|md|lg" }
stat:        { "type": "stat", "value": "99%", "label": "Uptime" }
grid:        { "type": "grid", "columns": <number>, "elements": [...nested elements...] }
accordion:   { "type": "accordion", "items": [ { "title": "...", "content": "..." } ] }

COLUMN ASSIGNMENT RULES:
- "two-column" layout: EVERY element MUST have "column": "left" or "column": "right"
- "sidebar-left" / "sidebar-right" layout: EVERY element MUST have "column": "sidebar" or "column": "main"
- "center-stacked", "three-column-grid", "four-column-grid": do NOT use "column"

LAYOUT DETECTION — choose based on what you see:
- "center-stacked": content is centered horizontally, elements stacked vertically. Common for: hero, CTA, newsletter, single-column text sections.
- "two-column": section is visually split into two halves (text+image, text+text, etc). Common for: hero with side image, about sections, feature highlights.
- "three-column-grid": 3 repeating blocks side by side. Common for: features, pricing tiers, team members.
- "four-column-grid": 4 repeating blocks side by side. Common for: stats, icon grids, footer columns.
- "sidebar-left": narrow panel on left + wide content on right. Common for: documentation, blog with sidebar.
- "sidebar-right": wide content on left + narrow panel on right. Common for: blog with sidebar, filters.

CARD DETECTION:
- USE card wrapping when: element group has a visible boundary, shadow, border, or distinct background color different from the section.
- DO NOT use card when: elements are plain text/images without visual containment.
- Common card patterns: feature card (icon + heading + paragraph), pricing card (heading + stat (price e.g. "$12/month") + list (features) + button (CTA)), team card (avatar + heading + paragraph), testimonial card (paragraph + avatar + heading).

GRID CARD CONSISTENCY:
- When cards appear in a three-column-grid or four-column-grid, ensure ALL cards have the SAME element structure.
- If one card has: icon + heading + paragraph + button → ALL cards in that grid must have: icon + heading + paragraph + button.
- Match the number and types of nested elements across all cards in the same section.
- If a card appears to have less content visually, use shorter text but keep the same element types.

HEIGHT ESTIMATION:
- Calculate each section height as a proportion of the total image height.
- Formula: section_height = (fraction of image the section occupies) × imageHeight
- Typical ranges: nav/header 60-100px, hero 400-700px, content sections 300-600px, CTA 200-400px, footer 200-400px.
- Never output a section height below 60px or above 800px.

HEADING HIERARCHY:
- h1 (level: 1): page title — use only ONCE per page, typically in hero section
- h2 (level: 2): section titles — one per section
- h3 (level: 3): card titles, sub-section titles
- h4 (level: 4): minor headings within cards or lists

BACKGROUND ROLE RULES:
- "background": section background is the same as or very close to the page background color
- "surface": section has a slightly different neutral shade (gray, off-white) — used for alternating sections
- "accent": section has a bold, brand, or distinctly colored background
- "transparent": no visible background (rare — use when section floats over content)

EXTRACTED COLORS:
- "text": dominant text color from the screenshot (usually dark)
- "background": page background color (usually light)
- "secondary": border, muted, or secondary text color
- "surface": card or container background color
- "accent": brand color, CTA button color, or primary highlight color
- All values must be valid 6-digit HEX codes (#XXXXXX)

TEXT ATOMICITY:
- Keep compound text together as ONE element. Examples: "$12/month" → single heading or stat, "100+ customers" → single stat.
- For pricing, prefer the stat type: { "type": "stat", "value": "$12/month", "label": "Basic Plan" }
- Never split a price and its period (e.g., "$12" + "/month") into separate elements.

CRITICAL RULES:
- Analyze what you SEE — do not invent content not visible in the screenshot
- Sections must match the visual structure top-to-bottom
- Respond ONLY with valid JSON, no markdown fences, no explanation`;

/**
 * Detect media type from a base64 image string
 */
export function detectMediaType(base64String: string): ImageMediaType {
  if (base64String.startsWith("data:image/png")) return "image/png";
  if (base64String.startsWith("data:image/jpeg") || base64String.startsWith("data:image/jpg")) return "image/jpeg";
  if (base64String.startsWith("data:image/webp")) return "image/webp";
  if (base64String.startsWith("data:image/gif")) return "image/gif";
  return "image/png"; // default
}

interface ScreenshotPromptParams {
  viewportWidth: number;
  imageWidth: number;
  imageHeight: number;
  textMode: TextMode | string;
}

/**
 * Build user prompt for screenshot analysis
 */
export function buildScreenshotUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }: ScreenshotPromptParams): string {
  let textInstruction: string;
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

Screenshot dimensions: ${imageWidth}x${imageHeight}px (imageHeight=${imageHeight} — use this for proportional height estimation)
Target viewport width: ${viewportWidth}px

Text handling: ${textInstruction}

Follow this 6-step process:
1. SCAN: Identify all distinct sections from top to bottom of the screenshot.
2. LAYOUT: For each section, determine the layout pattern (center-stacked, two-column, three-column-grid, four-column-grid, sidebar-left, sidebar-right).
3. ELEMENTS: Map visible UI elements to the supported element types (heading, paragraph, button, image, card, etc.).
4. COLUMNS: For two-column layouts, assign EVERY element to "column": "left" or "right". For sidebar layouts, use "column": "sidebar" or "main".
5. HEIGHTS: Estimate each section height as a fraction of imageHeight (${imageHeight}px). Keep within 60-800px range.
6. COLORS: Extract the 5 color roles (text, background, secondary, surface, accent) into "extractedColors" at the root level.

Return the complete JSON structure.`;
}

/**
 * Analyze a screenshot using Claude Vision API
 */
export async function analyzeScreenshot({ imageBase64, imageWidth, imageHeight, viewportWidth, textMode }: AnalyzeScreenshotParams): Promise<ScreenshotAnalysisResult> {
  const client = getClient();
  const model = process.env.AI_MODEL || "claude-sonnet-4-20250514";
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const mediaType = detectMediaType(imageBase64);

  const response = await client.messages.create({
    model,
    max_tokens: 12000,
    temperature: 0.2,
    system: [
      {
        type: "text",
        text: SCREENSHOT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
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
      {
        role: "assistant",
        content: "{",
      },
    ],
  });

  const u = response.usage;
  console.log(
    `[AI] fn=analyzeScreenshot model=${model} ` +
      `input=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} ` +
      `cache_write=${u.cache_creation_input_tokens ?? 0} output=${u.output_tokens}`
  );

  const firstBlock = response.content[0];
  if (firstBlock.type !== "text") {
    throw new Error("Unexpected response content type from Claude API");
  }
  const fullJSON = "{" + firstBlock.text;
  const parsed = parseJSONFromResponse(fullJSON) as ScreenshotAnalysisResult;
  return postProcessScreenshotResult(parsed);
}

// ============================================================================
// Post-processing — fix common AI output issues
// ============================================================================

const VALID_LAYOUTS: readonly string[] = ["center-stacked", "two-column", "three-column-grid", "four-column-grid", "sidebar-left", "sidebar-right"];
const VALID_BACKGROUNDS: readonly string[] = ["background", "surface", "accent", "transparent"];

const LAYOUT_CORRECTIONS: Record<string, LayoutType> = {
  "centered": "center-stacked",
  "center": "center-stacked",
  "stacked": "center-stacked",
  "center-stack": "center-stacked",
  "two-columns": "two-column",
  "2-column": "two-column",
  "2-columns": "two-column",
  "three-columns": "three-column-grid",
  "three-column": "three-column-grid",
  "3-column-grid": "three-column-grid",
  "four-columns": "four-column-grid",
  "four-column": "four-column-grid",
  "4-column-grid": "four-column-grid",
  "left-sidebar": "sidebar-left",
  "right-sidebar": "sidebar-right",
};

/**
 * Post-process AI screenshot result to fix common issues
 */
export function postProcessScreenshotResult(result: ScreenshotAnalysisResult): ScreenshotAnalysisResult {
  if (!result || !Array.isArray(result.sections)) return result;

  for (const section of result.sections) {
    // Fix layout name variations
    if (section.layout && !VALID_LAYOUTS.includes(section.layout)) {
      const corrected = LAYOUT_CORRECTIONS[section.layout];
      if (corrected) {
        section.layout = corrected;
      }
    }

    // Fix padding: number → object
    if (typeof section.padding === "number") {
      const p = section.padding;
      section.padding = { top: p, right: p, bottom: p, left: p };
    }

    // Fix gap: string → number
    if (typeof section.gap === "string") {
      const parsed = parseInt(section.gap, 10);
      if (!isNaN(parsed)) section.gap = parsed;
    }

    // Clamp height
    if (typeof section.height === "number") {
      if (section.height > 2000) section.height = 800;
      if (section.height < 30) section.height = 200;
    }
  }

  // Recalculate totalHeight from sections
  const sumHeight = result.sections.reduce((sum, s) => sum + (s.height || 0), 0);
  if (sumHeight > 0) {
    result.totalHeight = sumHeight;
  }

  return result;
}

/**
 * Analyze screenshot with retry on validation failure
 */
export async function analyzeScreenshotWithRetry(params: AnalyzeScreenshotParams, maxRetries: number = 1): Promise<ScreenshotAnalysisResult> {
  let lastError: ApiError | ValidationError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await analyzeScreenshot(params);
      const validation = validateSimplifiedFormat(result);

      if (validation.success) {
        return result;
      }

      const err: ValidationError = new Error(`Validation failed: ${validation.errors.join(", ")}`);
      err.validationErrors = validation.errors;
      lastError = err;
      console.warn(`[Screenshot AI] Attempt ${attempt + 1} validation failed:`, validation.errors);
    } catch (err) {
      lastError = err as ApiError;
      console.warn(`[Screenshot AI] Attempt ${attempt + 1} error:`, (err as Error).message);

      const apiErr = err as ApiError;
      if (apiErr.status === 401 || apiErr.status === 403) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("Generation failed with no error details");
}

// ============================================================================
// Screenshot Absolute Positioning — Vision API
// ============================================================================

export const SCREENSHOT_ABSOLUTE_PROMPT = `You are a wireframe layout analyzer for a Figma plugin. You analyze website screenshots and output structured JSON with absolute element positions (bounding boxes).

OUTPUT SCHEMA:
{
  "pageWidth": <number>,
  "pageHeight": <number>,
  "extractedColors": {
    "text": "#XXXXXX",
    "background": "#XXXXXX",
    "secondary": "#XXXXXX",
    "surface": "#XXXXXX",
    "accent": "#XXXXXX"
  },
  "elements": [
    {
      "type": "<element type>",
      "x": <number>,
      "y": <number>,
      "width": <number>,
      "height": <number>,
      ... type-specific fields ...
    }
  ]
}

COORDINATE SYSTEM:
- Origin (0, 0) = top-left corner of the page
- All x, y, width, height values are in pixels (page-relative coordinates)
- x = horizontal distance from left edge
- y = vertical distance from top edge

ELEMENT TYPES:

section-bg:
  { "type": "section-bg", "name": "Section Name", "x": 0, "y": <n>, "width": <pageWidth>, "height": <n>, "background": "background|surface|accent" }
  Represents a section's background color. Always full-width. Place BEFORE elements that appear on top of it.

heading:     { "type": "heading", "text": "...", "level": 1|2|3|4, "align": "left|center|right", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
subheading:  { "type": "subheading", "text": "...", "align": "left|center|right", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
paragraph:   { "type": "paragraph", "text": "...", "align": "left|center|right", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
button:      { "type": "button", "text": "...", "variant": "primary|secondary|outline|ghost", "size": "sm|md|lg", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
button-group: { "type": "button-group", "direction": "horizontal|vertical", "buttons": [...], "x": <n>, "y": <n>, "width": <n>, "height": <n> }
image:       { "type": "image", "aspectRatio": "16:9|4:3|1:1|3:2", "rounded": true|false, "x": <n>, "y": <n>, "width": <n>, "height": <n> }
icon:        { "type": "icon", "size": "sm|md|lg", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
card:        { "type": "card", "x": <n>, "y": <n>, "width": <n>, "height": <n>, "background": "surface|background|transparent", "shadow": true|false, "rounded": true|false, "elements": [...child elements WITHOUT x/y...] }
input:       { "type": "input", "label": "...", "placeholder": "...", "inputType": "text|email|password|textarea", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
nav-links:   { "type": "nav-links", "links": ["Home","About",...], "direction": "horizontal|vertical", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
logo:        { "type": "logo", "size": "sm|md|lg", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
divider:     { "type": "divider", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
badge:       { "type": "badge", "text": "...", "variant": "accent|surface|secondary", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
list:        { "type": "list", "items": ["..."], "style": "bullet|numbered|check|none", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
avatar:      { "type": "avatar", "size": "sm|md|lg", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
stat:        { "type": "stat", "value": "99%", "label": "Uptime", "x": <n>, "y": <n>, "width": <n>, "height": <n> }
grid:        { "type": "grid", "columns": <number>, "elements": [...], "x": <n>, "y": <n>, "width": <n>, "height": <n> }
accordion:   { "type": "accordion", "items": [{"title":"...","content":"..."}], "x": <n>, "y": <n>, "width": <n>, "height": <n> }

CARD/LIST/ACCORDION CHILDREN:
- Child elements inside card, list, grid, and accordion do NOT need x/y/width/height
- They will be auto-laid out vertically inside the parent
- Only specify type-specific fields for children

POSITIONING RULES:
- section-bg elements span the full page width (x: 0, width: pageWidth)
- Elements must not overlap unintentionally
- Sort ALL elements by y coordinate (top to bottom)
- pageHeight should accommodate all elements

BOUNDING BOX ESTIMATION:
- Estimate x, y, width, height based on visual position in the screenshot
- Use the screenshot dimensions and target viewport for proportional calculation
- Headings: height ~ fontSize * 1.3 (h1: ~56px, h2: ~42px, h3: ~32px, h4: ~24px)
- Paragraphs: height ~ lineCount * lineHeight (~24px per line)
- Buttons: height ~ 36-48px depending on size
- Cards: include padding in dimensions

BACKGROUND ROLES:
- "background": same as page background
- "surface": card/container color (slightly different shade)
- "accent": brand/emphasis color

EXTRACTED COLORS:
- "text": dominant text color
- "background": page background color
- "secondary": border/muted color
- "surface": card background color
- "accent": brand/CTA color
- All values must be valid 6-digit HEX codes (#XXXXXX)

HEADING HIERARCHY:
- h1: page title — use ONCE, typically in hero
- h2: section titles
- h3: card/sub-section titles
- h4: minor headings

TEXT ATOMICITY:
- Keep compound text together as ONE element. Examples: "$12/month" → single heading or stat, "100+ customers" → single stat.
- For pricing, prefer the stat type: { "type": "stat", "value": "$12/month", "label": "Basic Plan" }

CRITICAL RULES:
- Every top-level element MUST have x, y, width, height
- Card/list/accordion children do NOT need x/y/width/height
- Analyze what you SEE — do not invent content
- Respond ONLY with valid JSON, no markdown fences, no explanation`;

/**
 * Build user prompt for absolute screenshot analysis
 */
export function buildScreenshotAbsoluteUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }: ScreenshotPromptParams): string {
  let textInstruction: string;
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

  return `Analyze this website screenshot and convert it into a wireframe with absolute element positions (bounding boxes).

Screenshot dimensions: ${imageWidth}x${imageHeight}px (imageHeight=${imageHeight} — use this for proportional calculation)
Target viewport width: ${viewportWidth}px

Text handling: ${textInstruction}

Follow this process:
1. SCAN: Identify all distinct sections and elements from top to bottom.
2. SECTIONS: For each section, create a "section-bg" element with the section's background color role.
3. ELEMENTS: Map visible UI elements to supported types with bounding boxes (x, y, width, height).
4. ESTIMATE: Calculate each element's position as a proportion of the screenshot dimensions, scaled to the target viewport.
   - Scale x: elementX = (visibleX / ${imageWidth}) * ${viewportWidth}
   - Scale widths: elementWidth = (visibleWidth / ${imageWidth}) * ${viewportWidth}
   - Scale y/heights proportionally using imageHeight (${imageHeight}px)
5. COLORS: Extract the 5 color roles (text, background, secondary, surface, accent) into "extractedColors".
6. SORT: Order all elements by y coordinate (top to bottom).

Return the complete JSON structure.`;
}

/**
 * Validate absolute format JSON from AI output
 */
export function validateAbsoluteFormat(json: unknown): ValidationResult {
  const errors: string[] = [];

  if (!json || typeof json !== "object") {
    return { success: false, errors: ["Response is not a valid object"] };
  }

  const data = json as Record<string, unknown>;

  if (!Array.isArray(data.elements)) {
    return { success: false, errors: ["Missing or invalid 'elements' array"] };
  }

  if (data.elements.length === 0) {
    errors.push("'elements' array is empty");
  }

  const VALID_ABSOLUTE_TYPES = [...VALID_ELEMENT_TYPES, "section-bg"];

  for (let i = 0; i < data.elements.length; i++) {
    const el = data.elements[i] as Record<string, unknown>;
    if (!el.type) {
      errors.push(`elements[${i}]: missing 'type'`);
    } else if (!VALID_ABSOLUTE_TYPES.includes(el.type as string)) {
      errors.push(`elements[${i}]: unknown type '${el.type}'`);
    }

    // Check bounding box fields
    if (typeof el.x !== "number") errors.push(`elements[${i}]: missing 'x'`);
    if (typeof el.y !== "number") errors.push(`elements[${i}]: missing 'y'`);
    if (typeof el.width !== "number") errors.push(`elements[${i}]: missing 'width'`);
    if (typeof el.height !== "number") errors.push(`elements[${i}]: missing 'height'`);
  }

  return { success: errors.length === 0, errors };
}

/**
 * Post-process absolute AI result: clamp coordinates, sort, recalculate pageHeight
 */
export function postProcessAbsoluteResult(result: AbsoluteAnalysisResult): AbsoluteAnalysisResult {
  if (!result || !Array.isArray(result.elements)) return result;

  const pageWidth = result.pageWidth || 1440;

  for (const el of result.elements) {
    // Coerce to numbers
    el.x = Number(el.x) || 0;
    el.y = Number(el.y) || 0;
    el.width = Number(el.width) || 0;
    el.height = Number(el.height) || 0;

    // Clamp negative coordinates
    if (el.x < 0) el.x = 0;
    if (el.y < 0) el.y = 0;

    // Clamp beyond pageWidth
    if (el.x + el.width > pageWidth) {
      el.width = Math.max(0, pageWidth - el.x);
    }
  }

  // Sort by y coordinate
  result.elements.sort((a, b) => a.y - b.y);

  // Recalculate pageHeight from elements
  let maxBottom = 0;
  for (const el of result.elements) {
    const bottom = el.y + el.height;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  if (maxBottom > 0) {
    result.pageHeight = maxBottom;
  }

  return result;
}

/**
 * Analyze a screenshot using Claude Vision API (absolute positioning mode)
 */
export async function analyzeScreenshotAbsolute({ imageBase64, imageWidth, imageHeight, viewportWidth, textMode }: AnalyzeScreenshotParams): Promise<AbsoluteAnalysisResult> {
  const client = getClient();
  const model = process.env.AI_MODEL || "claude-sonnet-4-20250514";
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const mediaType = detectMediaType(imageBase64);

  const response = await client.messages.create({
    model,
    max_tokens: 12000,
    temperature: 0.2,
    system: [
      {
        type: "text",
        text: SCREENSHOT_ABSOLUTE_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
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
            text: buildScreenshotAbsoluteUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }),
          },
        ],
      },
      {
        role: "assistant",
        content: "{",
      },
    ],
  });

  const u = response.usage;
  console.log(
    `[AI] fn=analyzeScreenshotAbsolute model=${model} ` +
      `input=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} ` +
      `cache_write=${u.cache_creation_input_tokens ?? 0} output=${u.output_tokens}`
  );

  const firstBlock = response.content[0];
  if (firstBlock.type !== "text") {
    throw new Error("Unexpected response content type from Claude API");
  }
  const fullJSON = "{" + firstBlock.text;
  const parsed = parseJSONFromResponse(fullJSON) as AbsoluteAnalysisResult;
  return postProcessAbsoluteResult(parsed);
}

/**
 * Analyze screenshot (absolute) with retry on validation failure
 */
export async function analyzeScreenshotAbsoluteWithRetry(params: AnalyzeScreenshotParams, maxRetries: number = 1): Promise<AbsoluteAnalysisResult> {
  let lastError: ApiError | ValidationError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await analyzeScreenshotAbsolute(params);
      const validation = validateAbsoluteFormat(result);

      if (validation.success) {
        return result;
      }

      const err: ValidationError = new Error(`Validation failed: ${validation.errors.join(", ")}`);
      err.validationErrors = validation.errors;
      lastError = err;
      console.warn(`[Screenshot Absolute] Attempt ${attempt + 1} validation failed:`, validation.errors);
    } catch (err) {
      lastError = err as ApiError;
      console.warn(`[Screenshot Absolute] Attempt ${attempt + 1} error:`, (err as Error).message);

      const apiErr = err as ApiError;
      if (apiErr.status === 401 || apiErr.status === 403) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("Generation failed with no error details");
}

// ============================================================================
// Extracted colors validation
// ============================================================================

/**
 * Validate AI-extracted colors from screenshot analysis
 */
export function validateExtractedColors(colors: unknown): ExtractedColorsValidation {
  if (!colors || typeof colors !== "object") return { valid: false, colors: null };
  const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
  const KEYS = ["text", "background", "secondary", "surface", "accent"] as const;
  const colorObj = colors as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of KEYS) {
    const val = colorObj[k];
    if (!val || typeof val !== "string" || !HEX_RE.test(val)) return { valid: false, colors: null };
    out[k] = val;
  }
  return { valid: true, colors: out as unknown as ExtractedColors };
}

// ============================================================================
// Testing helpers
// ============================================================================

/**
 * Replace the Anthropic client (for testing)
 */
export function _setClient(client: Anthropic | null): void {
  _client = client;
}

/**
 * Get the current Anthropic client instance
 */
export const _getClient = getClient;
