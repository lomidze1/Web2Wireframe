/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./HTML.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "html";
const STORAGE_KEY = "w2w_settings_expanded_html";

export default function HTML() {
  const [htmlCode, setHtmlCode] = useState("");
  const [cssCode, setCssCode] = useState("");

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  const handleGenerate = () => {
    // TODO: Implement HTML wireframe generation
  };

  return (
    <div class={styles.htmlContainer}>
      {/* HTML Code Section */}
      <div class={styles.codeSection}>
        <div class={styles.codeLabelRow}>
          <div class={styles.codeLabel}>📄 HTML</div>
          <button class={styles.maximizeBtn} title="Maximize">
            ⛶
          </button>
        </div>
        <textarea
          class={styles.codeTextarea}
          placeholder="Type or paste HTML code here."
          value={htmlCode}
          onInput={(e) => setHtmlCode((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      {/* CSS Code Section */}
      <div class={styles.codeSection}>
        <div class={styles.codeLabelRow}>
          <div class={styles.codeLabel}>🎨 CSS (optional)</div>
          <button class={styles.maximizeBtn} title="Maximize">
            ⛶
          </button>
        </div>
        <textarea
          class={styles.codeTextarea}
          placeholder="Type or paste CSS code here. (optional)"
          value={cssCode}
          onInput={(e) => setCssCode((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      {/* Settings */}
      <SettingsPanel
        styles={styles}
        containerClassName={styles.settingsBox}
        isExpanded={settings.isExpanded}
        toggleExpanded={settings.toggleExpanded}
        localViewports={settings.localViewports}
        localColorMode={settings.localColorMode}
        localFontMode={settings.localFontMode}
        localTextMode={settings.localTextMode}
        localCssVariablesMode={settings.localCssVariablesMode}
        localLayoutMode={settings.localLayoutMode}
        toggleViewport={settings.toggleViewport}
        setColorMode={settings.setColorMode}
        setFontMode={settings.setFontMode}
        setTextMode={settings.setTextMode}
        setCssVariablesMode={settings.setCssVariablesMode}
        setLayoutMode={settings.setLayoutMode}
        handleReset={settings.handleReset}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
      />

      {/* Generate Button */}
      <button
        class={styles.htmlCreateBtn}
        onClick={handleGenerate}
        disabled={!htmlCode.trim()}
      >
        Generate Wireframe
      </button>
    </div>
  );
}
