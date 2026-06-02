import { PageMockupIcon, WireframeMockupIcon, ArrowIcon } from "./Icons";

export function VisualFlow() {
  return (
    <div class="visual-flow">
      <div class="flow-item">
        <PageMockupIcon />
        <span class="flow-label">Page</span>
      </div>

      <ArrowIcon className="flow-arrow" />

      <div class="flow-item flow-item-logo">
        {/* W2W-Logo.svg = clean vector mark (logo.svg was a 244KB export that
            rendered poorly at this size; icon48.png is only 32px). */}
        <img src="/icons/W2W-Logo.svg" alt="Web2Wireframe" class="logo-image" />
      </div>

      <ArrowIcon className="flow-arrow" />

      <div class="flow-item">
        <WireframeMockupIcon />
        <span class="flow-label">Wireframe</span>
      </div>
    </div>
  );
}
