/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./Web.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "web";
const STORAGE_KEY = "w2w_settings_expanded_web";

// Backend API URL - in production, this should come from environment config
const API_URL = "http://localhost:3002";

// Import state type
interface ImportState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

export default function Web() {
  const [url, setUrl] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();

  const handleImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // Validate URL format
    try {
      new URL(trimmedUrl);
    } catch {
      setImportState({
        status: "error",
        message: "Please enter a valid URL (e.g., https://example.com)",
      });
      return;
    }

    setImportState({ status: "loading", message: "Importing website..." });

    try {
      // Map frontend color/font modes to backend modes
      const colorModeMap: Record<string, string> = {
        plugin: "plugin-colors",
        website: "website-colors",
      };

      const fontModeMap: Record<string, string> = {
        plugin: "plugin-fonts",
        website: "website-fonts",
      };

      // Call backend API
      const response = await fetch(`${API_URL}/api/import-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: `figma-user-${Date.now()}`, // Temporary user ID
          sourceUrl: trimmedUrl,
          viewports: settings.localViewports.map(Number),
          colorMode: colorModeMap[settings.localColorMode] || "plugin-colors",
          typographyMode: fontModeMap[settings.localFontMode] || "plugin-fonts",
          textMode: settings.localTextMode,
          pluginMainColor: config.pluginColors.main,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.details || `HTTP ${response.status}`
        );
      }

      const data = await response.json();

      // Send wireframe data to Figma main thread for rendering
      parent.postMessage(
        {
          pluginMessage: {
            type: "render-wireframe",
            data: {
              frames: data.wireframeData?.frames || [],
              sourceUrl: trimmedUrl,
              localStyles: data.localStyles,
              pluginMainColor: config.pluginColors.main,
            },
          },
        },
        "*"
      );

      setImportState({
        status: "success",
        message: "Wireframe created successfully!",
      });

      // Reset after success
      setTimeout(() => {
        setImportState({ status: "idle", message: "" });
        setUrl("");
      }, 3000);
    } catch (error) {
      console.error("Import error:", error);
      setImportState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to import website",
      });
    }
  };

  const isDisabled = !url.trim() || importState.status === "loading";

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
          disabled={importState.status === "loading"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isDisabled) {
              handleImport();
            }
          }}
        />
      </div>

      {/* Status Message */}
      {importState.message && (
        <div
          class={`${styles.statusMessage} ${
            importState.status === "loading"
              ? styles.loading
              : importState.status === "success"
                ? styles.success
                : importState.status === "error"
                  ? styles.error
                  : ""
          }`}
        >
          {importState.status === "loading" && (
            <span class={styles.spinner}></span>
          )}
          <span>{importState.message}</span>
        </div>
      )}

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
      <button class={styles.importBtn} onClick={handleImport} disabled={isDisabled}>
        {importState.status === "loading" ? "Importing..." : "Import"}
      </button>
    </div>
  );
}
