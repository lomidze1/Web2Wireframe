/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import styles from "./BrowserExtension.css";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import { buildFontDownloads } from "../../../../utils/fontDownload";
import { transformFramesData } from "../../../shared/transformData";
import { prepareFramesForRendering, type ExtractedElement } from "../../../shared/absoluteModeRenderer";
import { useConfig } from "../../../shared/ConfigContext";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";

// Backend API URL
const API_URL = "http://localhost:3002";

// Poll interval in milliseconds
const POLL_INTERVAL = 2000;

// Import state type
interface ImportState {
  status: "idle" | "waiting" | "importing" | "success" | "error";
  message: string;
}

// Pending data from Browser Extension
interface PendingData {
  importId: string;
  sourceUrl: string;
  title?: string;
  viewports: number[];
  frameCount: number;
  wireframeData: { frames: unknown[] };
  localStyles?: unknown;
  fonts?: unknown[];
  cssVariables?: unknown[];
}

export default function BrowserExtension() {
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  const [pendingData, setPendingData] = useState<PendingData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  // Rendering loader state
  const [showRenderingLoader, setShowRenderingLoader] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<RenderingProgress | undefined>();
  // Font fallback modal state
  const [showFontModal, setShowFontModal] = useState(false);
  const [fontModalData, setFontModalData] = useState<{
    missingFonts: string[];
    defaultMapping: Record<string, string>;
    pluginFont: string;
    pluginFontOptions: string[];
  } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { config } = useConfig();

  /**
   * Check for pending imports from Browser Extension
   */
  const checkForPendingImport = async () => {
    try {
      const response = await fetch(`${API_URL}/api/pending-import`);
      const data = await response.json();

      if (data.success && data.hasPending) {
        // Found pending data!
        const newPendingData = {
          importId: data.importId,
          sourceUrl: data.sourceUrl,
          title: data.title,
          viewports: data.viewports,
          frameCount: data.frameCount,
          wireframeData: data.wireframeData,
          localStyles: data.localStyles,
          fonts: data.fonts,
          cssVariables: data.cssVariables,
        };
        setPendingData(newPendingData);

        // Stop polling
        stopPolling();

        // Render directly with default config settings (no modal)
        setImportState({ status: "importing", message: "Creating wireframe..." });
        const transformedFrames = transformFramesData(
          newPendingData.wireframeData.frames as Parameters<typeof transformFramesData>[0],
          {
            colorMode: config.colorMode,
            fontMode: config.fontMode,
            textMode: config.textMode,
          }
        );
        sendToFigma(transformedFrames, newPendingData);
      }
    } catch (error) {
      console.error("Error checking for pending import:", error);
      // Don't show error to user, just continue polling
    }
  };

  /**
   * Start polling for pending imports
   */
  const startPolling = () => {
    if (pollIntervalRef.current) return;

    setIsPolling(true);
    setImportState({
      status: "waiting",
      message: "Waiting for Browser Extension capture...",
    });

    // Check immediately
    checkForPendingImport();

    // Then poll periodically
    pollIntervalRef.current = setInterval(checkForPendingImport, POLL_INTERVAL);
  };

  /**
   * Stop polling
   */
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => stopPolling();
  }, []);

  /**
   * Listen for messages from Figma plugin main thread
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "render-progress") {
        const { step, percent, isComplete } = msg.data;
        setRenderingProgress({ step, percent, isComplete });

        // When complete, show success state then close
        if (isComplete) {
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            setImportState({ status: "idle", message: "" });
            setPendingData(null);
            resetTimeoutRef.current = null;
          }, 10000); // Show success state for 10 seconds
        }
      }

      if (msg.type === "wireframe-created") {
        // Handled by render-progress with isComplete
      }

      if (msg.type === "fonts-not-available") {
        setFontModalData(msg.data);
        setShowFontModal(true);
      }

      if (msg.type === "wireframe-error") {
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
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
   * Send wireframe data to Figma with default config settings
   */
  const sendToFigma = (
    frames: unknown[],
    data: PendingData,
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

    // Convert frames to WireframeNode format using shared unified function
    const inputFrames = frames as { viewport: { width: number; height: number }; tree: ExtractedElement; assets?: Record<string, string> }[];
    const framesData = prepareFramesForRendering(
      inputFrames,
      {
        text: config.pluginColors.text,
        surface: config.pluginColors.surface,
      }
    );

    // Carry over assets from input frames to output frames
    for (let i = 0; i < framesData.length; i++) {
      if (inputFrames[i]?.assets) {
        (framesData[i] as { assets?: Record<string, string> }).assets = inputFrames[i].assets;
      }
    }

    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: framesData,
            sourceUrl: data.sourceUrl,
            localStyles: data.localStyles,
            pluginColors: config.pluginColors,
            pluginFont: config.pluginFont,
            cssVariables: data.cssVariables || [],
            variableMode: config.cssVariablesDefault,
            layoutMode: config.layoutModeDefault,
            colorMode: config.colorMode,
            fontMode: config.fontMode,
            textMode: config.textMode,
            assetMode: config.assetMode,
            interactionMode: config.interactionMode,
          },
        },
      },
      "*"
    );
  };

  /**
   * Open extension install page
   */
  const handleInstall = () => {
    window.open("https://chrome.google.com/webstore", "_blank");
  };

  // Render based on state
  if (importState.status === "waiting") {
    return (
      <div class={styles.extensionContainer}>
        <div class={styles.extensionTitle}>Waiting for Capture</div>

        <div class={styles.extensionDescription}>
          <span class={styles.spinner}></span>
          {importState.message}
        </div>

        <div class={styles.extensionBenefits}>
          <ul>
            <li>Open the website in Chrome</li>
            <li>Click the Web2Wireframe extension icon</li>
            <li>Select viewports and click "Capture"</li>
            <li>Click "Send to Figma"</li>
          </ul>
        </div>

        <button
          class={`${styles.extensionBtn} ${styles.extensionBtnSecondary}`}
          onClick={stopPolling}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (importState.status === "success") {
    return (
      <div class={styles.extensionContainer}>
        <div class={styles.extensionTitle}>Success!</div>
        <div class={styles.extensionDescription}>{importState.message}</div>
      </div>
    );
  }

  if (importState.status === "error") {
    return (
      <div class={styles.extensionContainer}>
        <div class={styles.extensionTitle}>Error</div>
        <div class={styles.extensionDescription}>{importState.message}</div>
        <button class={styles.extensionBtn} onClick={startPolling}>
          Try Again
        </button>
      </div>
    );
  }

  // Default: idle state or modals showing
  return (
    <div class={styles.extensionContainer}>
      <div class={styles.extensionTitle}>
        Connect the Plugin with your Browser
      </div>

      <div class={styles.extensionDescription}>
        Capture webpages directly from your browser and they will appear here.
        Import them into Figma when you want.
      </div>

      <div class={styles.extensionBenefits}>
        <ul>
          <li>Perfect for private or local webpages</li>
          <li>Pages behind a log-in session</li>
          <li>Removing banners and more...</li>
        </ul>
      </div>

      <div class={styles.extensionSubtext}>
        Works on Chrome, Edge, Brave, Arc, Opera, Vivaldi, and Yandex browsers.
      </div>

      <div class={styles.extensionActions}>
        <button class={styles.extensionBtn} onClick={startPolling}>
          Start Listening
        </button>
        <button
          class={`${styles.extensionBtn} ${styles.extensionBtnSecondary}`}
          onClick={handleInstall}
        >
          Install Extension
        </button>
      </div>

      {/* Font Fallback Modal */}
      <FontFallbackModal
        isOpen={showFontModal}
        missingFonts={fontModalData?.missingFonts || []}
        defaultMapping={fontModalData?.defaultMapping || {}}
        pluginFont={fontModalData?.pluginFont || "Montserrat"}
        pluginFontOptions={fontModalData?.pluginFontOptions || []}
        fontDownloads={buildFontDownloads(fontModalData?.missingFonts || [], pendingData?.fonts)}
        extractedFonts={pendingData?.fonts as Array<{ family: string; style?: string; weight?: string; format?: string; src?: string }>}
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
          setPendingData(null);
        }}
      />
    </div>
  );
}
