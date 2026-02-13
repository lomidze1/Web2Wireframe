/**
 * CDP Extraction Module for Puppeteer
 *
 * Main entry point that orchestrates:
 * 1. DOMSnapshot.captureSnapshot for bulk extraction
 * 2. CSS.getMatchedStylesForNode for gradient/variable nodes
 * 3. Style parsing to Figma-ready format
 */

const { createCDPClient } = require("./client");
const {
  captureSnapshot,
  parseSnapshot,
  buildTreeFromSnapshot,
  findNodesNeedingMatchedStyles,
  resolveNodeIds,
} = require("./snapshot");
const {
  getMatchedStylesForNode,
  extractPropertyFromMatchedRules,
  extractBorderWidthFromMatchedRules,
  extractCSSVariables,
} = require("./css");
const {
  parseColorToFigma,
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
} = require("./style-parsers");

// Maximum depth for DOM tree traversal
const MAX_DEPTH = 15;

// Tags to skip
const SKIP_TAGS = [
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
];

// Text element tags
const TEXT_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "li",
  "label",
  "td",
  "th",
  "button",
  "strong",
  "em",
  "b",
  "i",
];

// Media element tags
const MEDIA_TAGS = ["img", "video", "iframe", "picture", "canvas"];

/**
 * Extract DOM tree using CDP
 * This is the main function that replaces page.evaluate() extraction
 *
 * @param {import('puppeteer').Page} page
 * @param {Object} options
 * @param {string} [options.textMode='website']
 * @param {string} [options.colorMode='plugin-colors']
 * @param {string} [options.typographyMode='plugin-fonts']
 * @param {Object} [options.pluginColors]
 * @param {string} [options.pluginFont='Montserrat']
 * @param {number} [options.viewportWidth=1440]
 * @returns {Promise<import('./types').ExtractedElement>}
 */
