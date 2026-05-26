import { CloseIcon, ContactIcon, DocsIcon, PluginIcon, PricingIcon } from "./Icons";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Help & Resources modal — pure links list after Phase 5.2.
 *
 * The "Subscribe to news" section that used to live here moved to
 * IdentityModal (which is the natural home for account-adjacent forms).
 * HelpModal is now state-less and async-free.
 */
export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  const openLink = (url: string) => (e: Event) => {
    e.preventDefault();
    chrome.tabs.create({ url, active: false });
  };

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal">
        <div class="modal-header">
          <h2>Help & Resources</h2>
          <button class="modal-close" onClick={onClose} type="button" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div class="modal-content">
          <div class="help-links">
            <a
              href="https://web2wireframe.design/docs"
              onClick={openLink("https://web2wireframe.design/docs")}
              class="help-link"
            >
              <span class="help-link-icon"><DocsIcon /></span>
              <span>See our Docs</span>
            </a>

            <a
              href="https://www.web2wireframe.design/support"
              onClick={openLink("https://www.web2wireframe.design/support")}
              class="help-link"
            >
              <span class="help-link-icon"><ContactIcon /></span>
              <span>Contact us</span>
            </a>

            <a
              href="https://www.figma.com/community/plugin/web2wireframe"
              onClick={openLink("https://www.figma.com/community/plugin/web2wireframe")}
              class="help-link"
            >
              <span class="help-link-icon"><PluginIcon /></span>
              <span>Open Figma Plugin</span>
            </a>

            <a
              href="https://web2wireframe.design/pricing"
              onClick={openLink("https://web2wireframe.design/pricing")}
              class="help-link"
            >
              <span class="help-link-icon"><PricingIcon /></span>
              <span>Pricing</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
