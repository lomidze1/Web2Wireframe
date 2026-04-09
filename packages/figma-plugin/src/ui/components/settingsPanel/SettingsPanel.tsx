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
  localFontMode: "plugin" | "website" | "lines";
  localTextMode: "semantic" | "lorem" | "website";
  localCssVariablesMode?: "styles" | "direct";
  localLayoutMode?: "autoLayout" | "absolute";
  localAssetMode?: "placeholders" | "realAssets";

  // Handlers
  toggleViewport: (viewport: string, event?: Event) => void;
  setColorMode: (mode: "plugin" | "website") => void;
  setFontMode: (mode: "plugin" | "website" | "lines") => void;
  setTextMode: (mode: "semantic" | "lorem" | "website") => void;
  setCssVariablesMode?: (mode: "styles" | "direct") => void;
  setLayoutMode?: (mode: "autoLayout" | "absolute") => void;
  setAssetMode?: (mode: "placeholders" | "realAssets") => void;
  handleReset: () => void;
  handleSaveAsDefault: () => void;

  // State flags
  hasOverrides: boolean;

  // Config callback
  openSettings?: (panel: "terminology" | "configuration" | "tutorials") => void;

  // Optional: wrapper class name (some tabs use different container names)
  containerClassName?: string;

  // Optional: custom label for the "Website Colors" option (e.g. "Screenshot Colors")
  colorWebsiteLabel?: string;

  // Optional: disable the "Website Fonts" option in the fonts dropdown
  disableFontWebsiteOption?: boolean;

  // Optional: tooltip text for disabled font option
  fontDisabledTooltip?: string;

  // Optional: custom label for the "Website Fonts" option (e.g. "Code Fonts")
  fontWebsiteLabel?: string;

  // Optional: custom label for the "Website Text" option (e.g. "Code Text")
  textWebsiteLabel?: string;

  // Optional: disable the "Semantic Placeholders" option in the text dropdown
  disableSemanticOption?: boolean;

  // Optional: tooltip text for disabled semantic option
  semanticDisabledTooltip?: string;

  // Optional: disable the "Auto Layout" option in the layout dropdown
  disableAutoLayoutOption?: boolean;

  // Optional: tooltip text for disabled layout option
  layoutDisabledTooltip?: string;

  // Optional: disable the "Real Assets" option in the assets dropdown
  disableRealAssetsOption?: boolean;

  // Optional: tooltip text for disabled assets option
  assetsDisabledTooltip?: string;

  // Interaction mode
  localInteractionMode?: "none" | "variants";
  setInteractionMode?: (mode: "none" | "variants") => void;

  // Optional: disable the "Interactive States" option in the interactions dropdown
  disableInteractionsVariants?: boolean;

  // Optional: tooltip text for disabled interactions option
  interactionsDisabledTooltip?: string;

  // Optional: hide viewports section (e.g. for AreaSelection where viewports are in the file)
  hideViewports?: boolean;
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
  localAssetMode,
  toggleViewport,
  setColorMode,
  setFontMode,
  setTextMode,
  setCssVariablesMode,
  setLayoutMode,
  setAssetMode,
  handleReset,
  handleSaveAsDefault,
  hasOverrides,
  openSettings,
  containerClassName,
  colorWebsiteLabel,
  disableFontWebsiteOption,
  fontDisabledTooltip,
  fontWebsiteLabel,
  textWebsiteLabel,
  disableSemanticOption,
  semanticDisabledTooltip,
  disableAutoLayoutOption,
  layoutDisabledTooltip,
  disableRealAssetsOption,
  assetsDisabledTooltip,
  localInteractionMode,
  setInteractionMode,
  disableInteractionsVariants,
  interactionsDisabledTooltip,
  hideViewports,
}: SettingsPanelProps) {
  return (
    <div class={containerClassName || styles.settingsBox}>
      {/* Viewports - Multi-select (hidden when hideViewports is true) */}
      {!hideViewports && (
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
      )}

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
              <option value="plugin">Plugin Colors</option>
              <option value="website">{colorWebsiteLabel || "Website Colors"}</option>
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
                  (e.target as HTMLSelectElement).value as "plugin" | "website" | "lines"
                )
              }
            >
              <option value="plugin">Plugin Fonts</option>
              <option
                value="website"
                disabled={disableFontWebsiteOption}
                title={disableFontWebsiteOption ? fontDisabledTooltip : undefined}
              >
                {fontWebsiteLabel || "Website Fonts"}
              </option>
              <option value="lines">Wireframe Lines</option>
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
              <option
                value="semantic"
                disabled={disableSemanticOption}
                title={disableSemanticOption ? semanticDisabledTooltip : undefined}
              >
                Semantic Placeholders
              </option>
              <option value="lorem">Lorem Ipsum</option>
              <option value="website">{textWebsiteLabel || "Website Text"}</option>
            </select>
          </div>

          {/* Assets */}
          {setAssetMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>🖼️</span>
                <span>Assets</span>
              </div>
              <select
                class={styles.dropdown}
                value={localAssetMode || "placeholders"}
                onChange={(e) =>
                  setAssetMode(
                    (e.target as HTMLSelectElement).value as
                      | "placeholders"
                      | "realAssets"
                  )
                }
              >
                <option value="placeholders">Plugin Placeholders</option>
                <option
                  value="realAssets"
                  disabled={disableRealAssetsOption}
                  title={disableRealAssetsOption ? assetsDisabledTooltip : undefined}
                >
                  Real Assets
                </option>
              </select>
            </div>
          )}

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
                <option
                  value="autoLayout"
                  disabled={disableAutoLayoutOption}
                  title={disableAutoLayoutOption ? layoutDisabledTooltip : undefined}
                >
                  Auto Layout
                </option>
                <option value="absolute">Absolute (Pixel-perfect)</option>
              </select>
            </div>
          )}

          {/* Interactions */}
          {setInteractionMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>🎯</span>
                <span>Interactions</span>
              </div>
              <select
                class={styles.dropdown}
                value={localInteractionMode || "none"}
                onChange={(e) =>
                  setInteractionMode(
                    (e.target as HTMLSelectElement).value as "none" | "variants"
                  )
                }
              >
                <option value="none">None</option>
                <option
                  value="variants"
                  disabled={disableInteractionsVariants}
                  title={disableInteractionsVariants ? interactionsDisabledTooltip : undefined}
                >
                  Interactive States
                </option>
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
