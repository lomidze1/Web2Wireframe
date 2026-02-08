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
        <img src="/icons/icon48.png" alt="Web2Wireframe" class="logo-image" />
      </div>

      <ArrowIcon className="flow-arrow" />

      <div class="flow-item">
        <WireframeMockupIcon />
        <span class="flow-label">Wireframe</span>
      </div>
    </div>
  );
}
