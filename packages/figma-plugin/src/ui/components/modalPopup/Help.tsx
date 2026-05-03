/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
// import modalStyles from "../shared/ModalShared.css";

interface HelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpLink {
  icon: string;
  label: string;
  url?: string;
  action?: () => void;
}

export default function Help({ isOpen, onClose }: HelpProps) {
  if (!isOpen) return null;

  const helpLinks: HelpLink[] = [
    {
      icon: "🛒",
      label: "Buy license",
      url: "https://web2wireframe.design/pricing",
    },
    {
      icon: "❓",
      label: "Frequently Asked Questions",
      url: "https://web2wireframe.design/faq",
    },
    {
      icon: "💬",
      label: "Contact support",
      url: "https://web2wireframe.design/support",
    },
    {
      icon: "📧",
      label: "Email support",
      url: "mailto:support@web2wireframe.design",
    },
    {
      icon: "✈️",
      label: "Telegram",
      url: "https://t.me/web2wireframe",
    },
    {
      icon: "𝕏",
      label: "X (Twitter)",
      url: "https://twitter.com/web2wireframe",
    },
    {
      icon: "📨",
      label: "Contact us",
      url: "https://web2wireframe.design/contact",
    },
  ];

  const handleLinkClick = (link: HelpLink) => {
    if (link.url) {
      window.open(link.url, "_blank");
    } else if (link.action) {
      link.action();
    }
  };

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        class={`${styles.modal} ${styles.helpModal}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <span>Need help?</span>
          <button class={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={styles.helpLinks}>
            {helpLinks.map((link, index) => (
              <button
                key={index}
                class={styles.helpLinkItem}
                onClick={() => handleLinkClick(link)}
              >
                <span class={styles.helpLinkIcon}>{link.icon}</span>
                <span class={styles.helpLinkLabel}>{link.label}</span>
              </button>
            ))}
          </div>

          {/* Branding Section */}
          <div class={styles.helpBranding}>
            <div class={styles.helpLogo}>
              <svg
                id="logo"
                xmlns="http://www.w3.org/2000/svg"
                version="1.1"
                viewBox="0 0 292.23 275.06"
                class={styles.helpLogoIcon}
              >
                <defs></defs>
                <polygon
                  class="st0"
                  fill="var(--logo-color)"
                  stroke="#1d1d1b"
                  strokeMiterlimit={10}
                  points=".76 57.33 46.82 57.33 90.59 162.68 144.28 57.89 167 100.04 91.52 264.98 .76 57.33"
                />
                <polygon
                  class="st0"
                  fill="var(--logo-color)"
                  stroke="#1d1d1b"
                  strokeMiterlimit={10}
                  points="103.22 274.56 153.51 166.03 201.33 266.09 291.47 57.27 246.84 57.29 200.98 165.5 175.75 117.15 228.69 .5 218.45 .5 93.33 274.56 103.22 274.56"
                />
              </svg>

              <span>Web2Wireframe</span>
            </div>
            <div class={styles.helpTagline}>
              Transform any website into editable Figma wireframes
            </div>
            <a
              href="https://glinc.io/products"
              target="_blank"
              rel="noopener noreferrer"
              class={styles.helpOtherProducts}
            >
              🚀 Explore our other products
            </a>
            <div class={styles.helpMadeBy}>
              Made with ❤️ by{" "}
              <a
                href="https://glinc.io"
                target="_blank"
                rel="noopener noreferrer"
              >
                Glinc
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
