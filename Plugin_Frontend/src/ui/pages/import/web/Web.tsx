/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./Web.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "web";
const STORAGE_KEY = "w2w_settings_expanded_web";

export default function Web() {
  const [url, setUrl] = useState("");

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  const handleImport = () => {
    console.log("Importing:", {
      url,
      viewports: settings.localViewports,
      colorMode: settings.localColorMode,
      fontMode: settings.localFontMode,
      textMode: settings.localTextMode,
    });
  };

  return (
    <div class={styles.webContainer}>
      {/* URL Input */}
      <div class={styles.inputGroup}>
        <input
          type="text"
          class={styles.urlInput}
          placeholder="https://www.website.com/"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Settings Box */}
      <SettingsPanel
        styles={styles}
        containerClassName={styles.settingsBox}
        isExpanded={settings.isExpanded}
        toggleExpanded={settings.toggleExpanded}
        localViewports={settings.localViewports}
        localColorMode={settings.localColorMode}
        localFontMode={settings.localFontMode}
        localTextMode={settings.localTextMode}
        toggleViewport={settings.toggleViewport}
        setColorMode={settings.setColorMode}
        setFontMode={settings.setFontMode}
        setTextMode={settings.setTextMode}
        handleReset={settings.handleReset}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
      />

      {/* Import Button */}
      <button
        class={styles.importBtn}
        onClick={handleImport}
        disabled={!url.trim()}
      >
        Import
      </button>
    </div>
  );
}
