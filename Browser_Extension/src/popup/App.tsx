import { useState, useEffect } from "preact/hooks";
import type { ExtensionMessage, CaptureResult } from "@/shared/types";

type CaptureStatus = "idle" | "capturing" | "success" | "error";

interface CaptureState {
  status: CaptureStatus;
  progress: number;
  message: string;
  result?: CaptureResult;
  error?: string;
}

export function App() {
  const [state, setState] = useState<CaptureState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

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

  const handleCapture = async () => {
    if (!currentTab?.id) return;

    setState({
      status: "capturing",
      progress: 0,
      message: "Starting capture...",
    });

    try {
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_PAGE",
        tabId: currentTab.id,
      });

      if (response.success) {
        setState({
          status: "success",
          progress: 100,
          message: "Capture complete!",
          result: response.data,
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

  const handleSendToFigma = async () => {
    if (!state.result) return;

    setState((prev) => ({
      ...prev,
      message: "Sending to Figma plugin...",
    }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: "SEND_TO_BACKEND",
        data: state.result,
      });

      if (response.success) {
        setState((prev) => ({
          ...prev,
          message: "Sent to Figma! Open the plugin to import.",
        }));
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to send",
      }));
    }
  };

  const handleDownload = () => {
    if (!state.result) return;

    const blob = new Blob([JSON.stringify(state.result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wireframe-${Date.now()}.w2w.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canCapture =
    currentTab?.url &&
    !currentTab.url.startsWith("chrome://") &&
    !currentTab.url.startsWith("chrome-extension://");

  return (
    <div class="popup">
      <header class="popup-header">
        <img src="../icons/icon48.png" alt="W2W" class="logo" />
        <h1>Web2Wireframe</h1>
      </header>

      <main class="popup-content">
        {/* Current Page Info */}
        <div class="page-info">
          <span class="page-title">{currentTab?.title || "Loading..."}</span>
          <span class="page-url">{currentTab?.url?.substring(0, 40)}...</span>
        </div>

        {/* Status/Progress */}
        {state.status === "capturing" && (
          <div class="progress-section">
            <div class="progress-bar">
              <div
                class="progress-fill"
                style={{ width: `${state.progress}%` }}
              />
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
              <span>Size: {state.result.viewport.width}x{state.result.viewport.height}</span>
              <span>Fonts: {state.result.fonts.length}</span>
              <span>Assets: {state.result.assets.length}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div class="actions">
          {state.status !== "success" ? (
            <button
              class="btn btn-primary"
              onClick={handleCapture}
              disabled={!canCapture || state.status === "capturing"}
            >
              {state.status === "capturing" ? "Capturing..." : "Capture Page"}
            </button>
          ) : (
            <>
              <button class="btn btn-primary" onClick={handleSendToFigma}>
                Send to Figma
              </button>
              <button class="btn btn-secondary" onClick={handleDownload}>
                Download .w2w
              </button>
              <button
                class="btn btn-text"
                onClick={() => setState({ status: "idle", progress: 0, message: "" })}
              >
                Capture Again
              </button>
            </>
          )}
        </div>

        {!canCapture && (
          <div class="warning-message">
            Cannot capture this page. Try a regular website.
          </div>
        )}
      </main>

      <footer class="popup-footer">
        <a href="#" onClick={() => chrome.runtime.openOptionsPage()}>
          Settings
        </a>
        <span class="version">v1.0.0</span>
      </footer>
    </div>
  );
}