async function extractDOMTreeWithCDP(page, options = {}) {
  const {
    textMode = "website",
    colorMode = "plugin-colors",
    typographyMode = "plugin-fonts",
    pluginColors = {},
    pluginFont = "Montserrat",
    viewportWidth = 1440,
  } = options;

  // Default colors
  const defaultColors = {
    main: "#1f3a5f",
    text: "#333333",
    accent: "#3b82f6",
    surface: "#f5f5f5",
    border: "#e0e0e0",
    background: "#ffffff",
  };
  const colors = { ...defaultColors, ...pluginColors };

  // Create CDP client
  const client = await createCDPClient(page);

  try {
    // Step 1: Capture page snapshot (ONE CDP call)
    console.log("[CDP] Capturing page snapshot...");
    const snapshot = await captureSnapshot(client);

    // Step 2: Parse snapshot into usable structures
    console.log("[CDP] Parsing snapshot...");
    const { nodes, nodesByBackendId } = parseSnapshot(snapshot);
    const childrenMap = buildTreeFromSnapshot(nodes);

    // Step 3: Find nodes that need getMatchedStylesForNode
    const nodesNeedingStyles = findNodesNeedingMatchedStyles(nodes);
    console.log(
      `[CDP] Found ${nodesNeedingStyles.length} nodes needing matched styles`
    );

    // DEBUG: Check if BODY is in the list
    // Step 4: Request DOM document (required before pushNodesByBackendIdsToFrontend)
    await client.send("DOM.getDocument", { depth: 0 });

    // Step 5: Resolve nodeIds for matched style nodes
    const backendNodeIds = nodesNeedingStyles.map((n) => n.backendNodeId);
    const nodeIdMap = await resolveNodeIds(client, backendNodeIds);

    // Step 6: Extract CSS variables
    const cssVariables = await extractCSSVariables(client);
    const variablesMap = new Map(cssVariables.map((v) => [v.name, v.value]));
    console.log(`[CDP] Extracted ${cssVariables.length} CSS variables`);

    // Step 7: Get matched styles for nodes that need it
    /** @type {Map<number, import('./types').CDPMatchedStyles>} */
    const matchedStylesMap = new Map();

    for (const node of nodesNeedingStyles) {
      const nodeId = nodeIdMap.get(node.backendNodeId);
      if (nodeId) {
        const matchedStyles = await getMatchedStylesForNode(client, nodeId);
        if (matchedStyles) {
          matchedStylesMap.set(node.backendNodeId, matchedStyles);
        }
      }
    }
    console.log(`[CDP] Got matched styles for ${matchedStylesMap.size} nodes`);

    // Step 8: Build element tree
    let nodeIdCounter = 0;

    /**
     * Get semantic name for element
     * @param {import('./snapshot').ParsedSnapshotNode} node
     * @returns {string}
     */
    function getName(node) {
      const tag = node.nodeName;
      const aria = node.attributes["aria-label"];
      if (aria) return aria.substring(0, 40);

      const id = node.attributes.id;
      if (id && id.length < 25) return id.replace(/-/g, " ");

      const cls = node.attributes.class || "";
      const patterns = [
        [/header/i, "Header"],
        [/nav/i, "Navigation"],
        [/footer/i, "Footer"],
        [/hero/i, "Hero"],
        [/card/i, "Card"],
        [/sidebar/i, "Sidebar"],
        [/menu/i, "Menu"],
        [/button/i, "Button"],
        [/banner/i, "Banner"],
        [/container/i, "Container"],
        [/content/i, "Content"],
        [/section/i, "Section"],
        [/form/i, "Form"],
        [/search/i, "Search"],
        [/logo/i, "Logo"],
        [/grid/i, "Grid"],
        [/list/i, "List"],
        [/item/i, "Item"],
      ];
      for (const [p, n] of patterns) if (p.test(cls)) return n;

      const tagNames = {
        header: "Header",
        nav: "Navigation",
        main: "Main",
        section: "Section",
        article: "Article",
        aside: "Sidebar",
        footer: "Footer",
        form: "Form",
        ul: "List",
        ol: "List",
        h1: "Heading 1",
        h2: "Heading 2",
        h3: "Heading 3",
        h4: "Heading 4",
        p: "Paragraph",
        img: "Image",
        video: "Video",
      };
      return tagNames[tag] || "Container";
    }

    /**
     * Detect layout from computed styles
     * @param {Record<string, string>} s
     * @returns {'NONE' | 'HORIZONTAL' | 'VERTICAL'}
     */
    function getLayout(s) {
      if (s.display === "flex" || s.display === "inline-flex") {
        return s["flex-direction"] === "column" ||
          s["flex-direction"] === "column-reverse"
          ? "VERTICAL"
          : "HORIZONTAL";
      }

      if (s.display === "grid" || s.display === "inline-grid") {
        if (s["grid-auto-flow"]?.includes("column")) {
          return "HORIZONTAL";
        }
        const columns = s["grid-template-columns"];
        if (columns && columns !== "none") {
          const normalizedColumns = columns
            .replace(/repeat\s*\(\s*(\d+)\s*,/g, (_, count) => {
              return Array(parseInt(count)).fill("1fr").join(" ") + " ";
            })
            .trim();
          const columnCount = normalizedColumns
            .split(/\s+/)
            .filter((v) => v && v !== "none").length;
          if (columnCount > 1) {
            return "HORIZONTAL";
          }
        }
        return "VERTICAL";
      }

      if (s.display === "inline" || s.display === "inline-block") {
        return "HORIZONTAL";
      }

      return "NONE";
    }

    /**
     * Collect DIRECT text content from immediate TEXT_NODE children only
     * This avoids duplication: parent gets its direct text, children get theirs
     * @param {number} nodeIndex
     * @returns {string}
     */
    function collectDirectText(nodeIndex) {
      const childIndices = childrenMap.get(nodeIndex) || [];
      /** @type {string[]} */
      const textParts = [];
      let hasElementChildren = false;

      for (const childIdx of childIndices) {
        const child = nodes[childIdx];
        // Only collect TEXT_NODEs (nodeType === 3), not element children
        if (child && child.nodeType === 3 && child.textContent) {
          textParts.push(child.textContent);
        }
        // Track if there are element children (for whitespace preservation)
        if (child && child.nodeType === 1) {
          hasElementChildren = true;
        }
      }

      let result = textParts.join("");
      // Normalize: collapse multiple whitespace to single space
      result = result.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");

      if (hasElementChildren) {
        // Only trim leading whitespace, keep trailing for inline element flow
        result = result.replace(/^\s+/, "");
      } else {
        result = result.trim();
      }

      return result;
    }

    /**
     * Recursively collect ALL text from inline elements
     * Used for <li> elements that may have nested inline content
     * @param {number} nodeIndex
     * @returns {string}
     */
    function collectAllInlineText(nodeIndex) {
      const node = nodes[nodeIndex];
      if (!node) return "";

      // TEXT_NODE - return its content
      if (node.nodeType === 3) {
        return node.textContent || "";
      }

      // ELEMENT_NODE - collect from children recursively
      const childIndices = childrenMap.get(nodeIndex) || [];
      /** @type {string[]} */
      const textParts = [];

      for (const childIdx of childIndices) {
        const childText = collectAllInlineText(childIdx);
        if (childText) {
          textParts.push(childText);
        }
      }

      let result = textParts.join(" ");
      result = result.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
      return result;
    }

    /**
     * Check if element is a "leaf" text element (has no element children)
     * @param {number} nodeIndex
     * @returns {boolean}
     */
    function isLeafElement(nodeIndex) {
      const childIndices = childrenMap.get(nodeIndex) || [];

      for (const childIdx of childIndices) {
        const child = nodes[childIdx];
        // If has any ELEMENT_NODE child, it's not a leaf
        if (child && child.nodeType === 1) {
          return false;
        }
      }

      return true;
    }

    /**
     * Check if element is media
     * @param {import('./snapshot').ParsedSnapshotNode} node
     * @returns {boolean}
     */
    function isMedia(node) {
      if (MEDIA_TAGS.includes(node.nodeName)) return true;
      const bgImage = node.computedStyles["background-image"];
      if (bgImage && bgImage !== "none" && bgImage.includes("url(")) {
        if (node.bounds && node.bounds.width > 60 && node.bounds.height > 60) {
          return true;
        }
      }
      return false;
    }

    /**
     * Transform text based on mode
     * @param {string} text
     * @param {string} tag
     * @returns {string}
     */
    function transformText(text, tag) {
      if (!text) return "";
      if (textMode === "lorem") {
        const loremWords = [
          "Lorem",
          "ipsum",
          "dolor",
          "sit",
          "amet",
          "consectetur",
          "adipiscing",
          "elit",
          "sed",
          "do",
          "eiusmod",
          "tempor",
        ];
        const count = Math.max(text.split(/\s+/).length, 2);
        const result = [];
        for (let i = 0; i < count; i++)
          result.push(loremWords[i % loremWords.length]);
        result[0] = result[0].charAt(0).toUpperCase() + result[0].slice(1);
        return result.join(" ");
      }
      if (textMode === "semantic") {
        const semantic = {
          h1: "Main Heading",
          h2: "Section Title",
          h3: "Subsection",
          h4: "Heading",
          p: "Paragraph text",
          a: "Link",
          button: "Button",
          span: "Text",
          li: "List Item",
          label: "Label",
        };
        return semantic[tag] || "Content";
      }
      return text;
    }

    /**
     * Parse color from CSS value
     * @param {string | null | undefined} c
     * @returns {string | null}
     */
    function parseColor(c) {
      if (!c || c === "rgba(0, 0, 0, 0)" || c === "transparent") return null;
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        return `#${parseInt(m[1]).toString(16).padStart(2, "0")}${parseInt(m[2])
          .toString(16)
          .padStart(2, "0")}${parseInt(m[3]).toString(16).padStart(2, "0")}`;
      }
      return c.startsWith("#") ? c : null;
    }

    /**
     * Check if a text element needs a Frame wrapper (smart wrapping).
     *
     * Figma Text nodes CANNOT have: padding, background, border, border-radius, box-shadow, backdrop-filter
     * If any of these styles are present, we need to wrap the text in a Frame.
     *
     * NOTE: margin does NOT trigger wrapper - it's handled by absolute positioning.
     * @param {{ top: number, right: number, bottom: number, left: number }} padding
     * @param {Array} fills
     * @param {Array} strokes
     * @param {Array} effects
     * @param {{ topLeft: number, topRight: number, bottomRight: number, bottomLeft: number }} borderRadius
     * @returns {boolean}
     */
    function needsFrameWrapper(padding, fills, strokes, effects, borderRadius) {
      // Check padding
      if (padding.top > 0 || padding.right > 0 || padding.bottom > 0 || padding.left > 0) {
        return true;
      }

      // Check fills (background-color, gradient)
      if (fills.length > 0) {
        return true;
      }

      // Check strokes (border)
      if (strokes.length > 0) {
        return true;
      }

      // Check effects (box-shadow, backdrop-filter)
      if (effects.length > 0) {
        return true;
      }

      // Check border-radius
      if (borderRadius.topLeft > 0 || borderRadius.topRight > 0 ||
          borderRadius.bottomRight > 0 || borderRadius.bottomLeft > 0) {
        return true;
      }

      return false;
    }

    /**
     * Process a single node into ExtractedElement
     * @param {import('./snapshot').ParsedSnapshotNode} node
     * @param {number} depth
     * @param {number} parentX
     * @param {number} parentY
     * @returns {import('./types').ExtractedElement | null}
     */
    function processNode(node, depth, parentX = 0, parentY = 0) {
      if (depth > MAX_DEPTH) return null;
      if (SKIP_TAGS.includes(node.nodeName)) return null;
      if (node.nodeType !== 1) return null; // Skip non-elements

      const bounds = node.bounds;
      if (!bounds || bounds.width < 3 || bounds.height < 3) return null;

      const s = node.computedStyles;
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        parseFloat(s.opacity) === 0
      ) {
        return null;
      }

      const x = Math.round(bounds.x);
      const y = Math.round(bounds.y);
      const w = Math.ceil(bounds.width);
      const h = Math.ceil(bounds.height);

      const media = isMedia(node);
      const tag = node.nodeName;

      // Aggregate text - collect direct TEXT_NODE children only (avoid duplication)
      let aggregatedText = node.textContent || "";
      if (!aggregatedText) {
        // For <li> elements, collect ALL text including nested inline elements
        if (tag === "li") {
          aggregatedText = collectAllInlineText(node.index);
        } else {
          // For other elements, only collect immediate TEXT_NODE children
          aggregatedText = collectDirectText(node.index);
        }
      }

      // Determine if this element WOULD be treated as a text element (before smart wrapping check)
      // Either: in TEXT_TAGS OR is a leaf element (no element children) with text
      // NOTE: <a> tags are excluded - they remain frames with centered text children
      const isText = TEXT_TAGS.includes(tag);
      const isLeaf = isLeafElement(node.index);
      const wouldBeText = isText || (isLeaf && aggregatedText && tag !== "a");

      // Get transformed text content (will be used if this becomes a text element)
      const transformedText = wouldBeText && aggregatedText ? transformText(aggregatedText, tag) : "";

      // NOTE: Final type determination (frame/text/placeholder) is done AFTER
      // fills/strokes/effects/borderRadius/padding are computed (smart wrapping check)

      // Get matched styles if available
      const matchedStyles = matchedStylesMap.get(node.backendNodeId);

      // Extract backgrounds using CDP matched rules (preserves gradients!)
      let backgroundImage = s["background-image"];
      let backgroundShorthand = null;
      let backgroundColor = s["background-color"];

      // If we have matched styles, try to get original CSS (with gradients preserved)
      if (matchedStyles) {
        const originalBgImage = extractPropertyFromMatchedRules(
          matchedStyles,
          "background-image"
        );
        if (originalBgImage) {
          backgroundImage = originalBgImage;
        }
        // Also get background shorthand (may contain gradient)
        const originalBgShorthand = extractPropertyFromMatchedRules(
          matchedStyles,
          "background"
        );
        if (originalBgShorthand) {
          backgroundShorthand = originalBgShorthand;
        }
        const originalBgColor = extractPropertyFromMatchedRules(
          matchedStyles,
          "background-color"
        );
        if (originalBgColor) {
          backgroundColor = originalBgColor;
        }
      }

      // Filter transparent colors for fills
      const bgColorForFills = backgroundColor &&
        backgroundColor !== "transparent" &&
        backgroundColor !== "rgba(0, 0, 0, 0)"
        ? backgroundColor
        : null;

      // Parse to Figma-ready fills (gradients, colors, image placeholders)
      // Use backgroundShorthand if available (may contain gradient), otherwise backgroundImage
      const fills = parseBackgroundToFills(
        backgroundShorthand || backgroundImage,
        bgColorForFills,
        variablesMap,
        { width: w, height: h }
      );

      // Parse box-shadow to effects
      // Try matched styles first (preserves original CSS), fallback to computed
      let boxShadow = s["box-shadow"];
      if (matchedStyles) {
        const originalBoxShadow = extractPropertyFromMatchedRules(matchedStyles, "box-shadow");
        if (originalBoxShadow) {
          boxShadow = originalBoxShadow;
        }
      }

      let effects = parseBoxShadowToEffects(boxShadow);

      // Parse backdrop-filter
      const backdropFilter = s["backdrop-filter"];
      effects = effects.concat(parseBackdropFilterToEffects(backdropFilter));

      // Parse borders to strokes
      let borderWidth = s["border-width"] || s["border-top-width"];
      if (matchedStyles) {
        const originalBorderWidth =
          extractBorderWidthFromMatchedRules(matchedStyles);
        if (originalBorderWidth) {
          borderWidth = originalBorderWidth;
        }
      }
      const strokes = parseBordersToStrokes(
        borderWidth,
        s["border-color"],
        s["border-style"],
        null,
        null,
        null,
        null,
        variablesMap
      );

      // Legacy color handling for backward compatibility
      const bgColor = parseColor(backgroundColor);
      const txtColor = parseColor(s.color);
      const brdColor = parseColor(s["border-color"]);

      let legacyBackgroundColor = null;
      let legacyTextColor = colors.text;
      let legacyBorderColor = null;

      if (colorMode === "website-colors") {
        legacyBackgroundColor = bgColor;
        legacyTextColor = txtColor || "#333333";
        legacyBorderColor = brdColor;
      } else {
        // Plugin colors mode
        const isButton =
          node.nodeName === "button" ||
          node.attributes.role === "button";
        const isLink =
          node.nodeName === "a" && node.attributes.href;
        const isInput = ["input", "textarea", "select"].includes(node.nodeName);
        const isCard = boxShadow && boxShadow !== "none";
        const hasVisibleBg = bgColor && bgColor !== colors.background;

        if (isButton || (isLink && hasVisibleBg)) {
          legacyBackgroundColor = colors.accent;
          legacyTextColor = "#ffffff";
        } else if (isInput) {
          legacyBackgroundColor = colors.background;
          legacyBorderColor = colors.border;
        } else if (isCard || hasVisibleBg) {
          legacyBackgroundColor = colors.surface;
        } else if (media) {
          legacyBackgroundColor = colors.surface;
        }

        if (brdColor) {
          legacyBorderColor = colors.border;
        }
      }

      // Font
      let fontFamily = pluginFont || "Montserrat";
      if (typographyMode === "website-fonts") {
        fontFamily =
          s["font-family"]?.split(",")[0]?.replace(/['"]/g, "") || "Inter";
      }

      // Border radius
      const borderRadius = {
        topLeft: parseInt(s["border-top-left-radius"]) || 0,
        topRight: parseInt(s["border-top-right-radius"]) || 0,
        bottomRight: parseInt(s["border-bottom-right-radius"]) || 0,
        bottomLeft: parseInt(s["border-bottom-left-radius"]) || 0,
      };

      // Extract margins for wrapper frame creation
      const margin = {
        top: parseInt(s["margin-top"]) || 0,
        right: parseInt(s["margin-right"]) || 0,
        bottom: parseInt(s["margin-bottom"]) || 0,
        left: parseInt(s["margin-left"]) || 0,
      };

      // Detect horizontal centering (margin: 0 auto, margin-inline: auto)
      // Use matchedStyles to get original CSS values (computed styles resolve "auto" to pixels)
      let horizontallyCentered = false;
      if (matchedStyles) {
        const marginShorthand = extractPropertyFromMatchedRules(matchedStyles, "margin");
        const marginLeftOriginal = extractPropertyFromMatchedRules(matchedStyles, "margin-left");
        const marginRightOriginal = extractPropertyFromMatchedRules(matchedStyles, "margin-right");
        const marginInlineOriginal = extractPropertyFromMatchedRules(matchedStyles, "margin-inline");

        if (marginShorthand && /\bauto\b/i.test(marginShorthand)) {
          horizontallyCentered = true;
        } else if (marginInlineOriginal === "auto") {
          horizontallyCentered = true;
        } else if (marginLeftOriginal === "auto" || marginRightOriginal === "auto") {
          horizontallyCentered = true;
        }
      }

      // Detect vertical centering via margins (flex container)
      // Use matchedStyles to get original CSS values (computed styles resolve "auto" to pixels)
      let verticallyCenteredViaMargin = false;
      if (matchedStyles) {
        const marginShorthand = extractPropertyFromMatchedRules(matchedStyles, "margin");
        const marginTopOriginal = extractPropertyFromMatchedRules(matchedStyles, "margin-top");
        const marginBottomOriginal = extractPropertyFromMatchedRules(matchedStyles, "margin-bottom");
        const marginBlockOriginal = extractPropertyFromMatchedRules(matchedStyles, "margin-block");

        // Check shorthand for vertical auto (e.g., "auto 0" or "auto auto")
        if (marginShorthand) {
          const parts = marginShorthand.trim().split(/\s+/);
          // margin: auto → all sides auto
          // margin: auto 0 → top/bottom auto
          if (parts[0] === "auto") {
            verticallyCenteredViaMargin = true;
          }
        }
        if (!verticallyCenteredViaMargin && marginBlockOriginal === "auto") {
          verticallyCenteredViaMargin = true;
        }
        if (!verticallyCenteredViaMargin && (marginTopOriginal === "auto" || marginBottomOriginal === "auto")) {
          verticallyCenteredViaMargin = true;
        }
      }

      // Self-alignment properties (for flex/grid children)
      const alignSelf = s["align-self"] || "auto";
      const justifySelf = s["justify-self"] || "auto";

      // Padding for list item bullet handling
      const padding = {
        top: parseInt(s["padding-top"]) || 0,
        right: parseInt(s["padding-right"]) || 0,
        bottom: parseInt(s["padding-bottom"]) || 0,
        left: parseInt(s["padding-left"]) || 0,
      };

      // =========================================================================
      // SMART WRAPPING: Determine final type now that we have all style info
      // =========================================================================

      // Check if this text element needs a Frame wrapper (has styles Text nodes can't support)
      const requiresWrapper = wouldBeText && needsFrameWrapper(padding, fills, strokes, effects, borderRadius);

      // Final decision: only be Text if no wrapper needed
      const shouldBeText = wouldBeText && !requiresWrapper;
      const shouldBeFrameWithTextChild = wouldBeText && requiresWrapper;

      // Determine final element type
      let type = "frame";
      let textContent = "";

      if (media) {
        type = "placeholder";
      } else if (shouldBeText && transformedText) {
        type = "text";
        textContent = transformedText;
      } else if (shouldBeFrameWithTextChild && transformedText) {
        // Frame wrapper - textContent used for synthetic child, not on frame
        textContent = transformedText;
      }

      // For <li>, <a>, or elements needing wrapper: don't put text on frame, we'll add synthetic child
      const isListItemWithText = tag === "li" && !!textContent;
      const isLinkWithText = tag === "a" && isLeaf && !!textContent;
      const needsSyntheticTextChild = isListItemWithText || shouldBeFrameWithTextChild || isLinkWithText;
      const frameTextContent = needsSyntheticTextChild ? "" : textContent;

      /** @type {import('./types').ExtractedElement} */
      const element = {
        id: `n${nodeIdCounter++}`,
        name: getName(node),
        type,
        tag: node.nodeName,
        className: node.attributes.class || undefined,
        x: x - parentX,
        y: y - parentY,
        width: w,
        height: h,
        layoutMode: getLayout(s),
        itemSpacing: parseInt(s.gap) || 0,
        padding,
        // Flex properties for Auto Layout
        justifyContent: s["justify-content"] || "normal",
        alignItems: s["align-items"] || "normal",
        flexWrap: s["flex-wrap"] || "nowrap",
        // Self-alignment (for children)
        alignSelf,
        justifySelf,
        // Centering detection
        horizontallyCentered,
        verticallyCenteredViaMargin,
        // Margins for wrapper frame creation
        margin,
        // Figma-ready arrays
        fills,
        strokes,
        effects,
        // Legacy (for compatibility)
        backgroundColor: legacyBackgroundColor,
        backgroundGradient: backgroundImage?.includes("gradient")
          ? backgroundImage
          : null,
        textColor: legacyTextColor,
        borderColor: legacyBorderColor,
        borderWidth: parseInt(borderWidth) || 0,
        borderRadius,
        boxShadow: boxShadow !== "none" ? boxShadow : null,
        // Typography
        fontFamily,
        fontSize: parseInt(s["font-size"]) || 14,
        fontWeight: parseInt(s["font-weight"]) || 400,
        lineHeight: s["line-height"] || "normal",
        letterSpacing: parseFloat(s["letter-spacing"]) || 0,
        textAlign: s["text-align"] || "left",
        textContent: frameTextContent,
        // State
        opacity: parseFloat(s.opacity) || 1,
        isPlaceholder: media,
        overflow: s.overflow,
        children: [],
      };

      // Process children
      const childIndices = childrenMap.get(node.index) || [];
      for (const childIdx of childIndices) {
        const childNode = nodes[childIdx];
        if (childNode) {
          const childElement = processNode(childNode, depth + 1, x, y);
          if (childElement) {
            element.children.push(childElement);
          }
        }
      }

      // Auto-upgrade parent alignment if any child is horizontally centered
      // This converts CSS "margin: 0 auto" centering to Figma Auto Layout
      // Don't check width - centering applies regardless of child size
      if (element.children.length > 0) {
        const hasCenteredChild = element.children.some(
          (child) => child.horizontallyCentered
        );
        if (hasCenteredChild) {
          // If no layout, convert to VERTICAL
          if (element.layoutMode === "NONE") {
            element.layoutMode = "VERTICAL";
            element.justifyContent = "normal"; // Keep vertical positioning as-is
          }
          // For VERTICAL layout, center horizontally (cross-axis)
          if (element.layoutMode === "VERTICAL") {
            element.alignItems = "center";
          }
          // For HORIZONTAL layout, this would need different handling
          // (centered child in row → would need wrapper or different approach)
        }
      }

      // For <li> elements: add synthetic text child for the text content (with bullet offset)
      // This creates proper structure: <li>(frame) -> [bullet area, text]
      if (isListItemWithText && textContent) {
        const bulletWidth = padding.left || 16;
        /** @type {import('./types').ExtractedElement} */
        const syntheticTextChild = {
          id: `n${nodeIdCounter++}`,
          name: "Text",
          type: "text",
          tag: "#text",
          x: bulletWidth,
          y: 0,
          width: Math.max(10, w - bulletWidth - padding.right),
          height: h,
          layoutMode: "NONE",
          itemSpacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          fills: [],
          strokes: [],
          effects: [],
          backgroundColor: null,
          backgroundGradient: null,
          textColor: legacyTextColor,
          borderColor: null,
          borderWidth: 0,
          borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          boxShadow: null,
          fontFamily,
          fontSize: parseInt(s["font-size"]) || 14,
          fontWeight: parseInt(s["font-weight"]) || 400,
          lineHeight: s["line-height"] || "normal",
          letterSpacing: parseFloat(s["letter-spacing"]) || 0,
          textAlign: s["text-align"] || "left",
          textContent: textContent,
          opacity: 1,
          isPlaceholder: false,
          children: [],
        };
        element.children.push(syntheticTextChild);
      }

      // Smart wrapping: For text elements that need Frame wrapper (padding, bg, border, etc.)
      // Create Frame with styles + Text child inside (text-only styles)
      if (shouldBeFrameWithTextChild && textContent) {
        /** @type {import('./types').ExtractedElement} */
        const syntheticTextChild = {
          id: `n${nodeIdCounter++}`,
          name: "Text",
          type: "text",
          tag: "#text",
          x: 0,
          y: 0,
          width: Math.max(10, w - padding.left - padding.right),
          height: Math.max(10, h - padding.top - padding.bottom),
          layoutMode: "NONE",
          itemSpacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          fills: [],
          strokes: [],
          effects: [],
          backgroundColor: null,
          backgroundGradient: null,
          textColor: legacyTextColor,
          borderColor: null,
          borderWidth: 0,
          borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          boxShadow: null,
          fontFamily,
          fontSize: parseInt(s["font-size"]) || 14,
          fontWeight: parseInt(s["font-weight"]) || 400,
          lineHeight: s["line-height"] || "normal",
          letterSpacing: parseFloat(s["letter-spacing"]) || 0,
          textAlign: s["text-align"] || "left",
          textContent: textContent,
          opacity: 1,
          isPlaceholder: false,
          children: [],
        };
        element.children.push(syntheticTextChild);
      }

      // For <a> (link) elements with text: always create synthetic text child
      // Links remain Frames so they can have styling, but need text child inside
      if (isLinkWithText && textContent) {
        /** @type {import('./types').ExtractedElement} */
        const syntheticTextChild = {
          id: `n${nodeIdCounter++}`,
          name: "Text",
          type: "text",
          tag: "#text",
          x: 0,
          y: 0,
          width: Math.max(10, w - padding.left - padding.right),
          height: Math.max(10, h - padding.top - padding.bottom),
          layoutMode: "NONE",
          itemSpacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          fills: [],
          strokes: [],
          effects: [],
          backgroundColor: null,
          backgroundGradient: null,
          textColor: legacyTextColor,
          borderColor: null,
          borderWidth: 0,
          borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          boxShadow: null,
          fontFamily,
          fontSize: parseInt(s["font-size"]) || 14,
          fontWeight: parseInt(s["font-weight"]) || 400,
          lineHeight: s["line-height"] || "normal",
          letterSpacing: parseFloat(s["letter-spacing"]) || 0,
          textAlign: s["text-align"] || "left",
          textContent: textContent,
          opacity: 1,
          isPlaceholder: false,
          children: [],
        };
        element.children.push(syntheticTextChild);
      }

      // Determine if node should be kept
      const hasVisual =
        legacyBackgroundColor ||
        legacyBorderColor ||
        textContent ||
        media ||
        fills.length > 0 ||
        strokes.length > 0 ||
        effects.length > 0;
      const hasChildren = element.children.length > 0;
      const isStructural = [
        "header",
        "nav",
        "main",
        "section",
        "article",
        "aside",
        "footer",
        "form",
        "div",
        "ul",
        "ol",
        "figure",
        "figcaption",
      ].includes(node.nodeName);
      const isLargeEnough = w >= 50 && h >= 20;

      if (!hasVisual && !hasChildren) {
        if (!isStructural || !isLargeEnough) {
          return null;
        }
      }

      return element;
    }

    // Find body node and build tree
    const bodyNode = nodes.find((n) => n.nodeName === "body");
    if (!bodyNode || !bodyNode.bounds) {
      throw new Error("Could not find body element");
    }

    // Get body background - use matchedStyles for gradients, computed for colors
    const bodyMatchedStyles = matchedStylesMap.get(bodyNode.backendNodeId);
    const bodyComputedBgImage = bodyNode.computedStyles["background-image"] || "";
    const bodyComputedBgColor = bodyNode.computedStyles["background-color"] || "";

    // Extract background shorthand from matched styles (preserves gradients)
    const bodyBackgroundShorthand = bodyMatchedStyles
      ? extractPropertyFromMatchedRules(bodyMatchedStyles, "background")
      : null;

    // Use matched background shorthand if it has gradient, otherwise use computed
    const bodyBackgroundImage = (bodyBackgroundShorthand && bodyBackgroundShorthand.includes("gradient"))
      ? bodyBackgroundShorthand
      : bodyComputedBgImage;

    // Get solid color for fills
    const bodyBgColorForFills = bodyComputedBgColor &&
      bodyComputedBgColor !== "transparent" &&
      bodyComputedBgColor !== "rgba(0, 0, 0, 0)"
        ? bodyComputedBgColor
        : null;

    // Parse body fills (gradients + solid color)
    const bodyFills = colorMode === "website-colors"
      ? parseBackgroundToFills(
          bodyBackgroundImage,
          bodyBgColorForFills,
          variablesMap,
          { width: viewportWidth, height: Math.ceil(bodyNode.bounds.height) }
        )
      : [];

    // DEBUG: Log BODY fills
    console.log(`[CDP ROOT] BODY matchedStyles: ${!!bodyMatchedStyles}`);
    console.log(`[CDP ROOT] BODY backgroundShorthand: "${bodyBackgroundShorthand}"`);
    console.log(`[CDP ROOT] BODY backgroundImage: "${bodyBackgroundImage}"`);
    console.log(`[CDP ROOT] BODY bgColorForFills: "${bodyBgColorForFills}"`);
    console.log(`[CDP ROOT] BODY fills: ${bodyFills.length}`, bodyFills.map(f => f.type));

    // Legacy backgroundColor for compatibility
    const bodyBgColor =
      colorMode === "website-colors"
        ? parseColor(bodyComputedBgColor) || colors.background
        : colors.background;

    /** @type {import('./types').ExtractedElement} */
    const root = {
      id: "root",
      name: "Page",
      type: "frame",
      tag: "body",
      x: 0,
      y: 0,
      width: viewportWidth,
      height: Math.ceil(bodyNode.bounds.height),
      layoutMode: "NONE",
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      fills: bodyFills,
      strokes: [],
      effects: [],
      backgroundColor: bodyBgColor,
      backgroundGradient: null,
      textColor: colors.text,
      borderColor: null,
      borderWidth: 0,
      borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      boxShadow: null,
      fontFamily: pluginFont || "Montserrat",
      fontSize: 14,
      fontWeight: 400,
      lineHeight: "normal",
      letterSpacing: 0,
      textAlign: "left",
      textContent: "",
      opacity: 1,
      isPlaceholder: false,
      children: [],
    };

    // Process body's children
    const bodyChildIndices = childrenMap.get(bodyNode.index) || [];
    for (const childIdx of bodyChildIndices) {
      const childNode = nodes[childIdx];
      if (childNode) {
        const childElement = processNode(childNode, 1, 0, 0);
        if (childElement) {
          root.children.push(childElement);
        }
      }
    }

    console.log(`[CDP] Built tree with ${nodeIdCounter} nodes`);
    return root;
  } finally {
    await client.detach();
  }
}

module.exports = {
  extractDOMTreeWithCDP,
  createCDPClient,
};
