/** @jsx h */
import { h } from "preact";
import { VIEWPORT_OPTIONS } from "../../shared/ConfigContext";

export interface SettingsPanelStyles {
  settingsBox?: string;
  settingRow: string;
  settingLabel: string;
  checkboxGroup: string;
  checkboxItem: string;
  checked: string;
  collapseToggle: string;
  active?: string;
  collapseArrow: string;
  expanded?: string;
  collapsibleContent: string;
  dropdown: string;
  settingsFooter: string;
  configureBtn: string;
  resetBtn: string;
  resetBtnDisabled: string;
  saveDefaultBtn: string;
  saveDefaultBtnDisabled: string;
}

export interface SettingsPanelProps {
  // Styles object from the parent component's CSS module
  styles: SettingsPanelStyles;

  // Expand/collapse state
  isExpanded: boolean;
  toggleExpanded: () => void;

  // Local values
  localViewports: string[];
  localColorMode: "plugin" | "website";
  localFontMode: "plugin" | "website";
  localTextMode: "semantic" | "lorem" | "website";
  localCssVariablesMode?: "styles" | "direct";
  localLayoutMode?: "autoLayout" | "absolute";

  // Handlers
  toggleViewport: (viewport: string, event?: Event) => void;
  setColorMode: (mode: "plugin" | "website") => void;
  setFontMode: (mode: "plugin" | "website") => void;
  setTextMode: (mode: "semantic" | "lorem" | "website") => void;
  setCssVariablesMode?: (mode: "styles" | "direct") => void;
  setLayoutMode?: (mode: "autoLayout" | "absolute") => void;
  handleReset: () => void;
  handleSaveAsDefault: () => void;

  // State flags
  hasOverrides: boolean;

  // Config callback
  openSettings?: (panel: "terminology" | "configuration" | "tutorials") => void;

  // Optional: wrapper class name (some tabs use different container names)
  containerClassName?: string;
}

/**
 * Shared SettingsPanel component that renders:
 * - Viewports multi-select checkboxes
 * - More Options collapsible section with Colors/Fonts/Text dropdowns
 * - Footer with Config and Reset buttons
 *
 * Used by Web.tsx, Screenshot.tsx, HTML.tsx
 */
export default function SettingsPanel({
  styles,
  isExpanded,
  toggleExpanded,
  localViewports,
  localColorMode,
  localFontMode,
  localTextMode,
  localCssVariablesMode,
  localLayoutMode,
  toggleViewport,
  setColorMode,
  setFontMode,
  setTextMode,
  setCssVariablesMode,
  setLayoutMode,
  handleReset,
  handleSaveAsDefault,
  hasOverrides,
  openSettings,
  containerClassName,
}: SettingsPanelProps) {
  return (
    <div class={containerClassName || styles.settingsBox}>
      {/* Viewports - Multi-select */}
      <div class={styles.settingRow}>
        <div class={styles.settingLabel}>
          <span>📐</span>
          <span>Viewports</span>
        </div>
        <div class={styles.checkboxGroup}>
          {VIEWPORT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              class={`${styles.checkboxItem} ${
                localViewports.includes(opt.value) ? styles.checked : ""
              }`}
              onClick={(e) => {
                e.preventDefault();
                toggleViewport(opt.value);
              }}
            >
              <input
                type="checkbox"
                checked={localViewports.includes(opt.value)}
                readOnly
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Collapsible Header */}
      <button
        class={`${styles.collapseToggle} ${
          isExpanded ? styles.active || "" : ""
        }`}
        onClick={toggleExpanded}
      >
        <span>⚙️ More Options</span>
        <span
          class={`${styles.collapseArrow} ${
            isExpanded ? styles.expanded || "" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div class={styles.collapsibleContent}>
          {/* Colors */}
          <div class={styles.settingRow}>
            <div class={styles.settingLabel}>
              <span>🎨</span>
              <span>Colors</span>
            </div>
            <select
              class={styles.dropdown}
              value={localColorMode}
              onChange={(e) =>
                setColorMode(
                  (e.target as HTMLSelectElement).value as "plugin" | "website"
                )
              }
            >
              <option value="plugin">Plugin Colors (Editable)</option>
              <option value="website">Website Colors</option>
            </select>
          </div>

          {/* Fonts */}
          <div class={styles.settingRow}>
            <div class={styles.settingLabel}>
              <span>🔤</span>
              <span>Fonts</span>
            </div>
            <select
              class={styles.dropdown}
              value={localFontMode}
              onChange={(e) =>
                setFontMode(
                  (e.target as HTMLSelectElement).value as "plugin" | "website"
                )
              }
            >
              <option value="plugin">Plugin Fonts (Editable)</option>
              <option value="website">Website Fonts</option>
            </select>
          </div>

          {/* Text */}
          <div class={styles.settingRow}>
            <div class={styles.settingLabel}>
              <span>📝</span>
              <span>Text</span>
            </div>
            <select
              class={styles.dropdown}
              value={localTextMode}
              onChange={(e) =>
                setTextMode(
                  (e.target as HTMLSelectElement).value as
                    | "semantic"
                    | "lorem"
                    | "website"
                )
              }
            >
              <option value="semantic">Semantic Placeholders</option>
              <option value="lorem">Lorem Ipsum</option>
              <option value="website">Website Text</option>
            </select>
          </div>

          {/* CSS Variables */}
          {setCssVariablesMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>🎯</span>
                <span>CSS Variables</span>
              </div>
              <select
                class={styles.dropdown}
                value={localCssVariablesMode || "direct"}
                onChange={(e) =>
                  setCssVariablesMode(
                    (e.target as HTMLSelectElement).value as "styles" | "direct"
                  )
                }
              >
                <option value="direct">Direct Value</option>
                <option value="styles">Create Figma Styles</option>
              </select>
            </div>
          )}

          {/* Layout Mode */}
          {setLayoutMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>📐</span>
                <span>Layout Mode</span>
              </div>
              <select
                class={styles.dropdown}
                value={localLayoutMode || "autoLayout"}
                onChange={(e) =>
                  setLayoutMode(
                    (e.target as HTMLSelectElement).value as
                      | "autoLayout"
                      | "absolute"
                  )
                }
              >
                <option value="autoLayout">Auto Layout (Editable)</option>
                <option value="absolute">Absolute (Pixel-perfect)</option>
              </select>
            </div>
          )}

          {/* Footer with Config, Reset, and Save as Default buttons */}
          <div class={styles.settingsFooter}>
            <button
              class={styles.configureBtn}
              onClick={() => openSettings && openSettings("configuration")}
              title="Open Configuration settings"
            >
              Config.
            </button>
            <button
              class={`${styles.resetBtn} ${
                !hasOverrides ? styles.resetBtnDisabled : ""
              }`}
              onClick={handleReset}
              disabled={!hasOverrides}
              title="Reset to default configuration"
            >
              Reset
            </button>
            <button
              class={`${styles.saveDefaultBtn} ${
                !hasOverrides ? styles.saveDefaultBtnDisabled : ""
              }`}
              onClick={handleSaveAsDefault}
              disabled={!hasOverrides}
              title="Save current settings as default configuration"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
