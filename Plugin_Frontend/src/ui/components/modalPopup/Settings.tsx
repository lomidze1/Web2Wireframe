/** @jsx h */
import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import styles from "./Modal.css";
import {
  useConfig,
  VIEWPORT_OPTIONS,
  DEFAULT_PLUGIN_COLORS,
  PLUGIN_FONT_OPTIONS,
  DEFAULT_PLUGIN_FONT,
} from "../../shared/ConfigContext";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialPanel?: "terminology" | "configuration" | "tutorials";
}

type Panel = "terminology" | "config" | "tutorials";
type TerminologyTab = "viewports" | "colors" | "fonts" | "text";

// Collapsible section states
interface CollapsibleState {
  viewports: boolean;
  colors: boolean;
  pluginColors: boolean;
  fonts: boolean;
  pluginFonts: boolean;
  text: boolean;
}

// localStorage key for collapsed states
const COLLAPSED_STORAGE_KEY = "w2w_settings_collapsed";

// Default collapsed state (all collapsed)
const DEFAULT_COLLAPSED: CollapsibleState = {
  viewports: true,
  colors: true,
  pluginColors: true,
  fonts: true,
  pluginFonts: true,
  text: true,
};

// Safe localStorage helpers
const safeGetCollapsed = (): CollapsibleState => {
  try {
    const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_COLLAPSED, ...JSON.parse(saved) };
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_COLLAPSED;
};

const safeSaveCollapsed = (state: CollapsibleState): void => {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage not available
  }
};

