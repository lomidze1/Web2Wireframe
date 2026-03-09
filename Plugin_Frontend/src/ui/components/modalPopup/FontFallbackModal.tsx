/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./Modal.css";
import type { FontMapping } from "../../../types";
import {
  buildFontDownloadEntries,
  createFontsZipBlob,
} from "../../../utils/fontDownload";

export type FontFallbackChoice = "fallback" | "plugin" | "continue";

/** Minimal font info for download links */
export interface FontDownloadInfo {
  family: string;
  urls: string[];
  isGoogleFont: boolean;
}

interface FontFallbackModalProps {
  isOpen: boolean;
  missingFonts: string[];
  defaultMapping: Record<string, string>;
  pluginFont: string;
  pluginFontOptions: string[];
  fallbackChains?: Record<string, string[]>;
  fontDownloads?: FontDownloadInfo[];
  extractedFonts?: Array<{ family: string; style?: string; weight?: string; format?: string; src?: string }>;
  onChoice: (choice: FontFallbackChoice, fontMapping: FontMapping) => void;
}

export default function FontFallbackModal({
  isOpen,
  missingFonts,
  defaultMapping,
  pluginFont,
  pluginFontOptions,
  fallbackChains,
  fontDownloads,
  extractedFonts,
  onChoice,
}: FontFallbackModalProps) {
  const [showPluginDropdowns, setShowPluginDropdowns] = useState(false);
  const [showOriginalSection, setShowOriginalSection] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
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
    setShowOriginalSection(false);
  };

  const handlePluginConfirm = () => {
    onChoice("plugin", fontMapping);
  };

  const handleOriginalClick = () => {
    setShowOriginalSection(true);
    setShowPluginDropdowns(false);
  };

  const handleOriginalApply = () => {
    // Identity mapping: each font maps to itself (original names preserved)
    // main.ts will render with Inter but create Text Styles with original names
    const mapping: FontMapping = {};
    for (const font of missingFonts) {
      mapping[font] = font;
    }
    onChoice("continue", mapping);
  };

  const handleDownloadFonts = async () => {
    if (!fontDownloads || fontDownloads.length === 0) return;
    setIsDownloading(true);
    try {
      const entries = buildFontDownloadEntries(fontDownloads, extractedFonts);
      if (entries.length === 0) return;
      const blob = await createFontsZipBlob(entries);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fonts.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Download failed silently
    } finally {
      setIsDownloading(false);
    }
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
                    <div key={font} class={styles.fontMappingRow}>
                      <span class={styles.fontMappingLabel}>{font}</span>
                      <select
                        class={styles.dropdown}
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
                    class={styles.fontApplyBtn}
                    onClick={handlePluginConfirm}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* Option 3: Use original fonts */}
            {!showOriginalSection ? (
              <button
                class={styles.variablesOption}
                onClick={handleOriginalClick}
              >
                <div class={styles.variablesOptionIcon}>Aa</div>
                <div class={styles.variablesOptionContent}>
                  <strong>Use original fonts</strong>
                  <span>Download & install fonts later</span>
                </div>
              </button>
            ) : (
              <div class={styles.variablesOption}>
                <div class={styles.variablesOptionContent}>
                  <span class={styles.originalFontHint}>
                    Text Styles will use original font names. Download the fonts, install them, then update the styles in Figma.
                  </span>
                  {fontDownloads && fontDownloads.length > 0 && (
                    <button
                      class={styles.fontDownloadBtn}
                      onClick={handleDownloadFonts}
                      disabled={isDownloading}
                    >
                      {isDownloading ? "Downloading..." : "Download fonts (.zip)"}
                    </button>
                  )}
                  <button
                    class={styles.fontApplyBtn}
                    onClick={handleOriginalApply}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
