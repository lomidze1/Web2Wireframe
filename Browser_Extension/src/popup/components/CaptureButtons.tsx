import { DocumentIcon, SelectionIcon } from "./Icons";

interface CaptureButtonsProps {
  isCapturing: boolean;
  canCapture: boolean;
  onCapturePage: () => void;
  onSelectArea: () => void;
}

export function CaptureButtons({
  isCapturing,
  canCapture,
  onCapturePage,
  onSelectArea,
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

      {/* Select Area Button */}
      <button
        class="btn btn-secondary btn-capture"
        onClick={onSelectArea}
        disabled={!canCapture || isCapturing}
        type="button"
        title="Click on an element to capture it"
      >
        <span class="btn-icon">
          <SelectionIcon />
        </span>
        <span>Select Area</span>
      </button>
    </div>
  );
}
