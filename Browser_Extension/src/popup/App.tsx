import { useState, useEffect } from "preact/hooks";
// import { encode } from "@msgpack/msgpack"; // DEBUG: Temporarily disabled for JSON export
import type { ExtensionMessage, CaptureResult, CaptureOptions } from "@/shared/types";
import { DEFAULT_CAPTURE_OPTIONS } from "@/shared/types";
import { VIEWPORTS, COLOR_OPTIONS, FONT_OPTIONS, TEXT_OPTIONS } from "@/shared/constants";

type CaptureStatus = "idle" | "capturing" | "success" | "error";

interface CaptureState {
  status: CaptureStatus;
  progress: number;
  message: string;
  result?: CaptureResult;
  error?: string;
}

/**
 * Extract domain from URL for filename
 */
function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix and replace dots with underscores
    return hostname.replace(/^www\./, "").replace(/\./g, "_");
  } catch {
    return "website";
  }
}

// DEBUG: Temporarily disabled for JSON export
// /**
//  * Compress binary data using CompressionStream (gzip)
//  */
// async function compressData(data: Uint8Array): Promise<Blob> {
//   const stream = new ReadableStream({
//     start(controller) {
//       controller.enqueue(data);
//       controller.close();
//     },
//   });
//
//   const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
//   return new Response(compressedStream).blob();
// }

export function App() {
  const [state, setState] = useState<CaptureState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [options, setOptions] = useState<CaptureOptions>(DEFAULT_CAPTURE_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);

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
        options,
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

  const handleDownload = async () => {
    if (!state.result || !currentTab?.url) return;

    const domain = getDomainFromUrl(currentTab.url);
    const viewport = options.viewport;

    // DEBUG MODE: Save as JSON for inspection
    // TODO: Revert to .w2w (MessagePack + gzip) after debugging
    const filename = `${domain}_${viewport}_wireframe.json`;
    const jsonString = JSON.stringify(state.result, null, 2);
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

        {/* Capture Options - Before capture */}
        {state.status === "idle" && (
          <>
            {/* Viewport Selection */}
            <div class="option-section">
              <label class="option-label">Viewports</label>
              <div class="viewport-chips">
                {VIEWPORTS.map((vp) => (
                  <button
                    key={vp.width}
                    class={`chip ${options.viewport === vp.width ? "chip-active" : ""}`}
                    onClick={() => setOptions((prev) => ({ ...prev, viewport: vp.width }))}
                  >
                    {vp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* More Options Toggle */}
            <button
              class="options-toggle"
              onClick={() => setShowOptions(!showOptions)}
            >
              <span>More Options</span>
              <span class={`arrow ${showOptions ? "arrow-up" : ""}`}>▼</span>
            </button>

            {/* Expandable Options */}
            {showOptions && (
              <div class="more-options">
                {/* Colors */}
                <div class="option-group">
                  <label class="option-label">Colors</label>
                  <select
                    class="option-select"
                    value={options.colorMode}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        colorMode: (e.target as HTMLSelectElement).value as "plugin" | "website",
                      }))
                    }
                  >
                    {COLOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fonts */}
                <div class="option-group">
                  <label class="option-label">Fonts</label>
                  <select
                    class="option-select"
                    value={options.fontMode}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        fontMode: (e.target as HTMLSelectElement).value as "plugin" | "website",
                      }))
                    }
                  >
                    {FONT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Text */}
                <div class="option-group">
                  <label class="option-label">Text</label>
                  <select
                    class="option-select"
                    value={options.textMode}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        textMode: (e.target as HTMLSelectElement).value as "semantic" | "lorem" | "website",
                      }))
                    }
                  >
                    {TEXT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

{/* CSS Variables option moved to Figma Plugin import step */}
              </div>
            )}
          </>
        )}

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
                Download .json
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
