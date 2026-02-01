/** @jsx h */
import { h } from "preact";
import { useState, useRef } from "preact/hooks";
import { decode } from "@msgpack/msgpack";
import styles from "./AreaSelection.css";
import { useConfig } from "../../../shared/ConfigContext";
import VariablesChoiceModal, {
  type VariableMode,
} from "../../../components/modalPopup/VariablesChoiceModal";

// Types matching Browser_Extension's CaptureResult
interface ExtractedElement {
  id: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string | null;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  boxShadow: string | null;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
  textAlign: string;
  textContent: string;
  opacity: number;
  isPlaceholder: boolean;
  children: ExtractedElement[];
}

// CSS Variable extracted from the page
interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value (might reference other vars)
  category?: string; // color, spacing, typography, etc.
}

interface CaptureResult {
  url: string;
  title: string;
  timestamp: number;
  viewport: { width: number; height: number };
  options: {
    viewport: number;
    colorMode: "plugin" | "website";
    fontMode: "plugin" | "website";
    textMode: "semantic" | "lorem" | "website";
    variableMode?: "preserve" | "resolve";
  };
  tree: ExtractedElement;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
}

// WireframeNode format expected by main.ts
interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number;
  opacity: number;
  textContent: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: string;
  isPlaceholder: boolean;
  children: WireframeNode[];
}

// Import state
interface ImportState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

// Text tags that are primarily text content
const TEXT_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "li",
  "label",
  "button",
  "strong",
  "em",
  "b",
  "i",
  "small",
];

/**
 * Decompress gzip data using DecompressionStream
 */
async function decompressGzip(compressedData: ArrayBuffer): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(compressedData));
      controller.close();
    },
  });

  const decompressedStream = stream.pipeThrough(
    new DecompressionStream("gzip")
  );
  const response = new Response(decompressedStream);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Convert ExtractedElement to WireframeNode format
 */
