/** @jsx h */
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import styles from "./Modal.css";
import { useConfig } from "../../shared/ConfigContext";

// Type exports for consumers
export type ColorMode = "plugin" | "website";
export type FontMode = "plugin" | "website" | "lines";
export type TextMode = "lorem" | "semantic" | "website";
export type CssVariablesMode = "styles" | "direct";
export type LayoutMode = "autoLayout" | "absolute";

export type AssetMode = "placeholders" | "realAssets";

export interface UnifiedImportOptions {
  colorMode: ColorMode;
  fontMode: FontMode;
  textMode: TextMode;
  cssVariablesMode: CssVariablesMode;
  layoutMode: LayoutMode;
  assetMode?: AssetMode;
}

// Legacy interface for backward compatibility
export interface ImportOptions {
  colorMode: ColorMode;
  fontMode: FontMode;
  textMode: TextMode;
}

// Detected colors from website capture
export interface DetectedColors {
  background: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  main: string;
  source: {
    totalElements: number;
    backgroundSamples: number;
    textSamples: number;
    accentSamples: number;
  };
}

interface UnifiedImportOptionsModalProps {
  isOpen: boolean;
  onConfirm: (options: UnifiedImportOptions) => void;
  onCancel: () => void;
  sourceUrl?: string;
  hasCssVariables?: boolean;
}

export default function ImportOptionsModal({
  isOpen,
  onConfirm,
  onCancel,
  sourceUrl,
  hasCssVariables = false,
}: UnifiedImportOptionsModalProps) {
  const { config, updateConfig } = useConfig();

  // Initialize from Settings defaults
  const [options, setOptions] = useState<UnifiedImportOptions>({
    colorMode: config.colorMode,
    fontMode: config.fontMode,
    textMode: config.textMode,
    cssVariablesMode: config.cssVariablesDefault,
    layoutMode: config.layoutModeDefault,
    assetMode: config.assetMode,
  });

  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Sync with config when modal opens
  useEffect(() => {
    if (isOpen) {
      setOptions({
        colorMode: config.colorMode,
        fontMode: config.fontMode,
        textMode: config.textMode,
        cssVariablesMode: config.cssVariablesDefault,
        layoutMode: config.layoutModeDefault,
        assetMode: config.assetMode,
      });
      setDontShowAgain(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    // If "Don't show again" is checked, update settings
    if (dontShowAgain) {
      updateConfig({
        showImportOptions: false,
        colorMode: options.colorMode,
        fontMode: options.fontMode,
        textMode: options.textMode,
        cssVariablesDefault: options.cssVariablesMode,
        layoutModeDefault: options.layoutMode,
        assetMode: options.assetMode,
      });
    }
    onConfirm(options);
  };

  const handleCancel = () => {
    // Save "Don't show again" preference even on cancel/close
    if (dontShowAgain) {
      updateConfig({ showImportOptions: false });
    }
    onCancel();
  };

  // Get display URL (full path without protocol)
  const getDisplayUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  };

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.unifiedImportModal}`}>
        {/* Header */}
        <div class={styles.modalHeader}>
          <span>Import Options</span>
          <button class={styles.modalClose} onClick={handleCancel}>
            &times;
          </button>
        </div>

        <div class={styles.modalContent}>
          {/* Source URL display */}
          {sourceUrl && (
            <p class={styles.importOptionsUrl}>
              Importing: <strong>{getDisplayUrl(sourceUrl)}</strong>
            </p>
          )}

          {/* Scrollable options area */}
          <div class={styles.unifiedOptionsScroll}>
            {/* Colors Dropdown */}
            <div class={styles.unifiedOptionRow}>
              <label class={styles.unifiedOptionLabel}>Colors</label>
              <select
                class={styles.unifiedDropdown}
                value={options.colorMode}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    colorMode: (e.target as HTMLSelectElement)
                      .value as ColorMode,
                  }))
                }
              >
                <option value="website">Website Colors</option>
                <option value="plugin">Plugin Colors</option>
              </select>
            </div>

            {/* Fonts Dropdown */}
            <div class={styles.unifiedOptionRow}>
              <label class={styles.unifiedOptionLabel}>Fonts</label>
              <select
                class={styles.unifiedDropdown}
                value={options.fontMode}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    fontMode: (e.target as HTMLSelectElement).value as FontMode,
                  }))
                }
              >
                <option value="website">Website Fonts</option>
                <option value="plugin">Plugin Fonts</option>
                <option value="lines">Wireframe Lines</option>
              </select>
            </div>

            {/* Text Content Dropdown */}
            <div class={styles.unifiedOptionRow}>
              <label class={styles.unifiedOptionLabel}>Text Content</label>
              <select
                class={styles.unifiedDropdown}
                value={options.textMode}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    textMode: (e.target as HTMLSelectElement).value as TextMode,
                  }))
                }
              >
                <option value="website">Website Text</option>
                <option value="lorem">Lorem Ipsum</option>
                <option value="semantic">Semantic Placeholders</option>
              </select>
            </div>

            {/* Assets Dropdown */}
            <div class={styles.unifiedOptionRow}>
              <label class={styles.unifiedOptionLabel}>Assets</label>
              <select
                class={styles.unifiedDropdown}
                value={options.assetMode || "placeholders"}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    assetMode: (e.target as HTMLSelectElement)
                      .value as AssetMode,
                  }))
                }
              >
                <option value="placeholders">Plugin Placeholders</option>
                <option value="realAssets">Real Assets</option>
              </select>
            </div>

            {/* CSS Variables Dropdown - Only show if hasCssVariables */}
            {hasCssVariables && (
              <div class={styles.unifiedOptionRow}>
                <label class={styles.unifiedOptionLabel}>CSS Variables</label>
                <select
                  class={styles.unifiedDropdown}
                  value={options.cssVariablesMode}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      cssVariablesMode: (e.target as HTMLSelectElement)
                        .value as CssVariablesMode,
                    }))
                  }
                >
                  <option value="direct">Direct Value</option>
                  <option value="styles">Create Figma Styles</option>
                </select>
              </div>
            )}

            {/* Layout Mode Dropdown */}
            <div class={styles.unifiedOptionRow}>
              <label class={styles.unifiedOptionLabel}>Layout Mode</label>
              <select
                class={styles.unifiedDropdown}
                value={options.layoutMode}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    layoutMode: (e.target as HTMLSelectElement)
                      .value as LayoutMode,
                  }))
                }
              >
                <option value="autoLayout">Auto Layout (Editable)</option>
                <option value="absolute">Absolute (Pixel-perfect)</option>
              </select>
            </div>
          </div>

          {/* Don't show again - compact toggle */}
          <div class={styles.dontShowAgainCompact}>
            <span class={styles.dontShowAgainLabel}>Don't show this again</span>
            <label class={styles.dontShowAgainToggle}>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) =>
                  setDontShowAgain((e.target as HTMLInputElement).checked)
                }
              />
              <span class={styles.dontShowAgainSlider}></span>
            </label>
          </div>
          {dontShowAgain && (
            <span class={styles.dontShowAgainHint}>
              Restore anytime from Config or press{" "}
              <strong>
                {navigator.platform?.includes("Mac") ? "⌘ + R" : "Ctrl + R"}
              </strong>
            </span>
          )}
        </div>

        {/* Footer buttons */}
        <div class={styles.importOptionsFooter}>
          <button class={styles.importOptionsCancelBtn} onClick={handleCancel}>
            Cancel
          </button>
          <button
            class={styles.importOptionsConfirmBtn}
            onClick={handleConfirm}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
