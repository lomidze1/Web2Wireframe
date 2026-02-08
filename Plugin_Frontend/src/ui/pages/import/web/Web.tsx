/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./Web.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import SettingsPanel from "../../../components/settingsPanel";
import VariablesChoiceModal, {
  type VariableMode,
} from "../../../components/modalPopup/VariablesChoiceModal";

const TAB_ID = "web";
const STORAGE_KEY = "w2w_settings_expanded_web";

// Backend API URL - in production, this should come from environment config
const API_URL = "http://localhost:3002";

// Import state type
interface ImportState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

// Pending render data (waiting for variable mode choice)
interface PendingRenderData {
  frames: unknown[];
  sourceUrl: string;
  localStyles?: unknown;
  pluginColors: unknown;
  cssVariables?: unknown[];
}

export default function Web() {
  const [url, setUrl] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [pendingRenderData, setPendingRenderData] =
    useState<PendingRenderData | null>(null);

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();

  /**
   * Send render message to Figma
   */
  const sendToFigma = (data: PendingRenderData, variableMode: VariableMode) => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: data.frames,
            sourceUrl: data.sourceUrl,
            localStyles: data.localStyles,
            pluginColors: data.pluginColors,
            cssVariables: data.cssVariables || [],
            variableMode, // "styles" or "direct"
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
      setPendingRenderData(null);
    }, 3000);
  };

  /**
   * Handle variable mode choice from modal
   */
  const handleVariableChoice = (mode: VariableMode) => {
    setShowVariablesModal(false);
    if (pendingRenderData) {
      sendToFigma(pendingRenderData, mode);
    }
  };

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
          pluginColors: config.pluginColors, // Send full 6-color palette
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.details || `HTTP ${response.status}`
        );
      }

      const data = await response.json();

      // Prepare render data
      const renderData: PendingRenderData = {
        frames: data.wireframeData?.frames || [],
        sourceUrl: trimmedUrl,
        localStyles: data.localStyles,
        pluginColors: data.pluginColors || config.pluginColors,
        cssVariables: data.cssVariables || [],
      };

      // Check if CSS variables exist
      const hasCSSVariables =
        renderData.cssVariables && renderData.cssVariables.length > 0;

      if (hasCSSVariables) {
        // Show modal for user to choose
        setPendingRenderData(renderData);
        setShowVariablesModal(true);
      } else {
        // No CSS variables - proceed directly with "direct" mode
        sendToFigma(renderData, "direct");
      }
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

      {/* Import Button */}
      <button class={styles.importBtn} onClick={handleImport} disabled={isDisabled}>
        {importState.status === "loading" ? "Importing..." : "Import"}
      </button>

      {/* CSS Variables Choice Modal */}
      <VariablesChoiceModal
        isOpen={showVariablesModal}
        onChoice={handleVariableChoice}
      />
    </div>
  );
}