function convertToWireframeNode(
  element: ExtractedElement,
  pluginColors: { text: string; surface: string }
): WireframeNode {
  // Use the type already set by the Extension (CDP extraction sets this correctly)
  // Fallback logic only if type is not set
  let type: "frame" | "text" | "placeholder" = element.type || "frame";

  // If type wasn't set, try to determine it (fallback for legacy data)
  if (!element.type) {
    if (element.isPlaceholder) {
      type = "placeholder";
    } else if (TEXT_TAGS.includes(element.tag) && element.textContent) {
      type = "text";
    }
  }

  // Calculate average border radius
  const avgRadius = element.borderRadius
    ? Math.round(
        (element.borderRadius.topLeft +
          element.borderRadius.topRight +
          element.borderRadius.bottomRight +
          element.borderRadius.bottomLeft) /
          4
      )
    : 0;

  // Recursively convert children
  const children = element.children.map((child) =>
    convertToWireframeNode(child, pluginColors)
  );

  return {
    id: element.id,
    name: element.name || element.tag,
    type,
    tag: element.tag,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    layoutMode: element.layoutMode,
    itemSpacing: element.itemSpacing || 0,
    padding: element.padding || { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: element.backgroundColor,
    backgroundGradient: element.backgroundGradient,
    textColor: element.textColor || pluginColors.text,
    borderColor: element.borderColor,
    borderWidth: element.borderWidth || 0,
    borderRadius: avgRadius,
    opacity: element.opacity ?? 1,
    textContent: element.textContent || "",
    fontSize: element.fontSize || 14,
    fontWeight: element.fontWeight || 400,
    fontFamily: element.fontFamily || "Inter",
    textAlign: element.textAlign || "left",
    isPlaceholder: element.isPlaceholder,
    children,
  };
}

export default function AreaSelection() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [pendingCaptureResult, setPendingCaptureResult] =
    useState<CaptureResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDataRef = useRef<File | null>(null);
  const { config } = useConfig();

  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      setFileName(file.name);
      fileDataRef.current = file;
      setImportState({ status: "idle", message: "" });
    }
  };

  const handleBrowse = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  /**
   * Process file and render wireframe
   */
  const processAndRender = (
    captureResult: CaptureResult,
    variableMode: VariableMode
  ) => {
    setImportState({ status: "loading", message: "Creating wireframe..." });

    const wireframeTree = convertToWireframeNode(captureResult.tree, {
      text: config.pluginColors.text,
      surface: config.pluginColors.surface,
    });

    // Build frame data
    const frameData = {
      viewportWidth: captureResult.viewport.width,
      viewportHeight: captureResult.viewport.height,
      tree: wireframeTree,
    };

    // Send to Figma main thread with variable mode
    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: [frameData],
            sourceUrl: captureResult.url,
            pluginColors: config.pluginColors,
            cssVariables: captureResult.cssVariables || [],
            variableMode, // "styles" or "direct"
          },
        },
      },
      "*"
    );

    setImportState({
      status: "success",
      message: "Wireframe created successfully!",
    });

    // Reset after success
    setTimeout(() => {
      setImportState({ status: "idle", message: "" });
      setFileName(null);
      fileDataRef.current = null;
      setPendingCaptureResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, 3000);
  };

  /**
   * Handle variable mode choice from modal
   */
  const handleVariableChoice = (mode: VariableMode) => {
    setShowVariablesModal(false);
    if (pendingCaptureResult) {
      processAndRender(pendingCaptureResult, mode);
    }
  };

  const handleGenerate = async () => {
    if (!fileDataRef.current) {
      setImportState({ status: "error", message: "No file selected" });
      return;
    }

    setImportState({ status: "loading", message: "Processing file..." });

    try {
      // 1. Read file as ArrayBuffer
      const arrayBuffer = await fileDataRef.current.arrayBuffer();

      let captureResult: CaptureResult;

      // Check file extension
      const fileName = fileDataRef.current.name.toLowerCase();

      if (fileName.endsWith(".json")) {
        // JSON file - parse directly
        setImportState({ status: "loading", message: "Parsing JSON..." });
        const text = new TextDecoder().decode(arrayBuffer);
        captureResult = JSON.parse(text) as CaptureResult;
      } else {
        // .w2w file - decompress and decode MessagePack
        setImportState({ status: "loading", message: "Decompressing..." });
        const decompressedData = await decompressGzip(arrayBuffer);

        setImportState({ status: "loading", message: "Decoding data..." });
        captureResult = decode(decompressedData) as CaptureResult;
      }

      if (!captureResult || !captureResult.tree) {
        throw new Error("Invalid file format");
      }

      // Check if CSS variables exist
      const hasCSSVariables =
        captureResult.cssVariables && captureResult.cssVariables.length > 0;

      if (hasCSSVariables) {
        // Show modal for user to choose
        setPendingCaptureResult(captureResult);
        setShowVariablesModal(true);
      } else {
        // No CSS variables - proceed directly with "direct" mode
        processAndRender(captureResult, "direct");
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to import file",
      });
    }
  };

  // Open extension install page
  const handleInstallExtension = () => {
    window.open("https://chrome.google.com/webstore", "_blank");
  };

  const isDisabled = !fileName || importState.status === "loading";

  return (
    <div class={styles.areaSection}>
      {/* Title & Instructions */}
      <div>
        <div class={styles.areaTitle}>AREA SELECTION</div>
        <ul class={styles.areaBullets}>
          <li>
            Install our browser extension (Chrome/Edge)
            <button
              class={styles.installInlineBtn}
              onClick={handleInstallExtension}
            >
              Install
            </button>
          </li>
          <li>Select a specific region on any webpage via extension</li>
          <li>Download the generated .w2w file</li>
          <li>Upload the file here to convert it into a wireframe</li>
        </ul>
      </div>

      {/* Upload Area */}
      <div class={styles.areaUpload}>
        <div class={styles.uploadIcon}>⬚</div>
        <div class={styles.uploadCopy}>
          <div class={styles.uploadText}>
            {fileName ? fileName : "Drag-and-drop your .w2w or .json file"}
          </div>
          <div class={styles.uploadSubtext}>or select from your computer</div>
          <div class={styles.uploadActions}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".w2w,.json"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <button
              class={styles.uploadBtn}
              onClick={handleBrowse}
              disabled={importState.status === "loading"}
            >
              Browse
            </button>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {importState.message && (
        <div
          class={`${styles.statusMessage} ${
            importState.status === "loading"
              ? styles.loading
              : importState.status === "success"
                ? styles.success
                : importState.status === "error"
                  ? styles.error
                  : ""
          }`}
        >
          {importState.status === "loading" && (
            <span class={styles.spinner}></span>
          )}
          <span>{importState.message}</span>
        </div>
      )}

      {/* Generate Button */}
      <button
        class={styles.areaGenerate}
        onClick={handleGenerate}
        disabled={isDisabled}
      >
        {importState.status === "loading"
          ? "Processing..."
          : "Generate Wireframe"}
      </button>

      {/* CSS Variables Choice Modal */}
      <VariablesChoiceModal
        isOpen={showVariablesModal}
        onChoice={handleVariableChoice}
      />
    </div>
  );
}
