// ============================================================================
// FIGMA-READY TYPES (from Browser Extension)
// ============================================================================

/**
 * Import diagnostics — buckets mirroring the groups h2d shows in its report.
 * `layout` has no producer yet; it exists so a future layout-degradation
 * warning has a home instead of landing in `other`.
 * Behaviour lives in rendering/diagnostics.ts.
 */
export type WarningCategory =
  | "typography"
  | "image"
  | "svg"
  | "layout"
  | "fatal"
  | "other";

/** One entry in the post-import warning report. */
export interface ImportWarning {
  category: WarningCategory;
  /** One human sentence: what was wanted, what happened instead. */
  message: string;
  /** Figma node id — present only when a node survived to be linked to. */
  nodeId?: string;
  /** Layer name, shown as the link text in the report. */
  layerName?: string;
  /**
   * Per-instance specifics (sizes, counts) shown next to the layer. Kept out
   * of `message` so identical problems collapse into one report row.
   */
  detail?: string;
}

/**
 * A loss the converter can already see from the captured styles (an
 * unsupported CSS filter, an iframe it can't import). Carried on the node and
 * reported by the renderer once the Figma node exists, so the report row can
 * select the layer.
 */
export interface PendingWarning {
  category: WarningCategory;
  message: string;
  /** Only a loss when real assets were requested (placeholders mode draws none). */
  realAssetsOnly?: boolean;
}

/**
 * A content-bearing subtree the converter dropped because the capture caught it
 * at `opacity: 0` — usually scroll-reveal content whose IntersectionObserver
 * had not fired yet. The nodes never reach Figma, so there is no id to link to;
 * the DOM-selector name is all the report can offer.
 */
export interface SkippedFrame {
  /** DOM-selector name, e.g. `div.reveal` or `section#plugins`. */
  layerName: string;
  width: number;
  height: number;
  /** Captured nodes in the lost subtree, itself included. */
  nodes: number;
}

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
  // Explicit radius from `radial-gradient(100px 50px at …)`, in px.
  // Overrides the size-keyword math in calculateRadialGradientTransform.
  radius?: { x: number; y: number };
  // Element dimensions for proper gradient transform calculation
  elementWidth?: number;
  elementHeight?: number;
  isImagePlaceholder?: boolean;
  imageUrl?: string; // URL for background-image (resolved from assets map)
  // CSS filter: grayscale(N) mapped to Figma ImagePaint color adjustment —
  // saturation in −1…0 (grayscale(1) → −1). Applied in fills.ts.
  imageSaturation?: number;
  // Figma scale mode derived from CSS background-size/background-repeat
  // (contain → FIT, cover → FILL, tiling patterns → TILE). Default: FILL.
  scaleMode?: "FILL" | "FIT" | "CROP" | "TILE";
  // CSS background-size in px for TILE layers — fills.ts derives
  // scalingFactor = tileSize.width / naturalWidth so patterns keep their
  // authored density (a 200px texture tiled at 40px needs 0.2, not 1).
  tileSize?: { width: number; height?: number };
  // CSS background-position as fractions (0..1). When present with a
  // cover/FILL layer, fills.ts upgrades the paint to CROP + imageTransform
  // so the author's crop focus survives (FILL always center-crops).
  position?: { x: number; y: number };
  // Raw per-layer background-size / background-repeat / background-position
  // strings. fills.ts combines them with the image's natural size into the
  // h2d-style CROP/TILE layout (computeBackgroundLayout); the derived
  // scaleMode above stays as the fallback when that fails.
  cssSize?: string;
  cssRepeat?: string;
  cssPosition?: string;
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

/**
 * A CSS 2D transform decomposed from the computed `matrix()` / `matrix3d()`.
 *
 * `a`..`d` are the raw 2x2 components in CSS order — `matrix(a, b, c, d, e, f)`
 * means the columns are (a, b) and (c, d). Placement math uses these directly
 * rather than recomposing from the decomposed angles, which avoids compounding
 * rounding error; the named fields exist for thresholds and diagnostics.
 */
export interface CssTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  /**
   * Translation in px. Recorded for diagnostics only — the captured geometry is
   * the AABB of the *already-transformed* element, so translation is baked into
   * x/y before we ever see it.
   */
  translateX: number;
  translateY: number;
  /** Rotation in degrees, CSS clockwise-positive. */
  rotation: number;
  /** Length of the x-axis column. Always positive. */
  scaleX: number;
  /** Signed y-scale — negative when the matrix mirrors (e.g. `scaleX(-1)`). */
  scaleY: number;
  /** Horizontal skew in degrees. */
  skewX: number;
  /**
   * A `matrix3d` carried a Z or perspective component that we dropped (Figma is
   * strictly 2D). Set so the renderer can report it instead of silently
   * flattening a 3D transform.
   */
  droppedZ?: boolean;
}

export interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  className?: string; // CSS class name(s) from the element
  /** Converter-detected losses, reported at render time — see PendingWarning. */
  pendingWarnings?: PendingWarning[];
  x: number;
  y: number;
  width: number;
  height: number;

  // CSS Positioning (for absolute elements like ::before/::after)
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  zIndex?: number; // CSS z-index — used for child ordering in Figma
  cssOrder?: number; // CSS order — used for flex child visual reordering
  // CSS inset offsets for position:fixed|sticky elements. Parsed to px;
  // `auto` stays undefined. Used by nodes.ts re-parenting to place the element
  // at its intended viewport offset instead of its DOM flow coordinate, and by
  // its promotion gate — a sticky element with no vertical inset never sticks.
  cssTop?: number;
  cssBottom?: number;
  cssLeft?: number;

  // Layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE" | "GRID";
  itemSpacing: number;
  // Distance between WRAPPED tracks (CSS row-gap on a horizontal flex row).
  // Figma keeps this separate from itemSpacing and defaults it to 0, so a
  // wrapped row whose CSS `gap` covered both axes collapsed its lines
  // together. Only meaningful with flexWrap: "wrap".
  counterAxisSpacing?: number;
  padding: { top: number; right: number; bottom: number; left: number };
  // Layout Alignment (for Auto Layout)
  justifyContent?: string; // CSS justify-content value
  alignItems?: string; // CSS align-items value
  flexWrap?: string; // CSS flex-wrap value
  // CSS flex-direction. Figma auto-layout has no reversed direction, so the
  // `-reverse` variants are reproduced by appending children backwards and
  // flipping the main-axis alignment — see reverseFlexChildren in nodes.ts.
  flexDirection?: string;
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
  // `background-clip: text` — the background paints the GLYPHS, not the box
  // (gradient-text headings). These layers are deliberately kept out of `fills`
  // so nodes.ts doesn't wrap the text in a background frame; text.ts applies
  // them as the TextNode's own fills.
  textFills?: FigmaFill[];
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
  // Which axes actually scroll, kept per-axis because `overflow` above
  // collapses them (most-restrictive-wins) and loses that. Drives Figma's
  // prototype `overflowDirection`; absent when nothing scrolls, which is
  // Figma's own NONE default.
  scrollDirection?: "BOTH" | "HORIZONTAL" | "VERTICAL";
  // Raw CSS clip-path. Only `inset()` is expressible in Figma — see
  // rendering/clipPath.ts, which turns it into clipsContent + cornerRadius.
  clipPath?: string;
  // Centering (margin: 0 auto detected from original CSS)
  horizontallyCentered?: boolean;
  // Vertical centering via margin-top/bottom: auto (flex context)
  verticallyCenteredViaMargin?: boolean;
  // Self-alignment (for flex/grid children)
  alignSelf?: string;
  /** The CSS `align-self` value this child needs a cross-axis wrapper for, or
   *  absent when it needs none. Figma has no per-child cross-axis alignment
   *  that survives a `layoutSizing*` write, so `alignWrappers.ts` turns this
   *  into a `:align-<value>` frame the way h2d's `H8` does. Decided in
   *  css-converter, where the parent's `display` and children are still in
   *  reach — see {@link resolveAlignSelfWrapper}. */
  alignSelfWrapper?: string;
  justifySelf?: string;
  // Margins for wrapper frame creation
  margin?: { top: number; right: number; bottom: number; left: number };

  // Text
  textContent: string;
  styledSegments?: TextSegment[];  // Inline elements with different styles
  // The segment texts already carry every separator the browser painted, so
  // createTextNode must NOT insert its own space between them. Set by the
  // inline run merge (rendering/textRunMerge.ts), where two runs that touched
  // on screen are concatenated exactly as measured.
  exactSegments?: boolean;
  listStyleType?: string;           // Bullet type for <li> elements
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  fontStyle?: string;                // CSS font-style (e.g. "italic", "oblique")
  fontFamilyList?: string[];         // Full CSS font-family fallback chain
  // PostScript name of the font that ACTUALLY rendered this run
  // (CSS.getPlatformFontsForNode). It encodes the cut and, for a variable
  // font, the resolved axes — neither of which CSS carries: `font-stretch`
  // and `font-variation-settings` are not captured. Used to refine the font
  // request; a family name is NEVER derived from it (see
  // `refineRequestFromPostScript`).
  platformPostScript?: string;
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
  // The browser's per-visual-line text, in reading order — the same rows that
  // produced `renderedTextWidths`, joined and text-transformed exactly as
  // `textContent` was. Present only for genuinely multi-line text.
  //
  // `textContent` joins soft-wrapped rows with a space so Figma may still
  // re-flow the copy; that hands the wrap to a SUBSTITUTED font, which can
  // land on a different line count and overflow the box (stripe.com's stats
  // heading: 2 browser lines → 3 Figma lines → +60px). `enforceMeasuredLineCount`
  // (rendering/textLineGuard) uses these strings to re-bake the measured
  // breaks as `\n` when — and only when — that actually happens.
  measuredLines?: string[];

  // CSS max-width (px). When set, applied to Figma node as native TextNode.maxWidth
  // or FrameNode.maxWidth, enforcing a hard upper bound regardless of
  // layoutSizingHorizontal. This preserves CSS max-width semantics when the
  // element sits inside a FILL/HUG auto-layout parent that would otherwise
  // stretch the child past its constraint (e.g. Apple.com p.tile-subhead).
  cssMaxWidth?: number;
  // CSS min-width / min-height / max-height (px) — applied as Figma native
  // minWidth/minHeight/maxHeight on auto-layout children, so an imported
  // layout keeps its CSS floors/ceilings when the designer edits content
  // (min-height heroes, min-width buttons). px-only, like cssMaxWidth.
  cssMinWidth?: number;
  cssMinHeight?: number;
  cssMaxHeight?: number;
  // Link URL for an <a> that renders no text (logo, icon, image card) —
  // applied as an ON_CLICK/URL prototype reaction on the FRAME, because there
  // are no glyphs to hang a hyperlink on. See attachLinkReaction in nodes.ts.
  linkReactionUrl?: string;
  // Same-page `#anchor` target id, from an <a href="#faq"> — the bare id, not
  // the href. Kept apart from `linkReactionUrl` because a hash is an INTERNAL
  // navigation target, not a URL action: it resolves to a Figma node id only
  // once the tree has rendered. See rendering/anchorLinks.ts.
  linkAnchorId?: string;
  // This element's own `id` attribute — the destination side of the pair above.
  anchorId?: string;

  // Absolute URL from the nearest <a href> ancestor — applied as
  // TextNode.hyperlink so imported links stay clickable.
  href?: string;
  // CSS text-shadow parsed to DROP_SHADOW effects. Kept separate from
  // `effects` because it must land on the TextNode itself — a shadow on the
  // wrapper box renders visibly differently from a shadow on the glyphs.
  textShadowEffects?: FigmaEffect[];

  // text-transform uppercase/lowercase → Figma textCase. The raw source-case
  // string is kept in textContent so editing/copying preserves the author's
  // casing; `capitalize` stays baked (CSS keeps inner caps, Figma TITLE not).
  textCase?: "UPPER" | "LOWER";
  // text-overflow: ellipsis / -webkit-line-clamp with clipping overflow.
  textTruncation?: "ENDING";
  maxLines?: number;
  // Vertical position of the text ink inside its element box, derived from
  // per-line geometry (covers flex-center, table-cell middle, line-height
  // tricks without needing the CSS signal). Absent = Figma default TOP.
  textAlignVertical?: "CENTER" | "BOTTOM";
  // Base-state text-decoration beyond the line kind (dotted/wavy, tinted).
  textDecorationStyle?: "WAVY" | "DOTTED";
  textDecorationColor?: string;
  // -webkit-text-stroke → TextNode strokes (outlined display text).
  textStroke?: { width: number; color: string };

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

  // CSS `aspect-ratio` → Figma `constrainProportions`. Geometry still comes
  // from the browser measurement, so this changes nothing at import time; it
  // keeps the declared ratio when the frame is resized afterwards.
  constrainProportions?: boolean;

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
  // CSS object-position as fractions (0..1); non-center values upgrade the
  // image paint to CROP + imageTransform in realImages.ts.
  objectPosition?: { x: number; y: number };
  // CSS filter: grayscale(N) on this element (0…1). Applied as a saturation
  // color adjustment on the element's IMAGE paints (realImages.ts / fills.ts).
  filterGrayscale?: number;

  // Static CSS transform decomposed from the computed matrix. width/height/x/y
  // remain the captured AABB; nodes.ts recovers the untransformed box and the
  // Figma `relativeTransform` via computeTransformPlacement.
  transform?: CssTransform;

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

