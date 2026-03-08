/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./Modal.css";
import type { FontMapping } from "../../../types";

export type FontFallbackChoice = "fallback" | "plugin" | "continue";

interface FontFallbackModalProps {
  isOpen: boolean;
  missingFonts: string[];
  defaultMapping: Record<string, string>;
  pluginFont: string;
  pluginFontOptions: string[];
  fallbackChains?: Record<string, string[]>;
  onChoice: (choice: FontFallbackChoice, fontMapping: FontMapping) => void;
}

export default function FontFallbackModal({
  isOpen,
  missingFonts,
  defaultMapping,
  pluginFont,
  pluginFontOptions,
  fallbackChains,
  onChoice,
}: FontFallbackModalProps) {
  const [showPluginDropdowns, setShowPluginDropdowns] = useState(false);
  // Per-font mapping: initialize each missing font to pluginFont
  const [fontMapping, setFontMapping] = useState<FontMapping>(() => {
    const initial: FontMapping = {};
    for (const font of missingFonts) {
      initial[font] = pluginFont;
    }
    return initial;
  });

  if (!isOpen) return null;

  const handleFallback = () => {
    // Build mapping from CSS fallback chains
    const mapping: FontMapping = {};
    for (const font of missingFonts) {
      const chain = fallbackChains?.[font];
      if (chain && chain.length > 1) {
        // First item is the font itself, second is the fallback
        mapping[font] = chain[1];
      } else {
        mapping[font] = defaultMapping[font] || pluginFont;
      }
    }
    onChoice("fallback", mapping);
  };

  const handlePluginFontsClick = () => {
    setShowPluginDropdowns(true);
  };

  const handlePluginConfirm = () => {
    onChoice("plugin", fontMapping);
  };

  const handleContinue = () => {
    onChoice("continue", {});
  };

  const handleDropdownChange = (font: string, value: string) => {
    setFontMapping((prev) => ({ ...prev, [font]: value }));
  };

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.variablesModal}`}>
        <div class={styles.modalHeader}>
          <span>Fonts Not Available</span>
        </div>
        <div class={styles.modalContent}>
          <p class={styles.variablesDescription}>
            The following fonts are not installed:{" "}
            {missingFonts.map((font, i) => (
              <span key={font}>
                <strong>{font}</strong>
                {i < missingFonts.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>

          <div class={styles.variablesOptions}>
            {/* Option 1: Use CSS fallback fonts */}
            <button
              class={styles.variablesOption}
              onClick={handleFallback}
            >
              <div class={styles.variablesOptionIcon}>Aa</div>
              <div class={styles.variablesOptionContent}>
                <strong>Use fallback fonts</strong>
                <span>Use each font's CSS fallback chain</span>
              </div>
            </button>

            {/* Option 2: Use plugin fonts (with per-font dropdowns) */}
            {!showPluginDropdowns ? (
              <button
                class={styles.variablesOption}
                onClick={handlePluginFontsClick}
              >
                <div class={styles.variablesOptionIcon}>Aa</div>
                <div class={styles.variablesOptionContent}>
                  <strong>Use plugin fonts</strong>
                  <span>Map each missing font to a plugin font</span>
                </div>
              </button>
            ) : (
              <div class={styles.variablesOption}>
                <div class={styles.variablesOptionContent}>
                  <strong>Map each font:</strong>
                  {missingFonts.map((font) => (
                    <div key={font} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                      <span style={{ minWidth: "80px" }}>{font}</span>
                      <select
                        value={fontMapping[font] || pluginFont}
                        onChange={(e) =>
                          handleDropdownChange(font, (e.target as HTMLSelectElement).value)
                        }
                      >
                        {pluginFontOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button
                    style={{ marginTop: "8px" }}
                    onClick={handlePluginConfirm}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* Option 3: Continue as-is */}
            <button
              class={styles.variablesOption}
              onClick={handleContinue}
            >
              <div class={styles.variablesOptionIcon}>?</div>
              <div class={styles.variablesOptionContent}>
                <strong>Continue as-is</strong>
                <span>Figma will substitute default fonts</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
