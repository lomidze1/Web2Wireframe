/** @jsx h */
import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { decode } from "@msgpack/msgpack";
import styles from "./AreaSelection.css";
import { useConfig } from "../../../shared/ConfigContext";
import ImportOptionsModal, {
  type UnifiedImportOptions,
} from "../../../components/modalPopup/ImportOptionsModal";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";
import { transformFramesData } from "../../../shared/transformData";
import { prepareFramesForRendering } from "../../../shared/absoluteModeRenderer";
import { useImportOptionsShortcut } from "../../../hooks/useImportOptionsShortcut";

// ============================================================================
// FIGMA-READY TYPES - matching Browser_Extension's shared/types.ts
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
interface FigmaColor {
  r: number;  // 0-1
  g: number;  // 0-1
  b: number;  // 0-1
  a: number;  // 0-1
}

/** Gradient stop */
interface FigmaGradientStop {
  color: FigmaColor;
  position: number;  // 0-1
  cssVariableName?: string;
}

/** Fill layer - supports solid, gradient, image placeholder */
interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_CONIC' | 'IMAGE_PLACEHOLDER';
  visible: boolean;
  opacity: number;
  blendMode?: string;
  // SOLID
  color?: FigmaColor;
  // GRADIENT_*
  angle?: number;  // degrees (0-360)
  stops?: FigmaGradientStop[];
  center?: { x: number; y: number };  // 0-1 (radial/conic)
  // IMAGE → placeholder
  isImagePlaceholder?: boolean;
}

/** Stroke layer - border */
interface FigmaStroke {
  color: FigmaColor;
  weight: number;
  position: 'INSIDE' | 'CENTER' | 'OUTSIDE';
  style: 'SOLID' | 'DASHED' | 'DOTTED';
  sides?: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}

/** Effect layer - shadow or blur */
interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  blurRadius?: number;
}

// ExtractedElement is imported from shared/absoluteModeRenderer.ts

// CSS Variable extracted from the page
interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value (might reference other vars)
  category?: string; // color, spacing, typography, etc.
}

// Detected colors from the page (matches Browser Extension)
interface DetectedColors {
  background: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  main: string;
  source: {
    totalElements: number;
    backgroundSamples: number;
    textSamples: number;
    accentSamples: number;
  };
}

// NEW multi-frame format from Browser Extension
interface MultiFrameCaptureResult {
  url: string;
  title: string;
  timestamp: number;
  frames: Array<{ viewport: { width: number; height: number }; tree: unknown; assets?: Record<string, string> }>;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
  detectedColors?: DetectedColors;
}

// LEGACY single-viewport format (Area Selection)
interface SingleViewportCaptureResult {
  url: string;
  title: string;
  timestamp: number;
  viewport: { width: number; height: number };
  options: {
    viewport: number;
    colorMode: "plugin" | "website";
    fontMode: "plugin" | "website" | "lines";
    textMode: "semantic" | "lorem" | "website";
    variableMode?: "preserve" | "resolve";
  };
  tree: unknown;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
}

// Unified type that supports both single and multi-frame data
interface UnifiedCaptureResult {
  url: string;
  title: string;
  timestamp: number;
  frames: Array<{ viewport: { width: number; height: number }; tree: unknown; assets?: Record<string, string> }>;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
  detectedColors?: DetectedColors;
}

/**
 * Convert any capture format to unified multi-frame format
 * Handles both new multi-frame format and legacy single-viewport format
 */
function toUnifiedFormat(data: MultiFrameCaptureResult | SingleViewportCaptureResult): UnifiedCaptureResult | null {
  // Check for new multi-frame format
  if ('frames' in data && Array.isArray(data.frames) && data.frames.length > 0) {
    const multiFrame = data as MultiFrameCaptureResult;
    return {
      url: multiFrame.url,
      title: multiFrame.title,
      timestamp: multiFrame.timestamp,
      frames: multiFrame.frames,
      fonts: multiFrame.fonts,
      assets: multiFrame.assets,
      stylesheets: multiFrame.stylesheets,
      cssVariables: multiFrame.cssVariables,
      detectedColors: multiFrame.detectedColors,
    };
  }

  // Check for legacy single-viewport format - convert to unified format
  if ('tree' in data && 'viewport' in data) {
    const singleViewport = data as SingleViewportCaptureResult;
    return {
      url: singleViewport.url,
      title: singleViewport.title,
      timestamp: singleViewport.timestamp,
      frames: [{
        viewport: singleViewport.viewport,
        tree: singleViewport.tree,
      }],
      fonts: singleViewport.fonts,
      assets: singleViewport.assets,
      stylesheets: singleViewport.stylesheets,
      cssVariables: singleViewport.cssVariables,
      // Legacy format doesn't have detectedColors
    };
  }

  return null;
}