/**
 * Which import flow produced a render. Only URL and extension imports carry a
 * page the developer can re-import, so only they get "Report this to the
 * developer" in the import report.
 */
export type ImportSourceKind = "url" | "extension" | "html" | "screenshot";

export interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  /** Which import flow sent this — see ImportSourceKind. */
  kind?: ImportSourceKind;
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
  /** h2d parity: true = legacy tag#id / tag.class layer names;
   *  false/absent (default) = semantic two-stage naming. */
  htmlLayerNames?: boolean;
  /** true = promote block containers whose captured rects prove a horizontal
   *  row to HORIZONTAL auto-layout instead of absolute placement;
   *  false/absent (default) = today's CSS-driven behaviour. */
  geometryRows?: boolean;
  /** The "Links" import option. false = the source site's links are left out
   *  of the wireframe (text hyperlinks, non-text `<a>` click-through and
   *  same-page `#anchor` jumps alike). true/absent = today's behaviour. */
  originLinks?: boolean;
  /** Map of CSS-declared family → real (SFNT) family, derived from the page's
   *  @font-face entries. Lets the sandbox auto-apply an already-installed font
   *  registered under an anti-piracy-aliased name (e.g. CSS "Söhne" → installed
   *  "Copyright Klim Type Foundry") without the fallback modal. */
  fontRealNames?: Record<string, string>;
  /** Per CSS family, the cuts its @font-face entries actually declare (the
   *  download's supply side). The sandbox drops "missing" cuts no face can
   *  provide — telex.ge fakes bold from a single 400 file, and offering the
   *  nonexistent 700 reopened the font modal on every import. */
  fontDeclaredCuts?: Record<string, Array<{ weight: number; italic: boolean }>>;
  /** CSS families served by ONE variable file (`font-weight: 1 1000`). Their
   *  per-weight cuts are never demanded: the whole range lives in the file
   *  already installed, so a "missing cut" would offer that same file again. */
  fontVariableFamilies?: string[];
  /** Per family, the styles its @font-face FILES install as. A weight with no
   *  exact cut is only a real gap when the file behind it is missing too —
   *  goodwill.ge's declared 500 is served by a file that installs as
   *  "75 Bold", so the family was permanently "partial". */
  fontFaceStyles?: Record<string, string[]>;
  /** Screenshot import: export the rendered frame back to the UI so it can be
   *  scored against the uploaded image. */
  compareToSource?: boolean;
  /** Dev profiler only (stripped in production builds — see utils/perf.ts).
   *  `Date.now()` at postMessage time; the sandbox subtracts it on arrival to
   *  price the structured clone of this payload. */
  sentAt?: number;
  /** Dev profiler only. The UI iframe's own stage timings (label → ms), merged
   *  into the sandbox table so one import prints one report. */
  perfUi?: Record<string, number>;
}

