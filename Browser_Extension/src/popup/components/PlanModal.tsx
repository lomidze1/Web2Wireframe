import { CloseIcon, CheckIcon, XIcon } from "./Icons";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PlanFeature {
  name: string;
  free: boolean;
  pro: boolean;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: "Capture full page", free: true, pro: true },
  { name: "Capture area selection", free: true, pro: true },
  { name: "5 viewports", free: true, pro: true },
  { name: "Download as JSON", free: true, pro: true },
  { name: "Send to Figma directly", free: false, pro: true },
  { name: "Priority support", free: false, pro: true },
  { name: "Custom fonts export", free: false, pro: true },
  { name: "Batch capture", free: false, pro: true },
];

export function PlanModal({ isOpen, onClose }: PlanModalProps) {
  if (!isOpen) return null;

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };

  const handleUpgrade = () => {
    window.open("https://web2wireframe.com/pricing", "_blank");
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
              <span class="plan-column">Free</span>
              <span class="plan-column plan-column-pro">Pro</span>
            </div>
            {PLAN_FEATURES.map((feature) => (
              <div class="plan-feature-row" key={feature.name}>
                <span class="feature-name">{feature.name}</span>
                <span class="feature-check">
                  {feature.free ? <CheckIcon /> : <XIcon />}
                </span>
                <span class="feature-check">
                  {feature.pro ? <CheckIcon /> : <XIcon />}
                </span>
              </div>
            ))}
          </div>

          {/* Upgrade Button */}
          <button class="btn btn-primary btn-upgrade" onClick={handleUpgrade} type="button">
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}
