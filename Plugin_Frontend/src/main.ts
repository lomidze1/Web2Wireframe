import { showUI } from "@create-figma-plugin/utilities";

// Types for wireframe data
interface WireframeElement {
  id: number;
  type: "div" | "heading" | "text" | "image" | "video" | "icon";
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textAlign: string;
  opacity: number;
  content: string;
  isMediaPlaceholder?: boolean;
}

interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  backgroundColor: string;
  elements: WireframeElement[];
}

interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  localStyles?: object;
  pluginMainColor: string;
}

// Convert hex color to Figma RGB (0-1 range)
function hexToFigmaRGB(hex: string): RGB {
  // Handle transparent
  if (!hex || hex === "transparent") {
    return { r: 0, g: 0, b: 0 };
  }

  // Remove # if present
  const cleanHex = hex.replace("#", "");

  // Parse hex values
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

// Create image/video placeholder with X lines
async function createMediaPlaceholder(
  element: WireframeElement,
  pluginMainColor: string
): Promise<GroupNode> {
  const group = figma.group([], figma.currentPage);
  group.name = element.type === "image" ? "Image Placeholder" : "Video Placeholder";

  // Create background rectangle
  const rect = figma.createRectangle();
  rect.x = element.x;
  rect.y = element.y;
  rect.resize(element.width, element.height);
  rect.name = "Background";

  // Set fill color
  const bgColor = hexToFigmaRGB(pluginMainColor);
  rect.fills = [{ type: "SOLID", color: bgColor }];

  // Apply border radius if present
  if (element.borderRadius > 0) {
    rect.cornerRadius = Math.min(element.borderRadius, Math.min(element.width, element.height) / 2);
  }

  group.appendChild(rect);

  // Create X lines (diagonal cross)
  const lineColor: RGB = { r: 1, g: 1, b: 1 }; // White lines
  const lineOpacity = 0.5;

  // Line 1: Top-left to bottom-right
  const line1 = figma.createLine();
  line1.x = element.x;
  line1.y = element.y;
  line1.resize(Math.sqrt(element.width ** 2 + element.height ** 2), 0);
  line1.rotation = -Math.atan2(element.height, element.width) * (180 / Math.PI);
  line1.strokes = [{ type: "SOLID", color: lineColor }];
  line1.strokeWeight = 1;
  line1.opacity = lineOpacity;
  line1.name = "X Line 1";

  // Line 2: Top-right to bottom-left
  const line2 = figma.createLine();
  line2.x = element.x + element.width;
  line2.y = element.y;
  line2.resize(Math.sqrt(element.width ** 2 + element.height ** 2), 0);
  line2.rotation = 180 + Math.atan2(element.height, element.width) * (180 / Math.PI);
  line2.strokes = [{ type: "SOLID", color: lineColor }];
  line2.strokeWeight = 1;
  line2.opacity = lineOpacity;
  line2.name = "X Line 2";

  group.appendChild(line1);
  group.appendChild(line2);

  return group;
}

// Create a single wireframe frame with all elements
async function createWireframeFrame(
  frame: WireframeFrame,
  sourceUrl: string,
  pluginMainColor: string,
  index: number
): Promise<FrameNode> {
  // Load required fonts
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  } catch (e) {
    console.error("Failed to load Inter fonts, using fallback");
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

  wireframeFrame.name = `Wireframe - ${hostname} (${frame.viewportWidth}px)`;
  wireframeFrame.resize(frame.viewportWidth, Math.min(frame.viewportHeight, 10000));

  // Position: Viewport center + 100px offset
  const viewport = figma.viewport.center;
  wireframeFrame.x = viewport.x - frame.viewportWidth / 2 + index * (frame.viewportWidth + 50);
  wireframeFrame.y = viewport.y + 100;

  // Set frame background
  wireframeFrame.fills = [
    {
      type: "SOLID",
      color: hexToFigmaRGB(frame.backgroundColor || "#ffffff"),
    },
  ];

  // Clip contents
  wireframeFrame.clipsContent = true;

  // Create elements
  for (const element of frame.elements) {
    try {
      // Skip elements outside frame bounds
      if (element.y > frame.viewportHeight || element.x > frame.viewportWidth) {
        continue;
      }

      // Handle media placeholders (image/video)
      if (element.isMediaPlaceholder || element.type === "image" || element.type === "video") {
        const placeholder = await createMediaPlaceholder(element, pluginMainColor);
        // Move elements relative to frame
        for (const child of placeholder.children) {
          child.x -= wireframeFrame.x;
          child.y -= wireframeFrame.y;
        }
        // Ungroup and add children to frame
        for (const child of [...placeholder.children]) {
          wireframeFrame.appendChild(child);
        }
        placeholder.remove();
        continue;
      }

      // Handle text elements (heading, text)
      if (element.type === "heading" || element.type === "text") {
        if (!element.content || element.content.trim() === "") continue;

        const textNode = figma.createText();
        textNode.x = element.x;
        textNode.y = element.y;

        // Set text content
        textNode.characters = element.content;

        // Apply font style
        let fontStyle = "Regular";
        if (element.fontWeight >= 600) {
          fontStyle = "Bold";
        } else if (element.fontWeight >= 500) {
          fontStyle = "Medium";
        }

        try {
          textNode.fontName = { family: "Inter", style: fontStyle };
        } catch {
          textNode.fontName = { family: "Inter", style: "Regular" };
        }

        textNode.fontSize = Math.max(element.fontSize || 14, 8);

        // Set text color
        if (element.textColor && element.textColor !== "transparent") {
          textNode.fills = [
            {
              type: "SOLID",
              color: hexToFigmaRGB(element.textColor),
            },
          ];
        }

        // Set text alignment
        const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
          left: "LEFT",
          center: "CENTER",
          right: "RIGHT",
          justify: "JUSTIFIED",
          start: "LEFT",
          end: "RIGHT",
        };
        textNode.textAlignHorizontal = alignMap[element.textAlign] || "LEFT";

        // Set text box size (for wrapping)
        textNode.resize(element.width, element.height);
        textNode.textAutoResize = "HEIGHT";

        wireframeFrame.appendChild(textNode);
        continue;
      }

      // Handle div/icon/other elements as rectangles
      const rectNode = figma.createRectangle();
      rectNode.x = element.x;
      rectNode.y = element.y;
      rectNode.resize(Math.max(element.width, 1), Math.max(element.height, 1));
      rectNode.name = element.type.charAt(0).toUpperCase() + element.type.slice(1);

      // Set background fill
      if (element.backgroundColor && element.backgroundColor !== "transparent") {
        rectNode.fills = [
          {
            type: "SOLID",
            color: hexToFigmaRGB(element.backgroundColor),
          },
        ];
      } else {
        rectNode.fills = [];
      }

      // Set border/stroke
      if (element.borderWidth > 0 && element.borderColor && element.borderColor !== "transparent") {
        rectNode.strokes = [
          {
            type: "SOLID",
            color: hexToFigmaRGB(element.borderColor),
          },
        ];
        rectNode.strokeWeight = element.borderWidth;
      }

      // Set border radius
      if (element.borderRadius > 0) {
        rectNode.cornerRadius = Math.min(
          element.borderRadius,
          Math.min(element.width, element.height) / 2
        );
      }

      // Set opacity
      if (element.opacity < 1 && element.opacity > 0) {
        rectNode.opacity = element.opacity;
      }

      wireframeFrame.appendChild(rectNode);
    } catch (err) {
      console.error("Error creating element:", element.type, err);
    }
  }

  return wireframeFrame;
}

