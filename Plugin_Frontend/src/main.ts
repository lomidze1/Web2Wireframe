import { showUI } from "@create-figma-plugin/utilities";
import { logger } from "./utils/logger";
import { errorHandler, ErrorCode } from "./utils/errorHandler";

// Types for nested wireframe data
interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;

  // Layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };

  // Style
  backgroundColor: string | null;
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number;
  opacity: number;

  // Text
  textContent: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: string;

  // Media
  isPlaceholder: boolean;

  // Nested children
  children: WireframeNode[];
}

interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
}

interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  localStyles?: object;
  pluginColors: {
    main: string;
    text: string;
    accent: string;
    surface: string;
    border: string;
    background: string;
  };
}

// Convert hex color to Figma RGB (0-1 range)
function hexToFigmaRGB(hex: string): RGB {
  if (!hex || hex === "transparent" || hex === "null") {
    return { r: 0.96, g: 0.96, b: 0.96 }; // Default light gray
  }

  const cleanHex = hex.replace("#", "");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);

  if (!result) {
    return { r: 0.96, g: 0.96, b: 0.96 };
  }

  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

// Create gallery icon for image/video placeholders
async function createGalleryIcon(size: number): Promise<FrameNode> {
  const iconFrame = figma.createFrame();
  iconFrame.name = "Gallery Icon";
  iconFrame.resize(size, size);
  iconFrame.fills = [];

  // Create simple gallery icon using rectangles
  const iconColor: RGB = { r: 0.6, g: 0.6, b: 0.6 };
  const strokeWeight = Math.max(2, size / 20);

  // Outer rectangle (image frame)
  const outerRect = figma.createRectangle();
  outerRect.resize(size * 0.8, size * 0.7);
  outerRect.x = size * 0.1;
  outerRect.y = size * 0.15;
  outerRect.fills = [];
  outerRect.strokes = [{ type: "SOLID", color: iconColor }];
  outerRect.strokeWeight = strokeWeight;
  outerRect.cornerRadius = size * 0.05;
  iconFrame.appendChild(outerRect);

  // Mountain shape (triangle)
  const mountain = figma.createPolygon();
  mountain.pointCount = 3;
  mountain.resize(size * 0.4, size * 0.25);
  mountain.x = size * 0.2;
  mountain.y = size * 0.5;
  mountain.fills = [{ type: "SOLID", color: iconColor }];
  iconFrame.appendChild(mountain);

  // Sun circle
  const sun = figma.createEllipse();
  sun.resize(size * 0.15, size * 0.15);
  sun.x = size * 0.6;
  sun.y = size * 0.25;
  sun.fills = [{ type: "SOLID", color: iconColor }];
  iconFrame.appendChild(sun);

  return iconFrame;
}

// Create placeholder for images/videos
async function createPlaceholder(
  node: WireframeNode,
  surfaceColor: string
): Promise<FrameNode> {
  const placeholder = figma.createFrame();
  placeholder.name = node.name || "Image Placeholder";
  placeholder.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Surface background color
  placeholder.fills = [
    {
      type: "SOLID",
      color: hexToFigmaRGB(surfaceColor),
    },
  ];

  // Border radius
  if (node.borderRadius > 0) {
    placeholder.cornerRadius = Math.min(
      node.borderRadius,
      Math.min(node.width, node.height) / 2
    );
  }

  // Add gallery icon in center
  const iconSize = Math.min(node.width, node.height) * 0.3;
  if (iconSize >= 20) {
    const icon = await createGalleryIcon(iconSize);
    icon.x = (node.width - iconSize) / 2;
    icon.y = (node.height - iconSize) / 2;
    placeholder.appendChild(icon);
  }

  return placeholder;
}