export default function Settings({
  isOpen,
  onClose,
  initialPanel,
}: SettingsProps) {
  const [activePanel, setActivePanel] = useState<Panel>("terminology");
  const [activeTermTab, setActiveTermTab] =
    useState<TerminologyTab>("viewports");
  const { config, updateConfig } = useConfig();
  const [collapsed, setCollapsed] =
    useState<CollapsibleState>(safeGetCollapsed);

  const toggleCollapse = (section: keyof CollapsibleState) => {
    setCollapsed((prev) => {
      const newState = { ...prev, [section]: !prev[section] };
      safeSaveCollapsed(newState);
      return newState;
    });
  };

  // Set active panel based on initialPanel prop
  useEffect(() => {
    if (initialPanel && isOpen) {
      if (initialPanel === "configuration") {
        setActivePanel("config");
      } else if (initialPanel === "terminology") {
        setActivePanel("terminology");
      } else if (initialPanel === "tutorials") {
        setActivePanel("tutorials");
      }
    }
  }, [initialPanel, isOpen]);

  if (!isOpen) return null;

  // Toggle viewport selection
  const toggleViewport = (viewport: string, event?: Event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const current = config.viewports;
    if (current.includes(viewport)) {
      // Don't allow removing last viewport
      if (current.length > 1) {
        updateConfig({ viewports: current.filter((v) => v !== viewport) });
      }
    } else {
      updateConfig({ viewports: [...current, viewport] });
    }
  };

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div class={styles.modalHeader}>
          <span>Assist</span>
          <button class={styles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Panel Navigation */}
        <div class={styles.navRow}>
          <button
            class={`${styles.navBtn} ${
              activePanel === "terminology" ? styles.navBtnActive : ""
            }`}
            onClick={() => setActivePanel("terminology")}
          >
            Terminology
          </button>
          <button
            class={`${styles.navBtn} ${
              activePanel === "config" ? styles.navBtnActive : ""
            }`}
            onClick={() => setActivePanel("config")}
          >
            Configuration
          </button>
          <button
            class={`${styles.navBtn} ${
              activePanel === "tutorials" ? styles.navBtnActive : ""
            }`}
            onClick={() => setActivePanel("tutorials")}
          >
            Tutorials
          </button>
        </div>

        <div class={styles.modalContent}>
          {/* Terminology Tab Buttons */}
          {activePanel === "terminology" && (
            <div class={styles.tabRow}>
              <button
                class={`${styles.tabBtn} ${
                  activeTermTab === "viewports" ? styles.tabBtnActive : ""
                }`}
                onClick={() => setActiveTermTab("viewports")}
              >
                Viewports
              </button>
              <button
                class={`${styles.tabBtn} ${
                  activeTermTab === "colors" ? styles.tabBtnActive : ""
                }`}
                onClick={() => setActiveTermTab("colors")}
              >
                Colors
              </button>
              <button
                class={`${styles.tabBtn} ${
                  activeTermTab === "fonts" ? styles.tabBtnActive : ""
                }`}
                onClick={() => setActiveTermTab("fonts")}
              >
                Fonts
              </button>
              <button
                class={`${styles.tabBtn} ${
                  activeTermTab === "text" ? styles.tabBtnActive : ""
                }`}
                onClick={() => setActiveTermTab("text")}
              >
                Text
              </button>
            </div>
          )}

          {/* Import Options Toggle - Outside scroll area for Config panel */}
          {activePanel === "config" && (
            <div
              class={`${styles.importOptionsToggleRow} ${config.showImportOptions ? styles.toggleEnabled : ""}`}
            >
              <span class={styles.importOptionsToggleIcon}>
                {/* Eye Open SVG */}
                <svg
                  class={`${styles.eyeIcon} ${config.showImportOptions ? styles.eyeIconVisible : styles.eyeIconHidden}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {/* Eye Closed SVG */}
                <svg
                  class={`${styles.eyeIcon} ${config.showImportOptions ? styles.eyeIconHidden : styles.eyeIconVisible}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </span>
              <span class={styles.importOptionsToggleText}>
                Import options popup is{" "}
                {config.showImportOptions ? "enabled" : "disabled"} for W2W
                files.
              </span>
              <label class={styles.importOptionsToggleSwitch}>
                <input
                  type="checkbox"
                  checked={config.showImportOptions}
                  onChange={(e) =>
                    updateConfig({
                      showImportOptions: (e.target as HTMLInputElement).checked,
                    })
                  }
                />
                <span class={styles.importOptionsToggleSlider}></span>
              </label>
            </div>
          )}

          <div class={styles.scrollArea}>
            {/* TERMINOLOGY PANEL */}
            {activePanel === "terminology" && (
              <div>
                {/* Viewports Tab */}
                {activeTermTab === "viewports" && (
                  <div class={styles.accordionList}>
                    <details class={styles.accordion} open>
                      <summary>Desktop Viewports</summary>
                      <div class={styles.accordionContent}>
                        Use 1440px widths for primary layouts. Keep spacing
                        generous to mirror production breakpoints. Some viewport
                        sizes may be locked depending on your plan.
                      </div>
                    </details>
                    <details class={styles.accordion}>
                      <summary>Tablet Viewports</summary>
                      <div class={styles.accordionContent}>
                        Target 768–1024px widths to validate responsive states.
                        Stack complex grids into two columns.
                      </div>
                    </details>
                    <details class={styles.accordion}>
                      <summary>Mobile Viewports</summary>
                      <div class={styles.accordionContent}>
                        Work around 375px. Prioritize vertical flow, larger tap
                        targets, and simplified typography scale.
                      </div>
                    </details>
                  </div>
                )}

                {/* Colors Tab */}
                {activeTermTab === "colors" && (
                  <div class={styles.accordionList}>
                    <details class={styles.accordion} open>
                      <summary>Plugin Colors (5-Color Palette)</summary>
                      <div class={styles.accordionContent}>
                        <p style={{ marginBottom: "12px" }}>
                          Minimalist 5-color wireframe palette optimized for
                          clean, professional wireframes with WCAG AA contrast
                          compliance.
                        </p>
                        <table class={styles.colorReferenceTable}>
                          <thead>
                            <tr>
                              <th>Color</th>
                              <th>Used For</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>
                                <span
                                  class={styles.colorDot}
                                  style={{
                                    background: DEFAULT_PLUGIN_COLORS.text,
                                  }}
                                ></span>
                                text
                              </td>
                              <td>Primary text, headings (dark)</td>
                            </tr>
                            <tr>
                              <td>
                                <span
                                  class={styles.colorDot}
                                  style={{
                                    background:
                                      DEFAULT_PLUGIN_COLORS.background,
                                  }}
                                ></span>
                                background
                              </td>
                              <td>Page background (light)</td>
                            </tr>
                            <tr>
                              <td>
                                <span
                                  class={styles.colorDot}
                                  style={{
                                    background: DEFAULT_PLUGIN_COLORS.secondary,
                                  }}
                                ></span>
                                secondary
                              </td>
                              <td>Borders, placeholders</td>
                            </tr>
                            <tr>
                              <td>
                                <span
                                  class={styles.colorDot}
                                  style={{
                                    background: DEFAULT_PLUGIN_COLORS.surface,
                                  }}
                                ></span>
                                surface
                              </td>
                              <td>Cards, containers, sections</td>
                            </tr>
                            <tr>
                              <td>
                                <span
                                  class={styles.colorDot}
                                  style={{
                                    background: DEFAULT_PLUGIN_COLORS.accent,
                                  }}
                                ></span>
                                accent
                              </td>
                              <td>Buttons, links, CTAs</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </details>
                    <details class={styles.accordion}>
                      <summary>Website Colors</summary>
                      <div class={styles.accordionContent}>
                        Colors detected from the imported site for matching the
                        original branding when you build wireframes.
                      </div>
                    </details>
                  </div>
                )}

                {/* Fonts Tab */}
                {activeTermTab === "fonts" && (
                  <div class={styles.accordionList}>
                    <details class={styles.accordion} open>
                      <summary>Plugin Fonts</summary>
                      <div class={styles.accordionContent}>
                        Quick defaults that ship with the plugin. Use when you
                        need fast mockups without linking brand typefaces.
                      </div>
                    </details>
                    <details class={styles.accordion}>
                      <summary>Website Fonts</summary>
                      <div class={styles.accordionContent}>
                        Fonts we detect from the imported site. Apply these to
                        stay close to the live experience.
                      </div>
                    </details>
                  </div>
                )}

                {/* Text Tab */}
                {activeTermTab === "text" && (
                  <div class={styles.accordionList}>
                    <details class={styles.accordion} open>
                      <summary>Semantic Placeholders</summary>
                      <div class={styles.accordionContent}>
                        Replace website text with neutral labels like "Heading
                        1", "Paragraph", or "List item" to focus on layout
                        structure.
                      </div>
                    </details>
                    <details class={styles.accordion}>
                      <summary>Lorem Ipsum</summary>
                      <div class={styles.accordionContent}>
                        Preserve character counts while replacing copy with
                        Lorem Ipsum so spacing stays accurate without real
                        content.
                      </div>
                    </details>
                    <details class={styles.accordion}>
                      <summary>Website Text</summary>
                      <div class={styles.accordionContent}>
                        Keep the website's original text and lengths for
                        fidelity when mocking the source experience.
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* CONFIGURATION PANEL */}
            {activePanel === "config" && (
              <div class={styles.configStack}>
                {/* Viewports - Collapsible */}
                <div
                  class={`${styles.configSection} ${!collapsed.viewports ? styles.configSectionActive : ""}`}
                >
                  <div
                    class={styles.configTitleCollapsible}
                    onClick={() => toggleCollapse("viewports")}
                  >
                    <span>Viewports</span>
                    <span
                      class={`${styles.collapseArrow} ${collapsed.viewports ? "" : styles.collapseArrowOpen}`}
                    >
                      ▾
                    </span>
                  </div>
                  {!collapsed.viewports && (
                    <Fragment>
                      <div class={styles.configSubtitle}>
                        Select default viewport sizes for wireframe generation.
                        You can choose multiple sizes.
                      </div>
                      <div class={styles.checkboxGrid}>
                        {VIEWPORT_OPTIONS.map((opt) => (
                          <label
                            key={opt.value}
                            class={`${styles.checkboxItem} ${
                              config.viewports.includes(opt.value)
                                ? styles.checked
                                : ""
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              toggleViewport(opt.value);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={config.viewports.includes(opt.value)}
                              readOnly
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                    </Fragment>
                  )}
                </div>

                {/* Colors - Collapsible */}
                <div
                  class={`${styles.configSection} ${!collapsed.colors ? styles.configSectionActive : ""}`}
                >
                  <div
                    class={styles.configTitleCollapsible}
                    onClick={() => toggleCollapse("colors")}
                  >
                    <span>Colors</span>
                    <span
                      class={`${styles.collapseArrow} ${collapsed.colors ? "" : styles.collapseArrowOpen}`}
                    >
                      ▾
                    </span>
                  </div>
                  {!collapsed.colors && (
                    <Fragment>
                      <div class={styles.configSubtitle}>
                        Choose the color source for generated wireframes.
                      </div>
                      <div class={styles.configOptions}>
                        <label
                          class={`${styles.radioItem} ${
                            config.colorMode === "plugin"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-color-mode"
                            value="plugin"
                            checked={config.colorMode === "plugin"}
                            onChange={() =>
                              updateConfig({ colorMode: "plugin" })
                            }
                          />
                          <div class={styles.radioLabel}>
                            <strong>Plugin Colors</strong>
                            <span>Use plugin's default color palette.</span>
                          </div>
                        </label>

                        {/* Color Picker Grid - shown when Plugin Colors is selected */}
                        {config.colorMode === "plugin" && (
                          <div class={styles.colorPickerSection}>
                            <div
                              class={styles.colorPickerHeader}
                              onClick={() => toggleCollapse("pluginColors")}
                            >
                              <span class={styles.colorPickerSubtitle}>
                                Customize colors for your wireframes. These are
                                the original defaults - you can always reset.
                              </span>
                              <span
                                class={`${styles.collapseArrow} ${collapsed.pluginColors ? "" : styles.collapseArrowOpen}`}
                              >
                                ▾
                              </span>
                            </div>
                            {!collapsed.pluginColors && (
                              <div class={styles.colorGrid}>
                                {/* Text Color (dark) */}
                                <div class={styles.colorCard}>
                                  <div class={styles.colorSwatch}>
                                    <input
                                      type="color"
                                      value={
                                        config.pluginColors?.text ||
                                        DEFAULT_PLUGIN_COLORS.text
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            text: (e.target as HTMLInputElement)
                                              .value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                  <div class={styles.colorBody}>
                                    <div class={styles.colorLabel}>text</div>
                                    <input
                                      type="text"
                                      class={styles.colorInput}
                                      value={
                                        config.pluginColors?.text ||
                                        DEFAULT_PLUGIN_COLORS.text
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            text: (e.target as HTMLInputElement)
                                              .value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Background Color (light) */}
                                <div class={styles.colorCard}>
                                  <div class={styles.colorSwatch}>
                                    <input
                                      type="color"
                                      value={
                                        config.pluginColors?.background ||
                                        DEFAULT_PLUGIN_COLORS.background
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            background: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                  <div class={styles.colorBody}>
                                    <div class={styles.colorLabel}>
                                      background
                                    </div>
                                    <input
                                      type="text"
                                      class={styles.colorInput}
                                      value={
                                        config.pluginColors?.background ||
                                        DEFAULT_PLUGIN_COLORS.background
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            background: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Secondary Color (borders, muted text) */}
                                <div class={styles.colorCard}>
                                  <div class={styles.colorSwatch}>
                                    <input
                                      type="color"
                                      value={
                                        config.pluginColors?.secondary ||
                                        DEFAULT_PLUGIN_COLORS.secondary
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            secondary: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                  <div class={styles.colorBody}>
                                    <div class={styles.colorLabel}>
                                      secondary
                                    </div>
                                    <input
                                      type="text"
                                      class={styles.colorInput}
                                      value={
                                        config.pluginColors?.secondary ||
                                        DEFAULT_PLUGIN_COLORS.secondary
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            secondary: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Surface Color (cards, containers) */}
                                <div class={styles.colorCard}>
                                  <div class={styles.colorSwatch}>
                                    <input
                                      type="color"
                                      value={
                                        config.pluginColors?.surface ||
                                        DEFAULT_PLUGIN_COLORS.surface
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            surface: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                  <div class={styles.colorBody}>
                                    <div class={styles.colorLabel}>surface</div>
                                    <input
                                      type="text"
                                      class={styles.colorInput}
                                      value={
                                        config.pluginColors?.surface ||
                                        DEFAULT_PLUGIN_COLORS.surface
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            surface: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Accent Color (buttons, links) */}
                                <div class={styles.colorCard}>
                                  <div class={styles.colorSwatch}>
                                    <input
                                      type="color"
                                      value={
                                        config.pluginColors?.accent ||
                                        DEFAULT_PLUGIN_COLORS.accent
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            accent: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                  <div class={styles.colorBody}>
                                    <div class={styles.colorLabel}>accent</div>
                                    <input
                                      type="text"
                                      class={styles.colorInput}
                                      value={
                                        config.pluginColors?.accent ||
                                        DEFAULT_PLUGIN_COLORS.accent
                                      }
                                      onChange={(e) =>
                                        updateConfig({
                                          pluginColors: {
                                            ...config.pluginColors,
                                            accent: (
                                              e.target as HTMLInputElement
                                            ).value,
                                          },
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Reset Colors Button */}
                                <button
                                  class={styles.resetColorsBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateConfig({
                                      pluginColors: {
                                        ...DEFAULT_PLUGIN_COLORS,
                                      },
                                    });
                                  }}
                                  title="Reset all colors to original defaults"
                                >
                                  Reset to Defaults
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <label
                          class={`${styles.radioItem} ${
                            config.colorMode === "website"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-color-mode"
                            value="website"
                            checked={config.colorMode === "website"}
                            onChange={() =>
                              updateConfig({ colorMode: "website" })
                            }
                          />
                          <div class={styles.radioLabel}>
                            <strong>Website Colors</strong>
                            <span>
                              Use colors detected from the imported website.
                            </span>
                          </div>
                        </label>
                      </div>
                    </Fragment>
                  )}
                </div>

                {/* Fonts - Collapsible */}
                <div
                  class={`${styles.configSection} ${!collapsed.fonts ? styles.configSectionActive : ""}`}
                >
                  <div
                    class={styles.configTitleCollapsible}
                    onClick={() => toggleCollapse("fonts")}
                  >
                    <span>Fonts</span>
                    <span
                      class={`${styles.collapseArrow} ${collapsed.fonts ? "" : styles.collapseArrowOpen}`}
                    >
                      ▾
                    </span>
                  </div>
                  {!collapsed.fonts && (
                    <Fragment>
                      <div class={styles.configSubtitle}>
                        Choose the font source for generated text.
                      </div>
                      <div class={styles.configOptions}>
                        <label
                          class={`${styles.radioItem} ${
                            config.fontMode === "plugin"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-font-mode"
                            value="plugin"
                            checked={config.fontMode === "plugin"}
                            onChange={() =>
                              updateConfig({ fontMode: "plugin" })
                            }
                          />
                          <div class={styles.radioLabel}>
                            <strong>Plugin Fonts</strong>
                            <span>Use plugin's default fonts.</span>
                          </div>
                        </label>

                        {/* Font Picker - shown when Plugin Fonts is selected */}
                        {config.fontMode === "plugin" && (
                          <div class={styles.colorPickerSection}>
                            <div
                              class={styles.colorPickerHeader}
                              onClick={() => toggleCollapse("pluginFonts")}
                            >
                              <span class={styles.colorPickerSubtitle}>
                                Select the font family for all text in
                                wireframes.
                              </span>
                              <span
                                class={`${styles.collapseArrow} ${collapsed.pluginFonts ? "" : styles.collapseArrowOpen}`}
                              >
                                ▾
                              </span>
                            </div>
                            {!collapsed.pluginFonts && (
                              <div class={styles.fontPickerContent}>
                                <select
                                  class={styles.fontSelect}
                                  value={
                                    config.pluginFont || DEFAULT_PLUGIN_FONT
                                  }
                                  onChange={(e) =>
                                    updateConfig({
                                      pluginFont: (
                                        e.target as HTMLSelectElement
                                      ).value,
                                    })
                                  }
                                >
                                  {PLUGIN_FONT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <div
                                  class={styles.fontPreview}
                                  style={{
                                    fontFamily:
                                      config.pluginFont || DEFAULT_PLUGIN_FONT,
                                  }}
                                >
                                  The quick brown fox jumps over the lazy dog.
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <label
                          class={`${styles.radioItem} ${
                            config.fontMode === "website"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-font-mode"
                            value="website"
                            checked={config.fontMode === "website"}
                            onChange={() =>
                              updateConfig({ fontMode: "website" })
                            }
                          />
                          <div class={styles.radioLabel}>
                            <strong>Website Fonts</strong>
                            <span>
                              Use fonts detected from the imported website.
                            </span>
                          </div>
                        </label>
                      </div>
                    </Fragment>
                  )}
                </div>

                {/* Text - Collapsible */}
                <div
                  class={`${styles.configSection} ${!collapsed.text ? styles.configSectionActive : ""}`}
                >
                  <div
                    class={styles.configTitleCollapsible}
                    onClick={() => toggleCollapse("text")}
                  >
                    <span>Text</span>
                    <span
                      class={`${styles.collapseArrow} ${collapsed.text ? "" : styles.collapseArrowOpen}`}
                    >
                      ▾
                    </span>
                  </div>
                  {!collapsed.text && (
                    <Fragment>
                      <div class={styles.configSubtitle}>
                        Control how copy is generated during import.
                      </div>
                      <div class={styles.configOptions}>
                        <label
                          class={`${styles.radioItem} ${
                            config.textMode === "semantic"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-text-mode"
                            value="semantic"
                            checked={config.textMode === "semantic"}
                            onChange={() =>
                              updateConfig({ textMode: "semantic" })
                            }
                          />
                          <div class={styles.radioLabel}>
                            <strong>Semantic Placeholders</strong>
                            <span>
                              Use labels like "Heading 1", "Paragraph", and
                              "List item" instead of real copy.
                            </span>
                          </div>
                        </label>
                        <label
                          class={`${styles.radioItem} ${
                            config.textMode === "lorem"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-text-mode"
                            value="lorem"
                            checked={config.textMode === "lorem"}
                            onChange={() => updateConfig({ textMode: "lorem" })}
                          />
                          <div class={styles.radioLabel}>
                            <strong>Lorem Ipsum</strong>
                            <span>
                              Keep lengths matched to the original website text
                              while swapping to Lorem Ipsum.
                            </span>
                          </div>
                        </label>
                        <label
                          class={`${styles.radioItem} ${
                            config.textMode === "website"
                              ? styles.radioItemActive
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="config-text-mode"
                            value="website"
                            checked={config.textMode === "website"}
                            onChange={() =>
                              updateConfig({ textMode: "website" })
                            }
                          />
                          <div class={styles.radioLabel}>
                            <strong>Website Text</strong>
                            <span>
                              Keep the website's original text with its original
                              size/length.
                            </span>
                          </div>
                        </label>
                      </div>
                    </Fragment>
                  )}
                </div>
              </div>
            )}

            {/* TUTORIALS PANEL */}
            {activePanel === "tutorials" && (
              <div>
                <div class={styles.videoHeader}>
                  <h1>Video tutorials</h1>
                  <h2>Please visit our YouTube channel.</h2>
                </div>
                <div class={styles.videoActions}>
                  <a
                    class={styles.channelBtn}
                    href="https://www.youtube.com/@Web2Wireframe"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View YouTube channel
                  </a>
                </div>
                <div class={styles.videoList}>
                  <div class={styles.videoCard}>
                    <div class={styles.videoThumb}></div>
                    <div class={styles.videoMeta}>
                      <div class={styles.videoTitle}>Import basics</div>
                      <a
                        class={styles.videoLink}
                        href="https://www.youtube.com/watch?v=VIDEO_ID_1"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Watch tutorial
                      </a>
                    </div>
                  </div>
                  <div class={styles.videoCard}>
                    <div class={styles.videoThumb}></div>
                    <div class={styles.videoMeta}>
                      <div class={styles.videoTitle}>Color tokens</div>
                      <a
                        class={styles.videoLink}
                        href="https://www.youtube.com/watch?v=VIDEO_ID_2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Watch tutorial
                      </a>
                    </div>
                  </div>
                  <div class={styles.videoCard}>
                    <div class={styles.videoThumb}></div>
                    <div class={styles.videoMeta}>
                      <div class={styles.videoTitle}>Font variables</div>
                      <a
                        class={styles.videoLink}
                        href="https://www.youtube.com/watch?v=VIDEO_ID_3"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Watch tutorial
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