// Main plugin function
export default function () {
  showUI({ width: 400, height: 600 });

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Handle render-wireframe message from Web.tsx
    // Note: When UI sends parent.postMessage({ pluginMessage: {...} }, "*"),
    // Figma receives msg = the pluginMessage content directly
    if (msg.type === "render-wireframe") {
      const data = msg.data as RenderWireframeData;
      const { frames, sourceUrl, pluginMainColor } = data;

      if (!frames || frames.length === 0) {
        figma.notify("No wireframe data received", { error: true });
        return;
      }

      figma.notify("Creating wireframe...", { timeout: 2000 });

      try {
        const createdFrames: FrameNode[] = [];

        for (let i = 0; i < frames.length; i++) {
          const wireframeFrame = await createWireframeFrame(
            frames[i],
            sourceUrl,
            pluginMainColor || "#1f3a5f",
            i
          );
          createdFrames.push(wireframeFrame);
        }

        // Select all created frames
        figma.currentPage.selection = createdFrames;

        // Zoom to fit created frames
        figma.viewport.scrollAndZoomIntoView(createdFrames);

        figma.notify(`Created ${createdFrames.length} wireframe frame(s)!`, {
          timeout: 3000,
        });
      } catch (error) {
        console.error("Wireframe creation error:", error);
        figma.notify("Error creating wireframe", { error: true });
      }
    }

    // Handle open-wireframe message from Library
    if (msg.type === "open-wireframe") {
      console.log("Open wireframe:", msg.data);
      // TODO: Implement opening saved wireframes
    }

    // Handle community wireframe usage
    if (msg.type === "use-community-wireframe") {
      console.log("Use community wireframe:", msg.data);
      // TODO: Implement community wireframe insertion
    }
  };
}