// Create text node
async function createTextNode(
  node: WireframeNode,
  fontFamily: string
): Promise<TextNode | null> {
  if (!node.textContent || node.textContent.trim() === "") {
    return null;
  }

  const textNode = figma.createText();

  // Load font
  let fontStyle = "Regular";
  if (node.fontWeight >= 600) {
    fontStyle = "Bold";
  } else if (node.fontWeight >= 500) {
    fontStyle = "Medium";
  }

  try {
    await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
    textNode.fontName = { family: fontFamily, style: fontStyle };
  } catch {
    try {
      await figma.loadFontAsync({ family: "Inter", style: fontStyle });
      textNode.fontName = { family: "Inter", style: fontStyle };
    } catch {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      textNode.fontName = { family: "Inter", style: "Regular" };
    }
  }

  textNode.characters = node.textContent;
  textNode.fontSize = Math.max(node.fontSize || 14, 8);

  // Text color
  if (node.textColor) {
    textNode.fills = [
      {
        type: "SOLID",
        color: hexToFigmaRGB(node.textColor),
      },
    ];
  }

  // Text alignment
  const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
    left: "LEFT",
    center: "CENTER",
    right: "RIGHT",
    justify: "JUSTIFIED",
    start: "LEFT",
    end: "RIGHT",
  };
  textNode.textAlignHorizontal = alignMap[node.textAlign] || "LEFT";

  // Set text box size
  textNode.resize(Math.max(node.width, 1), Math.max(node.height, 1));
  textNode.textAutoResize = "HEIGHT";

  return textNode;
}

