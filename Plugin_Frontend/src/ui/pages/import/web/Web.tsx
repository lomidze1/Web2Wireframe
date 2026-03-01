/** @jsx h */
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import styles from "./Web.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { transformFramesData } from "../../../shared/transformData";
import { validateUrl } from "../../../../utils/urlValidation";
import SettingsPanel from "../../../components/settingsPanel";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";

const TAB_ID = "web";
const STORAGE_KEY = "w2w_settings_expanded_web";

// Backend API URL - in production, this should come from environment config
const API_URL = "http://localhost:3002";

// Import state type
interface ImportState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

interface RenderData {
  frames: unknown[];
  sourceUrl: string;
  localStyles?: unknown;
  pluginColors: unknown;
  cssVariables?: unknown[];
  colorMode: "plugin" | "website";
  fontMode: "plugin" | "website";
  layoutMode: "autoLayout" | "absolute";
}

export default function Web() {
  const [url, setUrl] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  // Rendering loader state
  const [showRenderingLoader, setShowRenderingLoader] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<RenderingProgress | undefined>();
  // Font fallback modal state
  const [showFontModal, setShowFontModal] = useState(false);
  const [fontModalData, setFontModalData] = useState<{
    missingFont: string;
    nextFallback: string;
    pluginDefault: string;
  } | null>(null);

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();

  // Listen for messages from Figma plugin main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "render-progress") {
        const { step, percent, isComplete } = msg.data;
        setRenderingProgress({ step, percent, isComplete });

        // When complete, show success state then close
        if (isComplete) {
          setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            setImportState({ status: "idle", message: "" });
            setUrl("");
          }, 10000); // Show success state for 10 seconds
        }
      }

      if (msg.type === "font-not-available") {
        setFontModalData(msg.data);
        setShowFontModal(true);
      }

      if (msg.type === "wireframe-error") {
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
        setImportState({
          status: "error",
          message: msg.data.error || "Failed to create wireframe",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  /**
   * Send render message to Figma
   */
  const sendToFigma = (data: RenderData, variableMode: "styles" | "direct") => {
    // Show the rendering loader
    setShowRenderingLoader(true);
    setRenderingProgress({
      step: "Creating wireframe...",
      percent: 0,
    });
    setImportState({ status: "loading", message: "" });

    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: data.frames,
            sourceUrl: data.sourceUrl,
            localStyles: data.localStyles,
            pluginColors: data.pluginColors,
            pluginFont: config.pluginFont,
            cssVariables: data.cssVariables || [],
            variableMode, // "styles" or "direct"
            colorMode: data.colorMode,
            fontMode: data.fontMode,
            layoutMode: data.layoutMode, // "autoLayout" or "absolute"
          },
        },
      },
      "*"
    );
    // Progress updates and completion are handled by the message listener
  };

  const handleFontFallbackChoice = (_choice: string, chosenFont: string) => {
    setShowFontModal(false);
    setFontModalData(null);
    parent.postMessage(
      {
        pluginMessage: {
          type: "font-fallback-choice",
          data: { chosenFont },
        },
      },
      "*"
    );
  };

  const handleImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // Validate and normalize URL
    const validation = validateUrl(trimmedUrl);
    if (!validation.valid) {
      setImportState({
        status: "error",
        message: validation.error || "Please enter a valid URL",
      });
      return;
    }
    const normalizedUrl = validation.url;

    setImportState({ status: "loading", message: "Importing website..." });

    // Collapse settings panel so user can see loading status
    settings.collapseSettings();

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
          sourceUrl: normalizedUrl,
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

      // Transform text content based on selected text mode (semantic, lorem, etc.)
      const rawFrames = data.wireframeData?.frames || [];
      const frames = transformFramesData(
        rawFrames as Parameters<typeof transformFramesData>[0],
        {
          colorMode: settings.localColorMode,
          fontMode: settings.localFontMode,
          textMode: settings.localTextMode,
        }
      );

      // Prepare render data
      const renderData: RenderData = {
        frames,
        sourceUrl: normalizedUrl,
        localStyles: data.localStyles,
        pluginColors: data.pluginColors || config.pluginColors,
        cssVariables: data.cssVariables || [],
        colorMode: settings.localColorMode,
        fontMode: settings.localFontMode,
        layoutMode: settings.localLayoutMode,
      };

      // Always use the user's configured CSS variables mode from settings
      sendToFigma(renderData, settings.localCssVariablesMode);
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
          onBlur={() => {
            const trimmed = url.trim();
            if (trimmed && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
              setUrl(`https://${trimmed}`);
            }
          }}
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
        handleSaveAsDefault={settings.handleSaveAsDefault}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
      />

      {/* Import Button */}
      <button class={styles.importBtn} onClick={handleImport} disabled={isDisabled}>
        {importState.status === "loading" ? "Importing..." : "Import"}
      </button>

      {/* Font Fallback Modal */}
      <FontFallbackModal
        isOpen={showFontModal}
        missingFont={fontModalData?.missingFont || ""}
        nextFallback={fontModalData?.nextFallback || ""}
        pluginDefault={fontModalData?.pluginDefault || "Montserrat"}
        onChoice={handleFontFallbackChoice}
      />

      {/* Rendering Loader Overlay */}
      <RenderingLoader
        isVisible={showRenderingLoader}
        progress={renderingProgress}
        onClose={() => {
          setShowRenderingLoader(false);
          setRenderingProgress(undefined);
          setImportState({ status: "idle", message: "" });
          setUrl("");
        }}
      />
    </div>
  );
}