/** Map from missing/website font name → replacement font name */
export type FontMapping = Record<string, string>;

// Context passed to render functions for style linking
/**
 * Same-page `#anchor` wiring for ONE viewport frame. Behaviour lives in
 * rendering/anchorLinks.ts; the shape lives here because RenderContext carries it.
 */
export interface AnchorScope {
  /** html `id` → Figma node id. First registration wins. */
  targets: Map<string, string>;
  /** `<a href="#hash">` nodes waiting for their destination to show up. */
  pending: Array<{ node: SceneNode; hash: string }>;
}

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
  /**
   * May children of the current parent honour `layoutGrow: 1`?
   *
   * false when the parent's measured children do not fill it exactly — Figma
   * would then divide space CSS never handed out (see growFitsContainer in
   * rendering/layout.ts). Undefined means "not evaluated", i.e. allowed.
   */
  growEligible?: boolean;
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
  // CSS family → real (SFNT) family, straight from the page's @font-face
  // entries. Unlike `originalFontNames` this is set on EVERY website import,
  // modal or not: a downloaded file often registers in Figma under the real
  // name ("Space Grotesk" 600 installs as "Space Grotesk Light" / SemiBold),
  // and without it the renderer collapses that weight to a nearest cut.
  fontRealNames?: FontMapping;
  // Per CSS family, the cuts its @font-face entries actually declare. Gates
  // the `w2w_original_cut` marker: a weight no face can supply (telex.ge's
  // faked bold) is nothing the download can fix, so it must not advertise a
  // Re-apply.
  fontDeclaredCuts?: Record<string, Array<{ weight: number; italic: boolean }>>;
  // CSS families served by ONE variable file. Their near-weight draws are the
  // best that exists, so they never earn a `w2w_original_cut` marker.
  fontVariableFamilies?: string[];
  // Per family, the styles its @font-face FILES install as — see
  // `buildFontFaceStyles`. Used to tell a page's own weight mapping apart from
  // a file the user is genuinely missing.
  fontFaceStyles?: Record<string, string[]>;
  // Asset extraction mode
  assetMode?: "placeholders" | "realAssets";
  // Map from image URL → base64 data URI (for real asset rendering)
  assetsMap?: Map<string, string>;
  // Original pixel size of images the import shrank to fit Figma's 4096px
  // limit (main.ts). fills.ts measures backgrounds with it, so tiling and
  // cropping keep the page's geometry.
  imageNaturalSizes?: Map<string, { width: number; height: number }>;
  // Interaction mode for pseudo-state variants
  interactionMode?: "none" | "variants";
  // "Links" import option. false = render no link of any kind: no
  // TextNode.hyperlink, no ON_CLICK URL reaction on text-less <a> frames and
  // no same-page #anchor SCROLL_TO. Absent/true = links included.
  // Deliberately gated HERE (render time) rather than in the converter: the
  // captured `href` also feeds `isLink`, which colours links in plugin-colour
  // mode, so dropping it upstream would change the picture too.
  originLinks?: boolean;
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
  // Same-page `#anchor` wiring for the frame currently being rendered. Set by
  // the frame loop and cleared after it, so the off-canvas hover-master renders
  // that run BEFORE the loop never pollute the map. One scope per viewport
  // frame — see rendering/anchorLinks.ts.
  anchorScope?: AnchorScope;
  /**
   * Called once for every node that reaches Figma. Drives the import loader's
   * render progress — the only part of the bar that is measured rather than
   * estimated (see utils/importProgress.ts). Kept optional: renders started
   * outside the import loop (hover masters, tests) attach nothing.
   */
  onNodeRendered?: () => void;
  // Render statistics — incremented during traversal, logged at the end of
  // the import so we can diagnose dedup effectiveness.
  renderStats?: {
    hoverCacheHits: number;
    hoverCacheMisses: number;
    emptyPseudoSkipped: number;
    pseudoErrors: number;
    // Children whose creation threw and was swallowed by the per-child
    // try/catch (the subtree is lost). Surfaced to the user via
    // figma.notify at the end of the import — without this a 20%-incomplete
    // import looks identical to a perfect one.
    droppedNodes?: { name: string; error: string }[];
    // Categorised, per-layer diagnostics (see rendering/diagnostics.ts).
    // Superset of droppedNodes: every dropped subtree also lands here as a
    // `fatal` warning, alongside font/image/SVG fallbacks that used to be
    // completely silent. Surfaced in the UI as a clickable report.
    warnings?: ImportWarning[];
    // Warnings dropped after MAX_WARNINGS — counted so the report can say
    // "and N more" instead of quietly under-reporting.
    warningOverflow?: number;
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
  platformPostScript?: string;  // PostScript name of the font that rendered this run
  isLink?: boolean;  // Is this an <a> element?
  href?: string;     // This run's own link URL → per-range hyperlink
  tag?: string;      // Original tag (span, a, strong, etc.)
  textDecoration?: "underline" | "line-through" | "none";  // CSS text-decoration
  // Per-run typography that used to flatten to the node-level value. Each is
  // emitted only when this run's computed value DIFFERS from its host's.
  letterSpacing?: number;  // px
  textCase?: "UPPER" | "LOWER" | "SMALL_CAPS" | "ORIGINAL";
  // Underline detail beyond the line kind. Only meaningful on an UNDERLINE
  // run — Figma throws when these are set on a strikethrough.
  textDecorationStyle?: "DOTTED" | "WAVY";
  textDecorationColor?: string;
  lineHeight?: number | string;  // px number or a CSS string ("16px", "150%", "1.5")
}

// Color stop for gradient parsing
export interface ColorStop {
  position: number;
  color: FigmaColor;
}
