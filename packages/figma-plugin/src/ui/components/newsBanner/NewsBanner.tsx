/** @jsx h */
import { h } from "preact";
import { LEGIBLY_URL } from "../../shared/whatsNew";
import { openExternal } from "../../shared/openExternal";
import styles from "./NewsBanner.css";

interface NewsBannerProps {
  /** Hides the banner for the rest of this plugin session. */
  onDismiss: () => void;
}

/**
 * Where the "What's new" modal lands when it is closed: a one-line Legibly note
 * under the Web tab's Import button. `data-news-banner` is the flight target
 * the modal measures (see WhatsNewModal).
 */
export default function NewsBanner({ onDismiss }: NewsBannerProps) {
  return (
    <div class={styles.wrap} data-news-banner="">
      <div class={styles.inner}>
        <div class={styles.banner}>
          <span class={styles.text}>
            ✨ New from us: <strong>Legibly</strong> — fix design accessibility in one click
          </span>
          <button type="button" class={styles.try} onClick={() => openExternal(LEGIBLY_URL)}>
            Try ↗
          </button>
          <button
            type="button"
            class={styles.close}
            aria-label="Hide Legibly note"
            onClick={onDismiss}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
