/** @jsx h */
import { h } from "preact";
import { useRef, useEffect } from "preact/hooks";
import { VIEWPORT_OPTIONS } from "../../shared/ConfigContext";

export interface SettingsPanelStyles {
  settingsBox?: string;
  settingRow: string;
  settingLabel: string;
  checkboxGroup: string;
  checkboxItem: string;
  checked: string;
  segmentGroup: string;
  segmentItem: string;
  segmentActive: string;
  segmentDisabled: string;
  collapseToggle: string;
  active?: string;
  collapseArrow: string;
  expanded?: string;
  collapsibleContent: string;
  settingsHint: string;
  hintBulb?: string;
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

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  tooltip?: string;
}

/**
 * Inline single-select segmented control for 2-option settings.
 * Reuses the viewport pill visual language (`styles.checked` = teal highlight).
 */
function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  styles,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  styles: SettingsPanelStyles;
}) {
  return (
    <div class={styles.segmentGroup} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={opt.disabled}
            title={opt.disabled ? opt.tooltip : undefined}
            class={`${styles.segmentItem} ${
              isActive ? styles.segmentActive : ""
            } ${opt.disabled ? styles.segmentDisabled : ""}`}
            onClick={() => !opt.disabled && onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared SettingsPanel component that renders:
 * - Viewports multi-select checkboxes
 * - More Options collapsible section with Colors/Fonts/Text/Assets/etc. settings
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
  // When the section is opened, bring the whole options block into view so it
  // isn't left cut off below the fold. Only fires on the collapsed→expanded
  // transition, never on initial mount.
  const contentRef = useRef<HTMLDivElement>(null);
  const prevExpanded = useRef(isExpanded);
  useEffect(() => {
    if (isExpanded && !prevExpanded.current) {
      contentRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }
    prevExpanded.current = isExpanded;
  }, [isExpanded]);

  return (
    <div class={containerClassName || styles.settingsBox}>
      {/* Viewports - Multi-select (hidden when hideViewports is true) */}
      {!hideViewports && (
        <div class={styles.settingRow}>
          <div class={styles.settingLabel}>
            <span aria-hidden="true">📐</span>
            <span>Viewports</span>
          </div>
          <div class={styles.checkboxGroup} role="group" aria-label="Viewports">
            {VIEWPORT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                class={`${styles.checkboxItem} ${
                  localViewports.includes(opt.value) ? styles.checked : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={localViewports.includes(opt.value)}
                  onChange={() => toggleViewport(opt.value)}
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

      {/* Advertises the options while collapsed; once expanded the options are
          visible so the hint is redundant and only adds clutter. */}
      {!isExpanded && (
        <p class={styles.settingsHint}>
          <span class={styles.hintBulb}>💡</span> Try different settings —
          colors, fonts and assets change the result a lot.
        </p>
      )}

      {/* Collapsible Content */}
      {isExpanded && (
        <div class={styles.collapsibleContent} ref={contentRef}>
          {/* Colors */}
          <div class={styles.settingRow}>
            <div class={styles.settingLabel}>
              <span>🎨</span>
              <span>Colors</span>
            </div>
            <SegmentedToggle
              ariaLabel="Colors"
              styles={styles}
              value={localColorMode}
              onChange={setColorMode}
              options={[
                { value: "website", label: colorWebsiteLabel || "Website" },
                { value: "plugin", label: "Plugin" },
              ]}
            />
          </div>

          {/* Fonts */}
          <div class={styles.settingRow}>
            <div class={styles.settingLabel}>
              <span>🔤</span>
              <span>Fonts</span>
            </div>
            <SegmentedToggle
              ariaLabel="Fonts"
              styles={styles}
              value={localFontMode}
              onChange={setFontMode}
              options={[
                {
                  value: "website",
                  label: fontWebsiteLabel || "Website",
                  disabled: disableFontWebsiteOption,
                  tooltip: fontDisabledTooltip,
                },
                { value: "plugin", label: "Plugin" },
                { value: "lines", label: "Wireframe" },
              ]}
            />
          </div>

          {/* Text */}
          <div class={styles.settingRow}>
            <div class={styles.settingLabel}>
              <span>📝</span>
              <span>Text</span>
            </div>
            <SegmentedToggle
              ariaLabel="Text"
              styles={styles}
              value={localTextMode}
              onChange={setTextMode}
              options={[
                { value: "website", label: textWebsiteLabel || "Website" },
                {
                  value: "semantic",
                  label: "Smart",
                  disabled: disableSemanticOption,
                  tooltip: semanticDisabledTooltip,
                },
                { value: "lorem", label: "Lorem" },
              ]}
            />
          </div>

          {/* Assets */}
          {setAssetMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>🖼️</span>
                <span>Assets</span>
              </div>
              <SegmentedToggle
                ariaLabel="Assets"
                styles={styles}
                value={localAssetMode || "placeholders"}
                onChange={setAssetMode}
                options={[
                  { value: "placeholders", label: "Placeholders" },
                  {
                    value: "realAssets",
                    label: "Real Assets",
                    disabled: disableRealAssetsOption,
                    tooltip: assetsDisabledTooltip,
                  },
                ]}
              />
            </div>
          )}

          {/* CSS Variables */}
          {setCssVariablesMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>🎯</span>
                <span>CSS Variables</span>
              </div>
              <SegmentedToggle
                ariaLabel="CSS Variables"
                styles={styles}
                value={localCssVariablesMode || "direct"}
                onChange={setCssVariablesMode}
                options={[
                  { value: "direct", label: "Direct" },
                  { value: "styles", label: "Figma Styles" },
                ]}
              />
            </div>
          )}

          {/* Layout Mode */}
          {setLayoutMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span aria-hidden="true">📐</span>
                <span>Layout Mode</span>
              </div>
              <SegmentedToggle
                ariaLabel="Layout Mode"
                styles={styles}
                value={localLayoutMode || "autoLayout"}
                onChange={setLayoutMode}
                options={[
                  {
                    value: "autoLayout",
                    label: "Auto Layout",
                    disabled: disableAutoLayoutOption,
                    tooltip: layoutDisabledTooltip,
                  },
                  { value: "absolute", label: "Absolute" },
                ]}
              />
            </div>
          )}

          {/* Interactions — TEMPORARILY HIDDEN FOR LAUNCH (2026-05-12). Restore by removing `false &&` wrapper. */}
          {/* eslint-disable-next-line no-constant-binary-expression */}
          {false && setInteractionMode && (
            <div class={styles.settingRow}>
              <div class={styles.settingLabel}>
                <span>🎯</span>
                <span>Interactions</span>
              </div>
              <select
                class={styles.dropdown}
                value={localInteractionMode || "none"}
                onChange={(e) =>
                  setInteractionMode!(
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
