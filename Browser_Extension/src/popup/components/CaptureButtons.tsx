import { DocumentIcon, TargetIcon, SelectionIcon } from "./Icons";

interface CaptureButtonsProps {
  isCapturing: boolean;
  canCapture: boolean;
  onCapturePage: () => void;
  onCaptureArea: (mode: "select" | "pick") => void;
}

export function CaptureButtons({
  isCapturing,
  canCapture,
  onCapturePage,
  onCaptureArea,
}: CaptureButtonsProps) {
  return (
    <div class="capture-buttons">
      {/* Capture Full Page */}
      <button
        class="btn btn-primary btn-capture"
        onClick={onCapturePage}
        disabled={!canCapture || isCapturing}
        type="button"
      >
        <span class="btn-icon">
          <DocumentIcon />
        </span>
        <span>{isCapturing ? "Capturing..." : "Capture Page"}</span>
      </button>

      {/* Capture Area Options */}
      <div class="capture-area-section">
        <span class="capture-area-label">Capture Area</span>
        <div class="capture-area-buttons">
          <button
            class="btn btn-secondary btn-area"
            onClick={() => onCaptureArea("select")}
            disabled={!canCapture || isCapturing}
            type="button"
            title="Draw a rectangle to select area"
          >
            <span class="btn-icon">
              <SelectionIcon />
            </span>
            <span>Select Area</span>
          </button>
          <button
            class="btn btn-secondary btn-area"
            onClick={() => onCaptureArea("pick")}
            disabled={!canCapture || isCapturing}
            type="button"
            title="Click on an element to capture"
          >
            <span class="btn-icon">
              <TargetIcon />
            </span>
            <span>Pick Element</span>
          </button>
        </div>
      </div>
    </div>
  );
}
