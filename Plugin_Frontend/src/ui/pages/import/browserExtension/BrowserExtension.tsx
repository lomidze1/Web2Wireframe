/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import styles from "./BrowserExtension.css";
import ImportOptionsModal, {
  type ImportOptions,
} from "../../../components/modalPopup/ImportOptionsModal";
import { transformFramesData } from "../../../shared/transformData";
import { useConfig } from "../../../shared/ConfigContext";
import VariablesChoiceModal, {
  type VariableMode,
} from "../../../components/modalPopup/VariablesChoiceModal";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";

// Backend API URL
const API_URL = "http://localhost:3002";

// Poll interval in milliseconds
const POLL_INTERVAL = 2000;

// Import state type
interface ImportState {
  status: "idle" | "waiting" | "options" | "variables" | "importing" | "success" | "error";
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
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<ImportOptions | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  // Rendering loader state
  const [showRenderingLoader, setShowRenderingLoader] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<RenderingProgress | undefined>();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        setPendingData({
          importId: data.importId,
          sourceUrl: data.sourceUrl,
          title: data.title,
          viewports: data.viewports,
          frameCount: data.frameCount,
          wireframeData: data.wireframeData,
          localStyles: data.localStyles,
          fonts: data.fonts,
          cssVariables: data.cssVariables,
        });

        // Stop polling and show options modal
        stopPolling();
        setImportState({
          status: "options",
          message: `Received: ${data.title || data.sourceUrl}`,
        });
        setShowOptionsModal(true);
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
          setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            setImportState({ status: "idle", message: "" });
            setPendingData(null);
            setSelectedOptions(null);
          }, 10000); // Show success state for 10 seconds
        }
      }

      if (msg.type === "wireframe-created") {
        // Handled by render-progress with isComplete
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
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  /**
   * Send wireframe data to Figma
   */
  const sendToFigma = (
    frames: unknown[],
    variableMode: VariableMode
  ) => {
    if (!pendingData) return;

    // Show the rendering loader
    setShowRenderingLoader(true);
    setRenderingProgress({
      step: "Preparing wireframe data...",
      percent: 0,
    });

    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames,
            sourceUrl: pendingData.sourceUrl,
            localStyles: pendingData.localStyles,
            pluginColors: config.pluginColors,
            cssVariables: pendingData.cssVariables || [],
            variableMode,
          },
        },
      },
      "*"
    );
    // Progress updates and completion are handled by the message listener
  };

  /**
   * Handle import options confirmation
   */
  const handleOptionsConfirm = (options: ImportOptions) => {
    setShowOptionsModal(false);
    setSelectedOptions(options);

    if (!pendingData) return;

    // Transform data based on options
    const transformedFrames = transformFramesData(
      pendingData.wireframeData.frames as Parameters<typeof transformFramesData>[0],
      options
    );

    // Check if CSS variables exist
    const hasCSSVariables =
      pendingData.cssVariables && pendingData.cssVariables.length > 0;

    if (hasCSSVariables) {
      // Show variables modal
      setImportState({
        status: "variables",
        message: "Choose how to handle CSS variables...",
      });
      setShowVariablesModal(true);
      // Store transformed frames for later
      setPendingData((prev) =>
        prev ? { ...prev, wireframeData: { frames: transformedFrames } } : null
      );
    } else {
      // No CSS variables - proceed directly
      setImportState({ status: "importing", message: "Creating wireframe..." });
      sendToFigma(transformedFrames, "direct");
    }
  };

  /**
   * Handle import options cancel
   */
  const handleOptionsCancel = () => {
    setShowOptionsModal(false);
    setPendingData(null);
    setImportState({ status: "idle", message: "" });
  };

  /**
   * Handle variables choice
   */
  const handleVariablesChoice = (mode: VariableMode) => {
    setShowVariablesModal(false);
    if (pendingData) {
      setImportState({ status: "importing", message: "Creating wireframe..." });
      sendToFigma(pendingData.wireframeData.frames, mode);
    }
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

      {/* Import Options Modal */}
      <ImportOptionsModal
        isOpen={showOptionsModal}
        onConfirm={handleOptionsConfirm}
        onCancel={handleOptionsCancel}
        sourceUrl={pendingData?.sourceUrl}
      />

      {/* CSS Variables Choice Modal */}
      <VariablesChoiceModal
        isOpen={showVariablesModal}
        onChoice={handleVariablesChoice}
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
          setSelectedOptions(null);
        }}
      />
    </div>
  );
}
