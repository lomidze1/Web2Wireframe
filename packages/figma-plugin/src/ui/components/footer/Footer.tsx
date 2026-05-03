/** @jsx h */
import { h } from "preact";
import styles from "./Footer.css";

interface FooterProps {
  onSettingsClick: () => void;
  onHelpClick: () => void;
  onPlanClick?: () => void;
  showExtension?: boolean;
  onExtensionClick?: () => void;
  onRebindFontsClick?: () => void;
}

export default function Footer({
  onSettingsClick,
  onHelpClick,
  onPlanClick,
  showExtension = true,
  onExtensionClick,
  onRebindFontsClick,
}: FooterProps) {
  return (
    <div class={styles.footerBar}>
      <button
        class={styles.footerIcon}
        onClick={onSettingsClick}
        title="Settings"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      {onPlanClick && (
        <button class={styles.planBtn} onClick={onPlanClick} title="Plan">
          Plan
        </button>
      )}
      {showExtension && onExtensionClick && (
        <button
          class={styles.extensionBtn}
          onClick={onExtensionClick}
          title="Install browser extension"
        >
          Extension
        </button>
      )}
      {onRebindFontsClick && (
        <button
          class={styles.footerIcon}
          onClick={onRebindFontsClick}
          title="Re-apply original fonts (after installing the .zip download)"
          aria-label="Re-apply original fonts"
        >
          {/* Type "T" with a circular arrow — re-apply / refresh fonts */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 6h10" />
            <path d="M10 6v12" />
            <path d="M16 4v4h-4" />
            <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" />
          </svg>
        </button>
      )}
      <button class={styles.footerIcon} onClick={onHelpClick} title="Help">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </button>
    </div>
  );
}
