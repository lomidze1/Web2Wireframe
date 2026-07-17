// ============================================================================
// FIGMA-READY TYPES (from Browser Extension)
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
export interface FigmaColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

/** Gradient stop */
export interface FigmaGradientStop {
  color: FigmaColor;
  position: number; // 0-1
  cssVariableName?: string; // e.g. "--glass-bg"
}

/** Radial gradient shape */
export type RadialGradientShape = "circle" | "ellipse";

/** Radial gradient size keyword */
export type RadialGradientSize =
  | "closest-side"
  | "farthest-side"
  | "closest-corner"
  | "farthest-corner";

/** Fill layer - supports solid, gradient, image placeholder */
export interface FigmaFill {
  type:
    | "SOLID"
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_CONIC"
    | "IMAGE_PLACEHOLDER";
  visible: boolean;
  opacity: number;
  blendMode?: string;
  color?: FigmaColor;
  angle?: number;
  stops?: FigmaGradientStop[];
  // Radial/conic gradient specific
  center?: { x: number; y: number };
  shape?: RadialGradientShape; // circle or ellipse (default: ellipse)
  size?: RadialGradientSize; // CSS size keyword (default: farthest-corner)
  // Element dimensions for proper gradient transform calculation
  elementWidth?: number;
  elementHeight?: number;
  isImagePlaceholder?: boolean;
  imageUrl?: string; // URL for background-image (resolved from assets map)
  // Figma scale mode derived from CSS background-size/background-repeat
  // (contain → FIT, cover → FILL, tiling patterns → TILE). Default: FILL.
  scaleMode?: "FILL" | "FIT" | "CROP" | "TILE";
  // CSS variable reference (e.g. "--primary-color") if this fill came from a var()
  cssVariable?: string;
}

/** Stroke layer - border */
export interface FigmaStroke {
  color: FigmaColor;
  weight: number;
  position: "INSIDE" | "CENTER" | "OUTSIDE";
  style: "SOLID" | "DASHED" | "DOTTED";
  sides?: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
  // CSS variable reference (e.g. "--border-color") if this stroke came from a var()
  cssVariable?: string;
}

/** Effect layer - shadow or blur */
export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  visible: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  blurRadius?: number;
}

// ============================================================================
// Types for nested wireframe data
// ============================================================================

export interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  className?: string; // CSS class name(s) from the element
  x: number;
  y: number;
  width: number;
  height: number;

  // CSS Positioning (for absolute elements like ::before/::after)
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  zIndex?: number; // CSS z-index — used for child ordering in Figma
  cssOrder?: number; // CSS order — used for flex child visual reordering
  // CSS top/left offsets for position:fixed|sticky elements. Parsed to px.
  // Used by nodes.ts re-parenting to place the element at its intended
  // viewport offset instead of its DOM flow coordinate.
  cssTop?: number;
  cssLeft?: number;

  // Layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE" | "GRID";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };
  // Layout Alignment (for Auto Layout)
  justifyContent?: string; // CSS justify-content value
  alignItems?: string; // CSS align-items value
  flexWrap?: string; // CSS flex-wrap value
  // Child-level flex properties
  layoutGrow?: 0 | 1; // flex-grow: 0 = fixed, 1 = fill (Figma only supports 0 or 1)
  layoutAlign?: "STRETCH" | "INHERIT"; // align-self: stretch
  // Sizing mode (how element sizes itself)
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL"; // width behavior
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL"; // height behavior

  // CSS Grid (container)
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridColumnGap?: number;
  gridRowGap?: number;
  gridAutoFlow?: string;
  // CSS Grid (child placement — 1-based CSS line numbers)
  gridColumnStart?: number;
  gridColumnEnd?: number;
  gridRowStart?: number;
  gridRowEnd?: number;

  // =========================================================================
  // NEW: Figma-ready arrays (multiple layers support)
  // =========================================================================
  fills?: FigmaFill[]; // Multiple backgrounds: gradients, colors, image placeholders
  strokes?: FigmaStroke[]; // Borders (with per-side support)
  effects?: FigmaEffect[]; // Multiple shadows, backdrop-blur

  // =========================================================================
  // LEGACY: Keep for backward compatibility
  // =========================================================================
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius:
    | number
    | {
        topLeft: number;
        topRight: number;
        bottomRight: number;
        bottomLeft: number;
      };
  opacity: number;
  blendMode?: string; // CSS mix-blend-mode → Figma BlendMode
  // Overflow (for clipsContent)
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  // Centering (margin: 0 auto detected from original CSS)
  horizontallyCentered?: boolean;
  // Vertical centering via margin-top/bottom: auto (flex context)
  verticallyCenteredViaMargin?: boolean;
  // Self-alignment (for flex/grid children)
  alignSelf?: string;
  justifySelf?: string;
  // Margins for wrapper frame creation
  margin?: { top: number; right: number; bottom: number; left: number };

  // Text
  textContent: string;
  styledSegments?: TextSegment[];  // Inline elements with different styles
  listStyleType?: string;           // Bullet type for <li> elements
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  fontStyle?: string;                // CSS font-style (e.g. "italic", "oblique")
  fontFamilyList?: string[];         // Full CSS font-family fallback chain
  textAlign: string;
  lineHeight: number | string;
  letterSpacing: number;
  browserLineCount?: number;        // Number of lines from browser (from CDP textBoxes.length)
  // Max rendered text bounding-box width across the node's text children.
  // When a `<p>` element has width: 100% but text spans only half the box,
  // this stores the real text width so wireframe-lines (FILLR) render to the
  // text's visual span instead of stretching to the full element width.
  renderedTextWidth?: number;
  // Per-line rendered widths in reading order (top→bottom). Captured from CDP
  // client-rects so FILLR multi-line rendering can draw N squigglies at the
  // browser's actual per-line widths (e.g. [535, 550, 240] for a 3-line <p>)
  // instead of collapsing to a single line at max width.
  renderedTextWidths?: number[];

  // CSS max-width (px). When set, applied to Figma node as native TextNode.maxWidth
  // or FrameNode.maxWidth, enforcing a hard upper bound regardless of
  // layoutSizingHorizontal. This preserves CSS max-width semantics when the
  // element sits inside a FILL/HUG auto-layout parent that would otherwise
  // stretch the child past its constraint (e.g. Apple.com p.tile-subhead).
  cssMaxWidth?: number;

  // Raw computed styles passthrough (filtered non-default values)
  computedStyles?: Record<string, string>;

  // Pseudo-state CSS diffs (hover/focus/active/focus-visible)
  pseudoStateStyles?: {
    hover?: Record<string, string>;
    focus?: Record<string, string>;
    active?: Record<string, string>;
    focusVisible?: Record<string, string>;
  };

  // Batch 3 (h2d-parity): element is clickable (tag/role/tabindex/cursor:pointer)
  // but carries NO hover variant (either no captured diff or only a trivial
  // one like cursor/text-decoration-line:none). nodes.ts attaches a
  // self-referencing ON_HOVER reaction so Figma Preview shows cursor:pointer
  // without creating a ghost ComponentSet. Matches h2d's behavior on image
  // cards (apple .tile-link) where hovering only changes the cursor.
  needsCursorPointer?: boolean;

  // CSS variable reference for text color (e.g. "--text-primary")
  textColorVariable?: string;

  // Visibility state (for interaction variants — hidden in default state, visible in hover)
  isHiddenInDefault?: boolean;

  // FIX 4: true when any descendant has its own pseudoStateStyles. Used to
  // decide whether a node should become a ComponentSet trigger even if its
  // own hover diff is empty (parent-hover → child-visibility case).
  hasDescendantHover?: boolean;

  // Media
  isPlaceholder: boolean;
  imageUrl?: string; // URL pointing into frame.assets map for real image extraction
  // CSS object-fit from the captured <img>/<video> — maps to the IMAGE fill's
  // scaleMode (cover → FILL, contain/none/scale-down → FIT). Default fill → FILL.
  objectFit?: string;

  // Static CSS rotation in degrees (clockwise, from the computed transform
  // matrix). width/height/x/y remain the captured AABB; nodes.ts recovers the
  // unrotated box via computeRotatedPlacement when applying the rotation.
  rotation?: number;

  // Nested children
  children: WireframeNode[];
}

export interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
  assets?: Record<string, string>; // URL → base64 data URI map for real asset extraction

  // Captured website data (content script extraction)
  // When present, `tree` should be generated from this via convertW2WToWireframe()
  capturedData?: {
    frame: Record<string, unknown>; // Raw CSS node tree
    assets?: Record<string, { base64Encoded: boolean; content: string; mimeType?: string }>;
    doc?: Record<string, unknown>;
  };
}

// CSS Variable extracted from the page
export interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value
  category?: string; // color, spacing, typography, etc.
}

export interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  localStyles?: object;
  pluginColors: {
    // 5-color minimalist wireframe palette
    text: string; // Primary text (dark) - #11151a
    background: string; // Page background (light) - #f1f2f0
    secondary: string; // Borders, placeholders - #bdc1b2
    surface: string; // Cards, containers, sections - #afc6dc
    accent: string; // Buttons, links, CTAs - #c4def4
  };
  pluginFont?: string;
  cssVariables?: ExtractedCSSVariable[];
  variableMode?: "styles" | "direct";
  layoutMode?: "autoLayout" | "absolute"; // autoLayout = responsive, absolute = pixel-perfect
  // Import options
  colorMode?: "plugin" | "website";
  fontMode?: "plugin" | "website" | "lines";
  textMode?: "semantic" | "lorem" | "website";
  assetMode?: "placeholders" | "realAssets";
  interactionMode?: "none" | "variants";
  /** Map of CSS-declared family → real (SFNT) family, derived from the page's
   *  @font-face entries. Lets the sandbox auto-apply an already-installed font
   *  registered under an anti-piracy-aliased name (e.g. CSS "Söhne" → installed
   *  "Copyright Klim Type Foundry") without the fallback modal. */
  fontRealNames?: Record<string, string>;
}

/** Map from missing/website font name → replacement font name */
export type FontMapping = Record<string, string>;