// Import state
interface ImportState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

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

export default function AreaSelection() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  const [showImportOptionsModal, setShowImportOptionsModal] = useState(false);
  const [hasCssVariables, setHasCssVariables] = useState(false);
  const [pendingCaptureResult, setPendingCaptureResult] =
    useState<UnifiedCaptureResult | null>(null);
  // Font fallback modal state
  const [showFontModal, setShowFontModal] = useState(false);
  const [fontModalData, setFontModalData] = useState<{
    missingFonts: string[];
    defaultMapping: Record<string, string>;
    pluginFont: string;
    pluginFontOptions: string[];
  } | null>(null);
  // Rendering loader state
  const [showRenderingLoader, setShowRenderingLoader] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<RenderingProgress | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDataRef = useRef<File | null>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderingProgressRef = useRef<RenderingProgress | undefined>();
  const { config } = useConfig();
  const { shortcutMessage, shortcutKey } = useImportOptionsShortcut();

  // Listen for messages from Figma plugin main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "render-progress") {
        const { step, percent, isComplete } = msg.data;
        setRenderingProgress({ step, percent, isComplete });
        renderingProgressRef.current = { step, percent, isComplete };

        // Clear safety timeout — sandbox is responding
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }

        // When complete, show success state then close
        if (isComplete) {
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            renderingProgressRef.current = undefined;
            setImportState({ status: "idle", message: "" });
            setFileName(null);
            fileDataRef.current = null;
            setPendingCaptureResult(null);
            setHasCssVariables(false);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
            resetTimeoutRef.current = null;
          }, 10000); // Show success state for 10 seconds
        }
      }

      if (msg.type === "wireframe-created") {
        // Handled by render-progress with isComplete
      }

      if (msg.type === "fonts-not-available") {
        // Clear safety timeout — sandbox responded
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }
        setFontModalData(msg.data);
        setShowFontModal(true);
      }

      if (msg.type === "wireframe-error") {
        // Clear safety timeout
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
        renderingProgressRef.current = undefined;
        setImportState({
          status: "error",
          message: msg.data.error || "Failed to create wireframe",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

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
   * Process file and render wireframe(s)
   * Handles both single and multi-frame files
   */
  const processAndRender = (
    captureResult: UnifiedCaptureResult,
    options: UnifiedImportOptions
  ) => {
    // Cancel any pending reset from previous import
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    // Show the rendering loader
    setShowRenderingLoader(true);
    setRenderingProgress({
      step: "Preparing wireframe data...",
      percent: 0,
    });
    setImportState({ status: "loading", message: "" });

    // Transform text content based on textMode (lorem, semantic, or website)
    // This must happen BEFORE converting to wireframe nodes
    console.log("[W2W UI] Starting transformFramesData...");
    const transformedFrames = transformFramesData(
      captureResult.frames as unknown as Parameters<typeof transformFramesData>[0],
      {
        colorMode: options.colorMode,
        fontMode: options.fontMode,
        textMode: options.textMode,
      }
    );
    console.log("[W2W UI] transformFramesData done. Starting prepareFramesForRendering...");

    // Convert all frames to wireframe format using shared function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const framesData = prepareFramesForRendering(
      transformedFrames as any,
      {
        text: config.pluginColors.text,
        surface: config.pluginColors.surface,
      }
    );
    console.log("[W2W UI] prepareFramesForRendering done.");

    // Carry over assets from input frames to output frames
    const inputFrames = captureResult.frames;
    for (let i = 0; i < framesData.length; i++) {
      if (inputFrames[i]?.assets) {
        (framesData[i] as { assets?: Record<string, string> }).assets = inputFrames[i].assets;
      }
    }

    // Send to Figma main thread with all options
    console.log("[W2W UI] Sending render-wireframe, frames:", framesData.length,
      "data size ~", JSON.stringify(framesData).length, "chars");
    renderingProgressRef.current = { step: "Preparing wireframe data...", percent: 0 };
    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: framesData,
            sourceUrl: captureResult.url,
            pluginColors: config.pluginColors,
            pluginFont: config.pluginFont,
            cssVariables: captureResult.cssVariables || [],
            variableMode: options.cssVariablesMode,
            layoutMode: options.layoutMode,
            // Import mode options
            colorMode: options.colorMode,
            fontMode: options.fontMode,
            textMode: options.textMode,
            assetMode: options.assetMode,
          },
        },
      },
      "*"
    );

    // Safety timeout: if sandbox doesn't respond within 60s, assume failure
    // (e.g., postMessage data too large, sandbox crash without error message)
    renderTimeoutRef.current = setTimeout(() => {
      if (renderingProgressRef.current?.percent === 0) {
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
        renderingProgressRef.current = undefined;
        setImportState({
          status: "error",
          message: "Import timed out — the file may be too large. Try a simpler page.",
        });
      }
    }, 60000);
  };

  /**
   * Handle import options confirm from unified modal
   */
  const handleImportOptionsConfirm = (options: UnifiedImportOptions) => {
    setShowImportOptionsModal(false);
    if (pendingCaptureResult) {
      try {
        processAndRender(pendingCaptureResult, options);
      } catch (error) {
        console.error("Import error:", error);
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
        setImportState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to import file",
        });
      }
    }
  };

  /**
   * Handle font fallback choice from modal
   */
  const handleFontFallbackChoice = (choice: string, fontMapping: Record<string, string>) => {
    setShowFontModal(false);
    setFontModalData(null);
    parent.postMessage(
      {
        pluginMessage: {
          type: "font-fallback-choice",
          data: { choice, fontMapping },
        },
      },
      "*"
    );
  };

  /**
   * Handle import options cancel
   */
  const handleImportOptionsCancel = () => {
    setShowImportOptionsModal(false);
    setPendingCaptureResult(null);
    setHasCssVariables(false);
    setImportState({ status: "idle", message: "" });
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

      // Check file extension
      const fileName = fileDataRef.current.name.toLowerCase();

      let rawData: MultiFrameCaptureResult | SingleViewportCaptureResult;

      if (fileName.endsWith(".json")) {
        // JSON file - parse directly
        setImportState({ status: "loading", message: "Parsing JSON..." });
        const text = new TextDecoder().decode(arrayBuffer);
        rawData = JSON.parse(text);
      } else {
        // .w2w file - decompress and decode MessagePack
        setImportState({ status: "loading", message: "Decompressing..." });
        const decompressedData = await decompressGzip(arrayBuffer);

        setImportState({ status: "loading", message: "Decoding data..." });
        rawData = decode(decompressedData) as MultiFrameCaptureResult | SingleViewportCaptureResult;
      }

      // Convert to unified multi-frame format (handles both old single-viewport and new multi-frame format)
      const unifiedResult = toUnifiedFormat(rawData);
      if (!unifiedResult) {
        throw new Error("Invalid file format - expected wireframe data with tree structure");
      }

      // Check if CSS variables exist
      const hasCSSVars = Boolean(
        unifiedResult.cssVariables && unifiedResult.cssVariables.length > 0
      );
      setHasCssVariables(hasCSSVars);

      // Store result for processing
      setPendingCaptureResult(unifiedResult);

      // Check if we should show import options modal
      if (config.showImportOptions) {
        // Show unified import options modal
        setShowImportOptionsModal(true);
      } else {
        // Use defaults from config without showing modal
        processAndRender(unifiedResult, {
          colorMode: config.colorMode,
          fontMode: config.fontMode,
          textMode: config.textMode,
          cssVariablesMode: config.cssVariablesDefault,
          layoutMode: config.layoutModeDefault,
          assetMode: config.assetMode,
        });
      }
    } catch (error) {
      console.error("Import error:", error);
      setShowRenderingLoader(false);
      setRenderingProgress(undefined);
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

      {/* Shortcut Toast Message */}
      {shortcutMessage && (
        <div key={shortcutKey} class={styles.shortcutToast}>{shortcutMessage}</div>
      )}

      {/* Unified Import Options Modal */}
      <ImportOptionsModal
        isOpen={showImportOptionsModal}
        onConfirm={handleImportOptionsConfirm}
        onCancel={handleImportOptionsCancel}
        sourceUrl={pendingCaptureResult?.url}
        hasCssVariables={hasCssVariables}
      />

      {/* Font Fallback Modal */}
      <FontFallbackModal
        isOpen={showFontModal}
        missingFonts={fontModalData?.missingFonts || []}
        defaultMapping={fontModalData?.defaultMapping || {}}
        pluginFont={fontModalData?.pluginFont || "Montserrat"}
        pluginFontOptions={fontModalData?.pluginFontOptions || []}
        onChoice={handleFontFallbackChoice}
      />

      {/* Rendering Loader Overlay */}
      <RenderingLoader
        isVisible={showRenderingLoader}
        progress={renderingProgress}
        onClose={() => {
          setShowRenderingLoader(false);
          setRenderingProgress(undefined);
          setImportState({ status: "idle", message: "" });
          setFileName(null);
          fileDataRef.current = null;
          setPendingCaptureResult(null);
          setHasCssVariables(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
      />
    </div>
  );
}
