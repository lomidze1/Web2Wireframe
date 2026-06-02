import { CloseIcon } from "./Icons";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpLink {
  icon: string;
  label: string;
  url: string;
}

/**
 * Help & Resources modal. Kept identical (items, order, copy, branding) to the
 * Figma plugin's "Need help?" modal — the only difference is the cross-link
 * (#7): the extension links to the Figma plugin, the plugin links here.
 */
const HELP_LINKS: HelpLink[] = [
  { icon: "🛒", label: "Compare plans", url: "https://web2wireframe.design/pricing" },
  { icon: "📄", label: "See our Docs", url: "https://web2wireframe.design/docs" },
  { icon: "💬", label: "Help center", url: "https://web2wireframe.design/support" },
  { icon: "📧", label: "Contact us", url: "https://mail.google.com/mail/?view=cm&fs=1&to=hey@web2wireframe.design" },
  { icon: "✈️", label: "Telegram", url: "https://t.me/web2wireframe" },
  { icon: "🎨", label: "Open Figma Plugin", url: "https://www.figma.com/community/plugin/web2wireframe" },
];

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  // Open every link in a background tab via chrome.tabs.create — extension
  // popups block native navigation (and mailto: launches) without a gesture.
  const handleClick = (url: string) => (e: Event) => {
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
          <h2>Help &amp; Resources</h2>
          <button class="modal-close" onClick={onClose} type="button" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div class="modal-content">
          <div class="help-links">
            {HELP_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.url}
                onClick={handleClick(link.url)}
                class="help-link"
              >
                <span class="help-link-icon" aria-hidden="true">{link.icon}</span>
                <span>{link.label}</span>
              </a>
            ))}
          </div>

          {/* Branding — kept in sync with the plugin's Help modal. */}
          <div class="help-branding">
            <div class="help-logo">
              <img src="/icons/W2W-Logo.svg" alt="Web2Wireframe" class="help-logo-icon" />
              <span>Web2Wireframe</span>
            </div>
            <div class="help-tagline">
              Transform any website into editable Figma wireframes
            </div>
            <a
              href="https://glinc.io/products"
              onClick={handleClick("https://glinc.io/products")}
              class="help-other-products"
            >
              🚀 Explore our other products
            </a>
            <div class="help-made-by">
              Made with ❤️ by{" "}
              <a href="https://glinc.io" onClick={handleClick("https://glinc.io")}>
                Glinc
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
