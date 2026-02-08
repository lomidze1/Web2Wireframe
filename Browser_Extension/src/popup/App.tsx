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

/**
 * Extract domain from URL for filename
 */
function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").replace(/\./g, "_");
  } catch {
    return "website";
  }
}

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

        // Auto-download if save locally is selected
        if (saveOption === "local" && response.data) {
          handleDownload(response.data);
        }
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

  const handleCaptureArea = async (mode: "select" | "pick") => {
    if (!currentTab?.id) return;

    // Close popup and inject content script for area selection
    try {
      await chrome.tabs.sendMessage(currentTab.id, {
        type: mode === "select" ? "START_AREA_SELECT" : "START_ELEMENT_PICK",
      });
      // Close popup - the content script will handle the selection
      window.close();
    } catch (error) {
      // Content script not injected, inject it first
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: [mode === "select" ? "content/areaSelector.js" : "content/elementPicker.js"],
      });
      // Try again
      await chrome.tabs.sendMessage(currentTab.id, {
        type: mode === "select" ? "START_AREA_SELECT" : "START_ELEMENT_PICK",
      });
      window.close();
    }
  };

  const handleDownload = (data?: CaptureResult) => {
    const result = data || state.result;
    if (!result || !currentTab?.url) return;

    const domain = getDomainFromUrl(currentTab.url);
    const viewportLabel = viewports.join("_");
    const filename = `${domain}_${viewportLabel}_wireframe.json`;
    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
              onCaptureArea={handleCaptureArea}
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
