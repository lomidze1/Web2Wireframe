import { useState, useEffect } from "preact/hooks";
import type { ExtensionMessage, CaptureResult, CaptureOptions } from "@/shared/types";
import {
  VisualFlow,
  ViewportsSection,
  SaveOptions,
  CaptureButtons,
  Footer,
  HelpModal,
  PlanModal,
} from "./components";

type CaptureStatus = "idle" | "capturing" | "success" | "error";

interface CaptureState {
  status: CaptureStatus;
  progress: number;
  message: string;
  result?: CaptureResult;
  error?: string;
}

// Default selected viewport (only 1440 selected by default)
const DEFAULT_VIEWPORTS = [1440];

export function App() {
  const [state, setState] = useState<CaptureState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [viewports, setViewports] = useState<number[]>(DEFAULT_VIEWPORTS);
  const [saveOption, setSaveOption] = useState<"local" | "figma">("local");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  useEffect(() => {
    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setCurrentTab(tabs[0]);
      }
    });

    // Listen for progress updates
    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === "CAPTURE_PROGRESS") {
        setState((prev) => ({
          ...prev,
          progress: message.progress,
          message: message.status,
        }));
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleCapturePage = async () => {
    if (!currentTab?.id) return;

    setState({
      status: "capturing",
      progress: 0,
      message: "Starting capture...",
    });

    try {
      const options: CaptureOptions = { viewports };
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_PAGE",
        tabId: currentTab.id,
        options,
      });

      if (response.success) {
        setState({
          status: "success",
          progress: 100,
          message: "Capture complete!",
          result: response.data,
        });
        // Download is handled by background service worker (autoDownloadResult)
        // This ensures JSON is saved even if popup closes during capture
      } else {
        throw new Error(response.error || "Capture failed");
      }
    } catch (error) {
      setState({
        status: "error",
        progress: 0,
        message: "",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleSelectArea = async () => {
    if (!currentTab?.id) return;

    try {
      // Store save option for auto-download after capture
      await chrome.storage.session.set({
        pendingSaveOption: saveOption,
      });

      // Send message to background script to start CDP Inspect Mode
      const response = await chrome.runtime.sendMessage({
        type: "START_SELECTION",
        tabId: currentTab.id,
        options: { viewports },
      });

      if (!response?.success) {
        throw new Error(response?.error || "Failed to start selection");
      }

      // Close popup - the background script handles the selection via CDP
      window.close();
    } catch (error) {
      setState({
        status: "error",
        progress: 0,
        message: "",
        error: error instanceof Error ? error.message : "Could not start selection. Please try again.",
      });
    }
  };

  const canCapture =
    currentTab?.url &&
    !currentTab.url.startsWith("chrome://") &&
    !currentTab.url.startsWith("chrome-extension://");

  const isCapturing = state.status === "capturing";

  return (
    <div class="popup">
      <header class="popup-header">
        <img src="/icons/icon128.png" alt="W2W" class="logo" />
        <h1>Web2Wireframe</h1>
      </header>

      <main class="popup-content">
        {/* Visual Flow: Page → Logo → Wireframe */}
        <VisualFlow />

        {/* Viewports Section */}
        {state.status !== "success" && (
          <>
            <ViewportsSection
              viewports={viewports}
              onChange={setViewports}
              disabled={isCapturing}
            />

            {/* Save Options */}
            <SaveOptions
              saveOption={saveOption}
              onChange={setSaveOption}
              disabled={isCapturing}
            />

            {/* Capture Buttons */}
            <CaptureButtons
              isCapturing={isCapturing}
              canCapture={!!canCapture}
              onCapturePage={handleCapturePage}
              onSelectArea={handleSelectArea}
            />
          </>
        )}

        {/* Progress */}
        {state.status === "capturing" && (
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" style={{ width: `${state.progress}%` }} />
            </div>
            <span class="progress-text">{state.message}</span>
          </div>
        )}

        {/* Error */}
        {state.status === "error" && (
          <div class="error-message">
            <span>{state.error}</span>
          </div>
        )}

        {/* Success */}
        {state.status === "success" && state.result && (
          <div class="success-section">
            <div class="success-message">Page captured successfully!</div>
            <div class="capture-stats">
              <span>
                Viewports: {state.result.frames.map((f) => f.viewport.width).join(", ")}px
              </span>
            </div>
            <div class="thanks-message">
              Thanks for using Web2Wireframe!
            </div>
            <button
              class="btn btn-secondary"
              onClick={() => setState({ status: "idle", progress: 0, message: "" })}
            >
              Back to Main
            </button>
          </div>
        )}

        {/* Warning for non-capturable pages */}
        {!canCapture && state.status === "idle" && (
          <div class="warning-message">
            Cannot capture this page. Try a regular website.
          </div>
        )}
      </main>

      {/* Footer with Plan and Help icons only */}
      <Footer
        onPlanClick={() => setShowPlanModal(true)}
        onHelpClick={() => setShowHelpModal(true)}
      />

      {/* Modals */}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <PlanModal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} />
    </div>
  );
}
