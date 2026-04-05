/**
 * Pseudo-state variant creation for Figma
 * Converts captured CSS pseudo-state diffs (hover/focus/active/focus-visible)
 * into Figma ComponentSet variants with prototype interactions.
 */

import { cssColorToFigmaRGB } from "./colors";

// ============================================================================
// Types
// ============================================================================

export interface PseudoStateStyles {
  hover?: Record<string, string>;
  focus?: Record<string, string>;
  active?: Record<string, string>;
  focusVisible?: Record<string, string>;
}

/** Maps pseudo-state key to Figma variant display name */
const STATE_DISPLAY_NAMES: Record<string, string> = {
  hover: "State=Hover",
  focus: "State=Focus",
  active: "State=Active",
  focusVisible: "State=Focus Visible",
};

/** Maps pseudo-state key to Figma trigger type */
const STATE_TRIGGERS: Record<string, { type: string }> = {
  hover: { type: "ON_HOVER" },
  active: { type: "ON_PRESS" },
  focus: { type: "ON_CLICK" },
  focusVisible: { type: "ON_CLICK" },
};

// ============================================================================
// CSS Diff → Figma Property Application
// ============================================================================

/**
 * Apply a CSS property diff to a Figma FrameNode (or ComponentNode).
 * Mutates the node in-place.
 */
