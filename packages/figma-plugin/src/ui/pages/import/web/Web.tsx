/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import styles from "./Web.css";
import importStyles from "../Import.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { authHeader } from "../../../shared/licenseClient";
import { httpErrorMessage, toUserMessage } from "../../../shared/httpErrors";
import { API_BASE_URL } from "../../../shared/apiConfig";
import { transformFramesData, transformW2WTreeText } from "../../../shared/transformData";
import { prepareFramesForRendering, type ExtractedElement } from "../../../shared/absoluteModeRenderer";
import type { WireframeFrame, WireframeNode } from "../../../../types";
import { validateUrl } from "../../../../utils/urlValidation";
import SettingsPanel from "../../../components/settingsPanel";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import { buildFontDownloads } from "../../../../utils/fontDownload";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";

const TAB_ID = "web";
const STORAGE_KEY = "w2w_settings_expanded_web";

// Backend API URL — single source: apiConfig.ts (toggle USE_PRODUCTION there).
const API_URL = API_BASE_URL;

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
  fontMode: "plugin" | "website" | "lines";
  textMode: "website" | "lorem" | "semantic";
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
    missingFonts: string[];
    defaultMapping: Record<string, string>;
    pluginFont: string;
    pluginFontOptions: string[];
  } | null>(null);
  const [extractedFonts, setExtractedFonts] = useState<unknown[]>([]);

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            setImportState({ status: "idle", message: "" });
            setUrl("");
            resetTimeoutRef.current = null;
          }, 10000); // Show success state for 10 seconds
        }
      }

      if (msg.type === "fonts-not-available") {
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
    return () => {
      window.removeEventListener("message", handleMessage);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  /**
   * Send render message to Figma
   */
  const sendToFigma = (data: RenderData, variableMode: "styles" | "direct") => {
    // Cancel any pending reset from previous import
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    // Show the rendering loader
    setShowRenderingLoader(true);
    setRenderingProgress({
      step: "Creating wireframe…",
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
            textMode: data.textMode,
            layoutMode: data.layoutMode, // "autoLayout" or "absolute"
            assetMode: settings.localAssetMode,
            interactionMode: settings.localInteractionMode,
          },
        },
      },
      "*"
    );
    // Progress updates and completion are handled by the message listener
  };

  const handleFontFallbackChoice = (choice: string, fontMapping: Record<string, string>) => {
    setShowFontModal(false);
    setFontModalData(null);
    parent.postMessage(
      {
        pluginMessage: {
          type: "font-fallback-choice",
          data: { choice, fontMapping },
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

    setImportState({ status: "loading", message: "Importing the website…" });

    // Collapse settings panel so user can see loading status
    settings.collapseSettings();

    try {
      // Call backend API
      const response = await fetch(`${API_URL}/api/import-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
        },
        body: JSON.stringify({
          userId: `figma-user-${Date.now()}`, // Temporary user ID
          figmaUserId: config.figmaUserId,
          sourceUrl: normalizedUrl,
          viewports: settings.localViewports.map(Number),
          colorMode: settings.localColorMode,        // "plugin" | "website"
          typographyMode: settings.localFontMode,     // "plugin" | "website" | "lines"
          textMode: settings.localTextMode,
          pluginColors: config.pluginColors, // Send full 6-color palette
        }),
      });

      const { isQuotaExceeded } = await import("../../../shared/quotaEvents");
      if (await isQuotaExceeded(response)) {
        setImportState({ status: "idle", message: "" });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.details ||
            httpErrorMessage(response.status)
        );
      }

      const data = await response.json();

      // Store extracted fonts for font fallback download
      if (data.fonts && Array.isArray(data.fonts)) {
        setExtractedFonts(data.fonts);
      }

      const rawFrames = data.wireframeData?.frames || [];
      const pluginColors = data.pluginColors || config.pluginColors;

      // Detect W2W format (content script extraction) vs legacy ExtractedElement format
      // W2W frames have tree.type === "FRAME" with raw CSS styles
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isW2WFormat = rawFrames.length > 0 && (rawFrames[0] as any)?.tree?.type === "FRAME";

      let frames: WireframeFrame[];
      if (isW2WFormat) {
        // W2W format: pass tree as capturedData, main.ts will convert via convertW2WToWireframe()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frames = rawFrames.map((f: any) => {
          const tree = f.tree;
          // Apply text transformation (semantic/lorem) to W2W tree before sending to Figma
          if (settings.localTextMode !== "website") {
            transformW2WTreeText(tree, settings.localTextMode);
          }
          return {
            viewportWidth: f.viewportWidth,
            viewportHeight: f.viewportHeight,
            tree: null as unknown as WireframeNode, // Will be populated from capturedData
            assets: {},
            capturedData: {
              frame: tree,
              assets: f.assets || {},
            },
          };
        });
      } else {
        // Legacy ExtractedElement format: transform + convert
        const transformedFrames = transformFramesData(
          rawFrames as Parameters<typeof transformFramesData>[0],
          {
            colorMode: settings.localColorMode,
            fontMode: settings.localFontMode,
            textMode: settings.localTextMode,
          }
        );
        frames = prepareFramesForRendering(
          transformedFrames as unknown as { viewport: { width: number; height: number }; tree: ExtractedElement }[],
          {
            text: pluginColors.text,
            surface: pluginColors.surface,
          }
        );
      }

      // Prepare render data
      const renderData: RenderData = {
        frames,
        sourceUrl: normalizedUrl,
        localStyles: data.localStyles,
        pluginColors,
        cssVariables: data.cssVariables || [],
        colorMode: settings.localColorMode,
        fontMode: settings.localFontMode,
        textMode: settings.localTextMode,
        layoutMode: settings.localLayoutMode,
      };

      // Always use the user's configured CSS variables mode from settings
      sendToFigma(renderData, settings.localCssVariablesMode);
    } catch (error) {
      setImportState({
        status: "error",
        message: toUserMessage(error, "Failed to import website"),
      });
    }
  };

  const isDisabled = !url.trim() || importState.status === "loading";

  return (
    <div class={styles.webContainer}>
      {/* Title & Instructions */}
      <div>
        <label class={styles.urlLabel} for="w2w-url-input">
          Website URL
        </label>
        <ul class={styles.webBullets}>
          <li>Paste a website URL</li>
          <li>Choose your import options</li>
          <li>Click Import</li>
        </ul>
      </div>

      {/* URL Input */}
      <input
        id="w2w-url-input"
        type="url"
        class={styles.urlInput}
        placeholder="https://www.website.com/"
        value={url}
        aria-invalid={importState.status === "error"}
        aria-describedby={
          importState.status === "error" ? "w2w-url-error" : undefined
        }
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

      {/* Status Message — live region so screen readers announce updates */}
      {importState.message && (
        <div
          id={importState.status === "error" ? "w2w-url-error" : undefined}
          role={importState.status === "error" ? "alert" : "status"}
          aria-live={
            importState.status === "error" ? "assertive" : "polite"
          }
          aria-atomic="true"
          class={`${importStyles.statusMessage} ${
            importState.status === "loading"
              ? importStyles.loading
              : importState.status === "success"
                ? importStyles.success
                : importState.status === "error"
                  ? importStyles.error
                  : ""
          }`}
        >
          {importState.status === "loading" && (
            <span class={importStyles.spinner} aria-hidden="true"></span>
          )}
          <span>{importState.message}</span>
        </div>
      )}

      {/* Settings Box */}
      <SettingsPanel
        styles={importStyles}
        containerClassName={importStyles.settingsBox}
        isExpanded={settings.isExpanded}
        toggleExpanded={settings.toggleExpanded}
        localViewports={settings.localViewports}
        localColorMode={settings.localColorMode}
        localFontMode={settings.localFontMode}
        localTextMode={settings.localTextMode}
        localCssVariablesMode={settings.localCssVariablesMode}
        localLayoutMode={settings.localLayoutMode}
        localAssetMode={settings.localAssetMode}
        toggleViewport={settings.toggleViewport}
        setColorMode={settings.setColorMode}
        setFontMode={settings.setFontMode}
        setTextMode={settings.setTextMode}
        setCssVariablesMode={settings.setCssVariablesMode}
        setLayoutMode={settings.setLayoutMode}
        setAssetMode={settings.setAssetMode}
        localInteractionMode={settings.localInteractionMode}
        setInteractionMode={settings.setInteractionMode}
        handleReset={settings.handleReset}
        handleSaveAsDefault={settings.handleSaveAsDefault}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
      />

      {/* Import Button */}
      <button
        class={importStyles.btnPrimary}
        onClick={handleImport}
        disabled={isDisabled}
      >
        {importState.status === "loading" ? "Importing…" : "Import"}
      </button>

      {/* Font Fallback Modal */}
      <FontFallbackModal
        isOpen={showFontModal}
        missingFonts={fontModalData?.missingFonts || []}
        defaultMapping={fontModalData?.defaultMapping || {}}
        pluginFont={fontModalData?.pluginFont || "Montserrat"}
        pluginFontOptions={fontModalData?.pluginFontOptions || []}
        fontDownloads={buildFontDownloads(fontModalData?.missingFonts || [], extractedFonts)}
        extractedFonts={extractedFonts as Array<{ family: string; style?: string; weight?: string; format?: string; src?: string; fontBase64?: string; fontMimeType?: string }>}
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
