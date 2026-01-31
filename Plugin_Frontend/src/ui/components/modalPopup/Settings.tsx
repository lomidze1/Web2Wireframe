/** @jsx h */
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import styles from "./Modal.css";
import {
  useConfig,
  VIEWPORT_OPTIONS,
  DEFAULT_PLUGIN_COLORS,
} from "../../shared/ConfigContext";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialPanel?: "terminology" | "configuration" | "tutorials";
}

type Panel = "terminology" | "config" | "tutorials";
type TerminologyTab = "viewports" | "colors" | "fonts" | "text";

export default function Settings({
  isOpen,
  onClose,
  initialPanel,
}: SettingsProps) {
  const [activePanel, setActivePanel] = useState<Panel>("terminology");
  const [activeTermTab, setActiveTermTab] =
    useState<TerminologyTab>("viewports");
  const { config, updateConfig } = useConfig();

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
    console.log("[Settings] toggleViewport called:", viewport);
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
                      <summary>Plugin Colors</summary>
                      <div class={styles.accordionContent}>
                        Palette generated inside the plugin so you can mock
                        quickly without touching your source design tokens. Our
                        plugin colors include a soft blue (#3b82f6), slate gray
                        (#b7c1cc), deep charcoal (#0c0d12), and clean off-white
                        (#f7f8fb).
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
                <div class={styles.configSection}>
                  <div class={styles.configTitle}>Viewports</div>
                  <div class={styles.configSubtitle}>
                    Select default viewport sizes for wireframe generation. You
                    can choose multiple sizes.
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
                </div>

                <div class={styles.configSection}>
                  <div class={styles.configTitle}>Colors</div>
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
                        onChange={() => updateConfig({ colorMode: "plugin" })}
                      />
                      <div class={styles.radioLabel}>
                        <strong>Plugin Colors</strong>
                        <span>Use plugin's default color palette.</span>
                      </div>
                    </label>

                    {/* Color Picker Grid - shown when Plugin Colors is selected */}
                    {config.colorMode === "plugin" && (
                      <div class={styles.colorPickerSection}>
                        <div class={styles.colorPickerSubtitle}>
                          Replace default plugin colors. Drag or type your
                          values to match branding or stay fast with defaults.
                        </div>
                        <div class={styles.colorGrid}>
                          {/* Main Color */}
                          <div class={styles.colorCard}>
                            <div class={styles.colorSwatch}>
                              <input
                                type="color"
                                value={
                                  config.pluginColors?.main ||
                                  DEFAULT_PLUGIN_COLORS.main
                                }
                                onChange={(e) =>
                                  updateConfig({
                                    pluginColors: {
                                      ...config.pluginColors,
                                      main: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div class={styles.colorBody}>
                              <div class={styles.colorLabel}>
                                Plugin variable: main
                              </div>
                              <input
                                type="text"
                                class={styles.colorInput}
                                value={
                                  config.pluginColors?.main ||
                                  DEFAULT_PLUGIN_COLORS.main
                                }
                                onChange={(e) =>
                                  updateConfig({
                                    pluginColors: {
                                      ...config.pluginColors,
                                      main: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>

                          {/* Text Color */}
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
                              <div class={styles.colorLabel}>
                                Plugin variable: text
                              </div>
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

                          {/* Accent Color */}
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
                                      accent: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div class={styles.colorBody}>
                              <div class={styles.colorLabel}>
                                Plugin variable: accent
                              </div>
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
                                      accent: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>

                          {/* Surface Color */}
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
                                      surface: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div class={styles.colorBody}>
                              <div class={styles.colorLabel}>
                                Plugin variable: surface
                              </div>
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
                                      surface: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>

                          {/* Border Color */}
                          <div class={styles.colorCard}>
                            <div class={styles.colorSwatch}>
                              <input
                                type="color"
                                value={
                                  config.pluginColors?.border ||
                                  DEFAULT_PLUGIN_COLORS.border
                                }
                                onChange={(e) =>
                                  updateConfig({
                                    pluginColors: {
                                      ...config.pluginColors,
                                      border: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div class={styles.colorBody}>
                              <div class={styles.colorLabel}>
                                Plugin variable: border
                              </div>
                              <input
                                type="text"
                                class={styles.colorInput}
                                value={
                                  config.pluginColors?.border ||
                                  DEFAULT_PLUGIN_COLORS.border
                                }
                                onChange={(e) =>
                                  updateConfig({
                                    pluginColors: {
                                      ...config.pluginColors,
                                      border: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>

                          {/* Background Color */}
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
                                      background: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div class={styles.colorBody}>
                              <div class={styles.colorLabel}>
                                Plugin variable: background
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
                                      background: (e.target as HTMLInputElement)
                                        .value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
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
                        onChange={() => updateConfig({ colorMode: "website" })}
                      />
                      <div class={styles.radioLabel}>
                        <strong>Website Colors</strong>
                        <span>
                          Use colors detected from the imported website.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div class={styles.configSection}>
                  <div class={styles.configTitle}>Fonts</div>
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
                        onChange={() => updateConfig({ fontMode: "plugin" })}
                      />
                      <div class={styles.radioLabel}>
                        <strong>Plugin Fonts</strong>
                        <span>Use plugin's default fonts.</span>
                      </div>
                    </label>
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
                        onChange={() => updateConfig({ fontMode: "website" })}
                      />
                      <div class={styles.radioLabel}>
                        <strong>Website Fonts</strong>
                        <span>
                          Use fonts detected from the imported website.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div class={styles.configSection}>
                  <div class={styles.configTitle}>Text</div>
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
                        onChange={() => updateConfig({ textMode: "semantic" })}
                      />
                      <div class={styles.radioLabel}>
                        <strong>Semantic Placeholders</strong>
                        <span>
                          Use labels like "Heading 1", "Paragraph", and "List
                          item" instead of real copy.
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
                        onChange={() => updateConfig({ textMode: "website" })}
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
