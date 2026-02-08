import { CloseIcon, CheckIcon, XIcon } from "./Icons";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PlanFeature {
  name: string;
  plus: string | boolean;
  pro: string | boolean;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: "Imports per month", plus: "Unlimited", pro: "Unlimited" },
  { name: "Viewports", plus: "All", pro: "All" },
  { name: "Full color & fonts", plus: true, pro: true },
  { name: "Real text content", plus: true, pro: true },
  { name: "Styles & assets", plus: true, pro: true },
  { name: "AI generation", plus: false, pro: true },
  { name: "Component library", plus: false, pro: true },
  { name: "Priority support", plus: false, pro: true },
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
          {/* Current Plan Badge */}
          <div class="current-plan">
            <span class="plan-badge plan-badge-free">Free Plan</span>
          </div>

          {/* Features Comparison */}
          <div class="plan-features">
            <div class="plan-features-header">
              <span></span>
              <span class="plan-column plan-column-plus">Plus</span>
              <span class="plan-column plan-column-pro">Pro</span>
            </div>
            {PLAN_FEATURES.map((feature) => (
              <div class="plan-feature-row" key={feature.name}>
                <span class="feature-name">{feature.name}</span>
                <span class="feature-check">
                  {typeof feature.plus === "string" ? (
                    <span class="feature-text">{feature.plus}</span>
                  ) : feature.plus ? (
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