// Context passed to render functions for style linking
export interface RenderContext {
  pluginColors: RenderWireframeData["pluginColors"];
  fontFamily: string;
  variableMode: "styles" | "direct";
  layoutMode: "autoLayout" | "absolute"; // autoLayout = use Auto Layout, absolute = use x,y positioning
  cssVariables: ExtractedCSSVariable[];
  // Map from resolved color value → PaintStyle (for linking)
  colorStyleMap: Map<string, PaintStyle>;
  // Map from variable name → resolved value
  variableValueMap: Map<string, string>;
  // Import options
  colorMode: "plugin" | "website";
  fontMode: "plugin" | "website" | "lines";
  // Text content mode
  textMode: "semantic" | "lorem" | "website";
  // Text style linking map (typography key → TextStyle)
  textStyleMap?: Map<string, TextStyle>;
  // Effect style linking map (effectsKey → EffectStyle) — Phase 2
  effectStyleMap?: Map<string, EffectStyle>;
  // Grid style linking map (gridKey → GridStyle) — Phase 3
  gridStyleMap?: Map<string, GridStyle>;
  // Parent background tracking for child-parent contrast
  parentBackgroundColor?: { r: number; g: number; b: number } | null;
  // Parent container width for text sizing decisions
  parentWidth?: number;
  // Map from CSS variable name → PaintStyle (for variable-first linking)
  variableStyleMap?: Map<string, PaintStyle>;
  // Font that was detected as missing (popup substitution trigger)
  missingFont?: string;
  // Multi-font mapping: each missing/website font → its replacement
  fontMapping?: FontMapping;
  // Original font names from the captured site (identity map of missing
  // families). Set only when the user picked "Use original fonts" in the
  // FontFallbackModal. Drives the post-render `w2w_original_font`
  // pluginData write so a later rebind can swap Inter → original family
  // once the user installs the .zip-downloaded fonts.
  originalFontNames?: FontMapping;
  // Asset extraction mode
  assetMode?: "placeholders" | "realAssets";
  // Map from image URL → base64 data URI (for real asset rendering)
  assetsMap?: Map<string, string>;
  // Interaction mode for pseudo-state variants
  interactionMode?: "none" | "variants";
  // Collected ComponentSets from pseudo-state variant creation
  componentSets?: ComponentSetNode[];
  // Content-signature dedup cache for hover ComponentSets — one entry per
  // unique visual+hover pattern; subsequent matches reuse the master via
  // createInstance() instead of minting new ComponentSets.
  hoverComponentCache?: Map<
    string,
    { componentSet: ComponentSetNode; defaultComponent: ComponentNode }
  >;
  // h2d-aligned consolidated hover ComponentSet registry (Pass 1 of the
  // two-pass architecture). Built before the render loop; queried during
  // render to turn hoverable elements into instances of shared masters.
  // Key = children-structure signature; value carries the master set +
  // variant index + TEXT property ids.
  hoverMasterRegistry?: Map<
    string,
    {
      componentSet: ComponentSetNode;
      // Phase C (h2d-parity): "Component N" wrapper FRAME with legends.
      // Section append uses this; bare ComponentSet remains accessible
      // for instance lookups in PASS 2.
      wrapper: FrameNode;
      componentIndex: number;
      variantByVisualSig: Map<string, number>;
      textPropIds: string[];
    }
  >;
  // Phase C (h2d-parity): "Component N" wrapper FRAMEs collected during PASS 1
  // for the Components section. Replaces direct componentSets append so the
  // section sees the documented frames (gray bg + legends), not bare sets.
  componentWrappers?: FrameNode[];
  // Phase D (h2d-parity): icon library (one ComponentSet bundling all unique
  // SVGs as variants). Render-time SVG creation looks up this library and
  // emits an INSTANCE instead of inlining `figma.createNodeFromSvg(markup)`.
  iconLibrary?: {
    componentSet: ComponentSetNode;
    wrapper: FrameNode;
    componentIndex: number;
    hashToComponent: Map<string, ComponentNode>;
    hashToVariantIndex: Map<string, number>;
  };
  // Render statistics — incremented during traversal, logged at the end of
  // the import so we can diagnose dedup effectiveness.
  renderStats?: {
    hoverCacheHits: number;
    hoverCacheMisses: number;
    emptyPseudoSkipped: number;
    pseudoErrors: number;
  };
}

/**
 * Element color role for smart mapping
 * 5-color minimalist wireframe palette
 */
export type ColorRole =
  | "text" // #11151A - ONLY for text content and placeholder icons
  | "background" // #F1F2F0 - Page/section backgrounds
  | "secondary" // #BDC1B2 - Borders, strokes
  | "surface" // #AAB5C3 - Cards, containers
  | "accent"; // #AFC6DC - Buttons, links, CTAs

// Text segment for tracking styled ranges (inline elements with different styles)
export interface TextSegment {
  text: string;
  color: string | null;
  fontWeight: number;
  fontSize: number;
  fontFamily?: string;
  fontFamilyList?: string[];  // Full CSS font-family fallback chain for this segment
  fontStyle?: string;  // CSS font-style (e.g. "italic", "oblique") for this run
  isLink?: boolean;  // Is this an <a> element?
  tag?: string;      // Original tag (span, a, strong, etc.)
  textDecoration?: "underline" | "line-through" | "none";  // CSS text-decoration
}

// Color stop for gradient parsing
export interface ColorStop {
  position: number;
  color: FigmaColor;
}
