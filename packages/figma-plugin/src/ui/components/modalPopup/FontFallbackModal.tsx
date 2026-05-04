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
  extractedFonts?: Array<{
    family?: string;
    fontFamily?: string;
    style?: string;
    weight?: string;
    format?: string;
    src?: string;
    fontBase64?: string;
    fontMimeType?: string;
    /** Real family name read from the SFNT `name` table on the server.
     *  When present, "Use original fonts" maps the CSS-declared family to
     *  this name so the post-render rebind action can match it against
     *  what Figma will actually have installed. */
    realFamily?: string;
    realSubfamily?: string;
  }>;
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
  /** Live ZIP-creation progress (0..100) while downloading, otherwise null. */
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  /** Inline notice shown beneath the download button.
   *  - "warning" → ZIP delivered but missing some fonts (partial failure)
   *  - "error"   → download itself failed entirely (no ZIP delivered) */
  const [downloadNotice, setDownloadNotice] = useState<
    | { kind: "warning" | "error"; message: string }
    | null
  >(null);
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
    // Map each missing CSS-declared family to its **real** family name from
    // the SFNT `name` table when the API supplied one. Anti-piracy aliased
    // sites (paulstamatiou.com → "PSC", "PSA", etc.) declare CSS short
    // codes but the actual installed font carries a different family
    // ("PPCirka", "Averta Std"). The marker we'll later stamp onto each
    // text node must hold the real name so that, post-install,
    // `loadFontAsync({ family: realName })` actually resolves.
    //
    // Identity fallback when realFamily is absent (Google Fonts, Roboto,
    // etc. — CSS family already matches the installed name).
    const mapping: FontMapping = {};
    for (const font of missingFonts) {
      const ef = extractedFonts?.find(
        (e) => (e.fontFamily ?? e.family) === font,
      );
      mapping[font] = ef?.realFamily || font;
    }
    onChoice("continue", mapping);
  };

  const handleDownloadFonts = async () => {
    if (!fontDownloads || fontDownloads.length === 0) return;
    setIsDownloading(true);
    setDownloadNotice(null);
    setZipProgress(0);
    try {
      const entries = buildFontDownloadEntries(fontDownloads, extractedFonts);

      if (entries.length === 0) {
        setDownloadNotice({
          kind: "error",
          message: "No font files were available to download.",
        });
        return;
      }
      const { blob, skippedEntries } = await createFontsZipBlob(
        entries,
        (percent) => setZipProgress(percent)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fonts.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Surface partial failures so the user isn't left wondering why a font is
      // missing from their ZIP.
      if (skippedEntries.length > 0) {
        setDownloadNotice({
          kind: "warning",
          message: `${skippedEntries.length} font file${
            skippedEntries.length === 1 ? "" : "s"
          } could not be packaged (skipped).`,
        });
      }
    } catch {
      setDownloadNotice({
        kind: "error",
        message: "Download failed. Please try again.",
      });
    } finally {
      setIsDownloading(false);
      setZipProgress(null);
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

          <div class={`${styles.variablesOptions} ${styles.fontFallbackOptions}`}>
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
                      {isDownloading
                        ? zipProgress != null
                          ? `Downloading... ${zipProgress}%`
                          : "Downloading..."
                        : "Download fonts (.zip)"}
                    </button>
                  )}
                  {downloadNotice && (
                    <div
                      class={
                        downloadNotice.kind === "error"
                          ? styles.fontDownloadError
                          : styles.fontDownloadWarning
                      }
                      role="status"
                    >
                      {downloadNotice.message}
                    </div>
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