export function applyCssDiffToNode(
  frame: FrameNode | ComponentNode,
  diff: Record<string, string>
): void {
  for (const [prop, value] of Object.entries(diff)) {
    if (value === "__removed__") {
      applyRemovedProperty(frame, prop);
      continue;
    }

    switch (prop) {
      case "background-color":
      case "background": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.fills = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
        }
        break;
      }

      case "border-color": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.strokes = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
        }
        break;
      }

      case "color": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          const textNodes = frame.findAll(
            (n) => n.type === "TEXT"
          ) as TextNode[];
          for (const textNode of textNodes) {
            textNode.fills = [
              {
                type: "SOLID",
                color: parsed.color,
                opacity: parsed.opacity,
              },
            ];
          }
        }
        break;
      }

      case "opacity": {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          frame.opacity = Math.max(0, Math.min(1, num));
        }
        break;
      }

      case "border-radius": {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const maxRadius = Math.min(frame.width, frame.height) / 2;
          frame.cornerRadius = Math.min(num, maxRadius);
        }
        break;
      }

      case "border-width": {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          frame.strokeWeight = Math.max(0, num);
        }
        break;
      }

      case "box-shadow": {
        const effect = parseBoxShadow(value);
        if (effect) {
          frame.effects = [effect];
        }
        break;
      }

      case "outline-color": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.strokes = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
          frame.strokeAlign = "OUTSIDE";
        }
        break;
      }

      case "text-decoration":
      case "text-decoration-line": {
        const textNodes = frame.findAll(
          (n) => n.type === "TEXT"
        ) as TextNode[];
        for (const textNode of textNodes) {
          if (value.includes("underline")) {
            textNode.textDecoration = "UNDERLINE";
          } else if (value.includes("line-through")) {
            textNode.textDecoration = "STRIKETHROUGH";
          } else if (value === "none") {
            textNode.textDecoration = "NONE";
          }
        }
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Handle __removed__ marker — reset property to default
 */
function applyRemovedProperty(
  frame: FrameNode | ComponentNode,
  prop: string
): void {
  switch (prop) {
    case "background-color":
    case "background":
      frame.fills = [];
      break;
    case "border-color":
      frame.strokes = [];
      break;
    case "box-shadow":
      frame.effects = [];
      break;
    case "opacity":
      frame.opacity = 1;
      break;
    default:
      break;
  }
}

/**
 * Parse CSS box-shadow string into a Figma DROP_SHADOW effect.
 * Handles format: "Xpx Ypx Rpx [Spx] color"
 */
function parseBoxShadow(shadow: string): Effect | null {
  const match = shadow.match(
    /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s*(?:([\d.]+)px\s+)?(.*)/
  );
  if (!match) return null;

  const [, xStr, yStr, blurStr, spreadStr, colorStr] = match;
  const parsed = cssColorToFigmaRGB(colorStr.trim());
  if (!parsed) return null;

  return {
    type: "DROP_SHADOW",
    visible: true,
    color: {
      r: parsed.color.r,
      g: parsed.color.g,
      b: parsed.color.b,
      a: parsed.opacity,
    },
    offset: { x: parseFloat(xStr), y: parseFloat(yStr) },
    radius: parseFloat(blurStr),
    spread: spreadStr ? parseFloat(spreadStr) : 0,
    blendMode: "NORMAL",
  };
}

// ============================================================================
// Variant Creation
// ============================================================================

/**
 * Convert a rendered FrameNode into a ComponentSet with pseudo-state variants.
 * Returns the ComponentSetNode and a default InstanceNode to place in the tree.
 */
export async function createPseudoStateVariants(
  frame: FrameNode,
  pseudoStates: PseudoStateStyles
): Promise<{
  componentSet: ComponentSetNode;
  defaultInstance: InstanceNode;
}> {
  const activeStates = Object.entries(pseudoStates).filter(
    ([, diff]) => diff && Object.keys(diff).length > 0
  );

  if (activeStates.length === 0) {
    throw new Error("No active pseudo-states to create variants for");
  }

  // Step 1: Create default component from the frame
  const defaultComp = figma.createComponent();
  defaultComp.name = "State=Default";
  defaultComp.resize(frame.width, frame.height);

  // Copy visual properties from frame to component
  copyFrameProperties(frame, defaultComp);

  // Move children from frame to component
  while (frame.children.length > 0) {
    defaultComp.appendChild(frame.children[0]);
  }

  // Step 2: Create variant components for each active state
  const variants = new Map<string, ComponentNode>();
  const allComponents: ComponentNode[] = [defaultComp];

  for (const [stateKey, diff] of activeStates) {
    const variantComp = defaultComp.clone();
    variantComp.name = STATE_DISPLAY_NAMES[stateKey] || `State=${stateKey}`;

    // Apply the CSS diff to the variant
    applyCssDiffToNode(variantComp, diff!);

    variants.set(stateKey, variantComp);
    allComponents.push(variantComp);
  }

  // Step 3: Combine into ComponentSet (on page level — will be moved to Components Section later)
  const componentSet = figma.combineAsVariants(
    allComponents,
    figma.currentPage as BaseNode & ChildrenMixin
  );
  componentSet.name = frame.name || "Interactive Element";

  // Step 4: Wire prototype interactions
  await wirePrototypeInteractions(defaultComp, variants);

  // Step 5: Create an instance to place in the wireframe
  const defaultInstance = defaultComp.createInstance();
  defaultInstance.resize(frame.width, frame.height);

  // Clean up original frame
  frame.remove();

  return { componentSet, defaultInstance };
}

/**
 * Copy visual properties from source frame to target frame/component
 */
function copyFrameProperties(
  source: FrameNode,
  target: FrameNode | ComponentNode
): void {
  target.fills = JSON.parse(JSON.stringify(source.fills));
  target.strokes = JSON.parse(JSON.stringify(source.strokes));
  target.effects = JSON.parse(JSON.stringify(source.effects));

  target.opacity = source.opacity;
  target.cornerRadius = source.cornerRadius;
  target.strokeWeight = source.strokeWeight;
  target.strokeAlign = source.strokeAlign;
  target.clipsContent = source.clipsContent;

  if (source.layoutMode !== "NONE") {
    target.layoutMode = source.layoutMode;
    target.primaryAxisSizingMode = source.primaryAxisSizingMode;
    target.counterAxisSizingMode = source.counterAxisSizingMode;
    target.paddingTop = source.paddingTop;
    target.paddingRight = source.paddingRight;
    target.paddingBottom = source.paddingBottom;
    target.paddingLeft = source.paddingLeft;
    target.itemSpacing = source.itemSpacing;
    target.primaryAxisAlignItems = source.primaryAxisAlignItems;
    target.counterAxisAlignItems = source.counterAxisAlignItems;
  }
}

// ============================================================================
// Prototype Interaction Wiring
// ============================================================================

/**
 * Wire prototype interactions on the default component.
 * - hover → ON_HOVER (auto-reverts, like CSS :hover)
 * - active → ON_PRESS (auto-reverts, like CSS :active)
 * - focus → ON_CLICK (CHANGE_TO)
 * - focusVisible → ON_CLICK (CHANGE_TO)
 */
export async function wirePrototypeInteractions(
  defaultComp: ComponentNode,
  variants: Map<string, ComponentNode>
): Promise<void> {
  const reactions: Reaction[] = [];

  const entries = Array.from(variants.entries());
  for (const [stateKey, variantComp] of entries) {
    const triggerDef = STATE_TRIGGERS[stateKey];
    if (!triggerDef) continue;

    const transition: Transition = {
      type: "SMART_ANIMATE",
      duration: stateKey === "active" ? 0.1 : 0.15,
      easing: { type: "EASE_OUT" },
    };

    reactions.push({
      trigger: triggerDef as Trigger,
      actions: [
        {
          type: "NODE",
          destinationId: variantComp.id,
          navigation: "CHANGE_TO",
          transition,
          preserveScrollPosition: false,
        },
      ],
    });
  }

  if (reactions.length > 0) {
    await defaultComp.setReactionsAsync(reactions);
  }
}
