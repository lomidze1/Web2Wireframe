/** @jsx h */
import { h } from "preact";
import { useRef } from "preact/hooks";
import type { PluginConfig } from "../../shared/ConfigContext";
import styles from "./NextStepCard.css";

/** What the last successful import actually used — the card's re-imports start from it. */
export interface ImportSnapshot {
  url: string;
  viewports: string[];
  colorMode: PluginConfig["colorMode"];
  fontMode: PluginConfig["fontMode"];
  textMode: PluginConfig["textMode"];
  assetMode: PluginConfig["assetMode"];
}

/** An existing viewport option — the API's saved record drops other widths. */
export const MOBILE_VIEWPORT = "375";

interface NextStepCardProps {
  snapshot: ImportSnapshot;
  /** An import is running — the importing actions wait for it. */
  disabled: boolean;
  /** The next style-ladder step, or null once every step was tried. */
  nextStyle: { label: string } | null;
  /** "Choose yourself" appears only once a style has been tried — the first
   *  step stays a single, obvious next click. */
  showChooseYourself: boolean;
  onImportMobile: () => void;
  onAnotherPage: () => void;
  onTryStyle: () => void;
  onChooseYourself: () => void;
  onDismiss: () => void;
}

/**
 * Shown after a successful URL import. Most users import once and leave; the
 * ones who stay re-import the same site at another size or style — this puts
 * that next step one click away.
 */
export default function NextStepCard({
  snapshot,
  disabled,
  nextStyle,
  showChooseYourself,
  onImportMobile,
  onAnotherPage,
  onTryStyle,
  onChooseYourself,
  onDismiss,
}: NextStepCardProps) {
  // The parent disables the buttons only after its state updates, so without
  // this a quick double click would start two imports.
  const firedRef = useRef(false);
  const once = (action: () => void) => () => {
    if (firedRef.current) return;
    firedRef.current = true;
    action();
  };

  const showMobile = !snapshot.viewports.includes(MOBILE_VIEWPORT);
  const showStyle = nextStyle !== null;

  return (
    <div class={styles.card} role="region" aria-label="Next steps">
      <div class={styles.header}>
        <span class={styles.title}>Imported! What next?</span>
        <button
          type="button"
          class={styles.close}
          aria-label="Dismiss suggestions"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>

      <div class={styles.actions}>
        {showMobile && (
          <button
            type="button"
            class={styles.action}
            disabled={disabled}
            onClick={once(onImportMobile)}
          >
            📱 Import mobile version
          </button>
        )}
        <button type="button" class={styles.action} onClick={onAnotherPage}>
          📄 Import another page of this site
        </button>
        <div class={styles.row}>
          {showStyle && nextStyle && (
            <button
              type="button"
              class={styles.action}
              disabled={disabled}
              onClick={once(onTryStyle)}
            >
              {nextStyle.label}
            </button>
          )}
          {showChooseYourself && (
            <button type="button" class={styles.action} onClick={onChooseYourself}>
              {nextStyle === null ? "⚙️ Pick your own settings" : "⚙️ Choose yourself"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