// Recursively create Figma nodes from tree structure
async function createNodeInFigma(
  node: WireframeNode,
  pluginColors: RenderWireframeData["pluginColors"],
  fontFamily: string,
  depth: number = 0
): Promise<SceneNode | null> {
  // Depth limit to prevent infinite recursion
  if (depth > 20) {
    logger.warn("Max depth reached", { nodeId: node.id, depth });
    return null;
  }

  // Handle text nodes
  if (node.type === "text") {
    return await createTextNode(node, fontFamily);
  }

  // Handle placeholders (images/videos)
  if (node.type === "placeholder" || node.isPlaceholder) {
    return await createPlaceholder(node, pluginColors.surface);
  }

  // Create frame for containers
  const frame = figma.createFrame();
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout if detected
  if (node.layoutMode && node.layoutMode !== "NONE") {
    frame.layoutMode = node.layoutMode;
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";

    if (node.itemSpacing > 0) {
      frame.itemSpacing = node.itemSpacing;
    }

    if (node.padding) {
      frame.paddingTop = node.padding.top || 0;
      frame.paddingRight = node.padding.right || 0;
      frame.paddingBottom = node.padding.bottom || 0;
      frame.paddingLeft = node.padding.left || 0;
    }
  }

  // Apply background color
  if (node.backgroundColor) {
    frame.fills = [
      {
        type: "SOLID",
        color: hexToFigmaRGB(node.backgroundColor),
      },
    ];
  } else {
    frame.fills = [];
  }

  // Apply border/stroke
  if (node.borderWidth > 0 && node.borderColor) {
    frame.strokes = [
      {
        type: "SOLID",
        color: hexToFigmaRGB(node.borderColor),
      },
    ];
    frame.strokeWeight = node.borderWidth;
  }

  // Apply border radius
  if (node.borderRadius > 0) {
    frame.cornerRadius = Math.min(
      node.borderRadius,
      Math.min(node.width, node.height) / 2
    );
  }

  // Apply opacity
  if (node.opacity < 1 && node.opacity > 0) {
    frame.opacity = node.opacity;
  }

  // Clips content
  frame.clipsContent = true;

  // Recursively create children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      try {
        const childNode = await createNodeInFigma(
          child,
          pluginColors,
          fontFamily,
          depth + 1
        );

        if (childNode) {
          // Position child relative to parent
          childNode.x = child.x;
          childNode.y = child.y;
          frame.appendChild(childNode);
        }
      } catch (err) {
        logger.error("Error creating child node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  return frame;
}

// Create a single wireframe frame with nested structure
async function createWireframeFrame(
  frameData: WireframeFrame,
  sourceUrl: string,
  pluginColors: RenderWireframeData["pluginColors"],
  fontFamily: string,
  index: number
): Promise<FrameNode> {
  // Load required fonts
  try {
    await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    await figma.loadFontAsync({ family: fontFamily, style: "Medium" });
    await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  } catch {
    logger.warn("Failed to load custom fonts, using Inter", { fontFamily });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  }

  // Create main frame
  const wireframeFrame = figma.createFrame();

  // Extract hostname for naming
  let hostname = "website";
  try {
    hostname = new URL(sourceUrl).hostname.replace("www.", "");
  } catch {
    // Use default
  }

  wireframeFrame.name = `Wireframe - ${hostname} (${frameData.viewportWidth}px)`;
  wireframeFrame.resize(
    frameData.viewportWidth,
    Math.min(frameData.viewportHeight, 15000)
  );

  // Position: Viewport center + offset for multiple frames
  const viewport = figma.viewport.center;
  wireframeFrame.x =
    viewport.x - frameData.viewportWidth / 2 + index * (frameData.viewportWidth + 100);
  wireframeFrame.y = viewport.y - 200;

  // Set frame background
  wireframeFrame.fills = [
    {
      type: "SOLID",
      color: hexToFigmaRGB(pluginColors.background),
    },
  ];

  // Clip contents
  wireframeFrame.clipsContent = true;

  // Create nested structure from tree
  if (frameData.tree && frameData.tree.children) {
    for (const child of frameData.tree.children) {
      try {
        const childNode = await createNodeInFigma(
          child,
          pluginColors,
          fontFamily,
          1
        );

        if (childNode) {
          childNode.x = child.x;
          childNode.y = child.y;
          wireframeFrame.appendChild(childNode);
        }
      } catch (err) {
        logger.error("Error creating top-level node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  return wireframeFrame;
}

// Main plugin function
export default function () {
  showUI({ width: 400, height: 600 });

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Handle render-wireframe message
    if (msg.type === "render-wireframe") {
      const data = msg.data as RenderWireframeData;
      const { frames, sourceUrl, pluginColors } = data;

      // Default colors if not provided
      const colors = pluginColors || {
        main: "#1f3a5f",
        text: "#333333",
        accent: "#3b82f6",
        surface: "#f5f5f5",
        border: "#e0e0e0",
        background: "#ffffff",
      };

      // Default font
      const fontFamily = "Montserrat";

      if (!frames || frames.length === 0) {
        errorHandler.handle({
          code: ErrorCode.NO_DATA_RECEIVED,
          message: "No wireframe data received",
        });
        return;
      }

      logger.info("Creating wireframe", {
        frameCount: frames.length,
        sourceUrl,
      });
      figma.notify("Creating wireframe...", { timeout: 2000 });

      try {
        const createdFrames: FrameNode[] = [];

        for (let i = 0; i < frames.length; i++) {
          figma.notify(`Processing viewport ${i + 1}/${frames.length}...`, {
            timeout: 1000,
          });

          const wireframeFrame = await createWireframeFrame(
            frames[i],
            sourceUrl,
            colors,
            fontFamily,
            i
          );
          createdFrames.push(wireframeFrame);
        }

        // Select all created frames
        figma.currentPage.selection = createdFrames;

        // Zoom to fit created frames
        figma.viewport.scrollAndZoomIntoView(createdFrames);

        logger.info("Wireframe created successfully", {
          frameCount: createdFrames.length,
        });
        figma.notify(`Created ${createdFrames.length} wireframe frame(s)!`, {
          timeout: 3000,
        });

        // Send success message back to UI
        figma.ui.postMessage({
          type: "wireframe-created",
          data: {
            success: true,
            frameCount: createdFrames.length,
          },
        });
      } catch (error) {
        errorHandler.handle({
          code: ErrorCode.WIREFRAME_CREATION_FAILED,
          message: "Error creating wireframe",
          originalError: error,
          context: { sourceUrl, frameCount: frames.length },
        });

        // Send error message back to UI
        figma.ui.postMessage({
          type: "wireframe-error",
          data: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    // Handle open-wireframe message from Library
    if (msg.type === "open-wireframe") {
      logger.debug("Open wireframe requested", { data: msg.data });
      // TODO: Implement opening saved wireframes
    }

    // Handle community wireframe usage
    if (msg.type === "use-community-wireframe") {
      logger.debug("Use community wireframe requested", { data: msg.data });
      // TODO: Implement community wireframe insertion
    }
  };
}
