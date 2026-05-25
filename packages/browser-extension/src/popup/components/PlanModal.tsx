import { CloseIcon, CheckIcon, XIcon } from "./Icons";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PlanFeature {
  name: string;
  free: string | boolean;
  pro: string | boolean;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: "Imports per month", free: "10", pro: "Unlimited" },
  { name: "All viewports", free: true, pro: true },
  { name: "Full colors & fonts", free: true, pro: true },
  { name: "Real text content", free: true, pro: true },
  { name: "Styles & assets", free: true, pro: true },
  { name: "Priority email support", free: false, pro: true },
];

export function PlanModal({ isOpen, onClose }: PlanModalProps) {
  if (!isOpen) return null;

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };

  const openLink = (url: string) => {
    chrome.tabs.create({ url, active: false });
  };

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal modal-plan">
        <div class="modal-header">
          <h2>Your Plan</h2>
          <button class="modal-close" onClick={onClose} type="button" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div class="modal-content">
          {/* Plan identity lives in the Figma plugin (figma.currentUser.id); the
              extension is anonymous, so we link out instead of asserting a tier. */}
          <div class="current-plan">
            <p class="plan-subtitle">Open the Figma plugin to view your current plan.</p>
          </div>

          {/* Features Comparison */}
          <div class="plan-features">
            <div class="plan-features-header">
              <span></span>
              <span class="plan-column plan-column-free">Free</span>
              <span class="plan-column plan-column-pro">Pro · from $16</span>
            </div>
            {PLAN_FEATURES.map((feature) => (
              <div class="plan-feature-row" key={feature.name}>
                <span class="feature-name">{feature.name}</span>
                <span class="feature-check">
                  {typeof feature.free === "string" ? (
                    <span class="feature-text">{feature.free}</span>
                  ) : feature.free ? (
                    <CheckIcon />
                  ) : (
                    <XIcon />
                  )}
                </span>
                <span class="feature-check">
                  {typeof feature.pro === "string" ? (
                    <span class="feature-text">{feature.pro}</span>
                  ) : feature.pro ? (
                    <CheckIcon />
                  ) : (
                    <XIcon />
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Upgrade Button */}
          <button
            class="btn btn-primary btn-upgrade"
            onClick={() => openLink("https://web2wireframe.design/pricing")}
            type="button"
          >
            View Plans
          </button>
        </div>
      </div>
    </div>
  );
}
