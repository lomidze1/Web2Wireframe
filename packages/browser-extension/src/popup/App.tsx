import { useState, useEffect } from "preact/hooks";
import type { ExtensionMessage, CaptureOptions } from "@/shared/types";
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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setCurrentTab(tabs[0]);
      }
    });

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

  const handleCapture = async () => {
    if (!currentTab?.id) return;

    setState({
      status: "capturing",
      progress: 0,
      message: "Starting capture...",
    });

    try {
      const options: CaptureOptions = { viewports };
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_PAGE_W2W",
        tabId: currentTab.id,
        options,
      } as ExtensionMessage);

      if (response.success) {
        setState({
          status: "success",
          progress: 100,
          message: "Capture complete!",
        });
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
      await chrome.storage.session.set({
        pendingSaveOption: saveOption,
      });

      const response = await chrome.runtime.sendMessage({
        type: "START_SELECTION",
        tabId: currentTab.id,
        options: { viewports },
      });

      if (!response?.success) {
        throw new Error(response?.error || "Failed to start selection");
      }

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
        <VisualFlow />

        {state.status !== "success" && (
          <>
            <ViewportsSection
              viewports={viewports}
              onChange={setViewports}
              disabled={isCapturing}
            />

            <SaveOptions
              saveOption={saveOption}
              onChange={setSaveOption}
              disabled={isCapturing}
            />

            <CaptureButtons
              isCapturing={isCapturing}
              canCapture={!!canCapture}
              onCapture={handleCapture}
              onSelectArea={handleSelectArea}
            />
          </>
        )}

        {state.status === "capturing" && (
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" style={{ width: `${state.progress}%` }} />
            </div>
            <span class="progress-text">{state.message}</span>
          </div>
        )}

        {state.status === "error" && (
          <div class="error-message">
            <span>{state.error}</span>
          </div>
        )}

        {state.status === "success" && (
          <div class="success-section">
            <div class="success-message">Page captured successfully!</div>
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

        {!canCapture && state.status === "idle" && (
          <div class="warning-message">
            Cannot capture this page. Try a regular website.
          </div>
        )}
      </main>

      <Footer
        onPlanClick={() => setShowPlanModal(true)}
        onHelpClick={() => setShowHelpModal(true)}
      />

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <PlanModal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} />
    </div>
  );
}
