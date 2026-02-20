/** @jsx h */
import { h } from "preact";
import { useState, useRef } from "preact/hooks";
import styles from "./Screenshot.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "screenshot";
const STORAGE_KEY = "w2w_settings_expanded_screenshot";

export default function Screenshot() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  const handleImageUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAreaClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDelete = (e: Event) => {
    e.stopPropagation();
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = () => {
    // TODO: Implement screenshot wireframe generation
  };

  return (
    <div class={styles.screenshotContainer}>
      {/* Image Upload Area */}
      <div
        class={`${styles.imageUploadArea} ${
          imagePreview ? styles.hasImage : ""
        }`}
        onClick={handleAreaClick}
      >
        {imagePreview && (
          <button class={styles.deleteBtn} onClick={handleDelete}>
            ✕
          </button>
        )}
        <input
          type="file"
          ref={fileInputRef}
          class={styles.hiddenInput}
          accept="image/*"
          onChange={handleImageUpload}
        />
        {imagePreview ? (
          <img
            src={imagePreview}
            class={styles.screenshotPreview}
            alt="Screenshot preview"
          />
        ) : (
          <div class={styles.uploadContent}>
            <div class={styles.uploadIcon}>📸</div>
            <div>
              <div style={{ fontWeight: 600 }}>Click to upload screenshot</div>
              <div style={{ fontSize: "11px", marginTop: "4px" }}>
                or drag and drop
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <SettingsPanel
        styles={styles}
        containerClassName={styles.screenshotSettings}
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
        class={styles.screenshotBtn}
        onClick={handleGenerate}
        disabled={!imagePreview}
      >
        Generate Wireframe
      </button>
    </div>
  );
}
