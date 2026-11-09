/** @jsx h */
import { h } from "preact";
import styles from "./Footer.css";

interface FooterProps {
  onSettingsClick: () => void;
  onHelpClick: () => void;
  showExtension?: boolean;
  onExtensionClick?: () => void;
  /** Only show the Re-apply fonts button when there's actually something to
   * re-apply (current page has substituted-font text). */
  showRebindFonts?: boolean;
  /** Pending fonts the user has not acknowledged yet — shows a dot on the
   *  Re-apply button. */
  rebindUnseen?: boolean;
  /** Names the action for screen readers and the hover tooltip — becomes
   *  "…to selection" when the current Figma selection holds pending fonts.
   *  The button itself carries no visible label: at the fixed 410px window a
   *  labelled button in the footer pushed the right-hand group off the edge. */
  rebindAriaLabel?: string;
  onRebindFontsClick?: () => void;
}

export default function Footer({
  onSettingsClick,
  onHelpClick,
  showExtension = true,
  onExtensionClick,
  showRebindFonts = false,
  rebindUnseen = false,
  rebindAriaLabel = "Re-apply original fonts",
  onRebindFontsClick,
}: FooterProps) {
  return (
    <footer class={styles.footerBar} role="contentinfo">
      <div class={styles.footerGroup}>
        <button
          type="button"
          class={styles.iconBtn}
          onClick={onSettingsClick}
          aria-label="Open settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          type="button"
          class={styles.iconBtn}
          onClick={onHelpClick}
          aria-label="Open help"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        {/* Contextual — only rendered while the page still holds text imported
            with a substituted font. Sits with the other icons rather than in a
            slot of its own: the window is a fixed 410px, and a labelled button
            here is what used to clip the Extension button. */}
        {showRebindFonts && onRebindFontsClick && (
          <button
            type="button"
            class={`${styles.iconBtn} ${styles.rebindBtn}`}
            onClick={onRebindFontsClick}
            aria-label={rebindAriaLabel}
            title={rebindAriaLabel}
            data-rebind-icon=""
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 6h10" />
              <path d="M10 6v12" />
              <path d="M16 4v4h-4" />
              <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" />
            </svg>
            {rebindUnseen && (
              <span class={styles.rebindDot} data-rebind-dot="" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      <div class={styles.footerGroup}>
        {showExtension && onExtensionClick && (
          <button
            type="button"
            class={styles.extensionBtn}
            onClick={onExtensionClick}
          >
            Extension
          </button>
        )}
      </div>
    </footer>
  );
}
