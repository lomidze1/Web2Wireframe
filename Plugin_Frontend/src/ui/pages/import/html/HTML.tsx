/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import styles from "./HTML.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { transformFramesData } from "../../../shared/transformData";
import { prepareFramesForRendering, type ExtractedElement } from "../../../shared/absoluteModeRenderer";
import SettingsPanel from "../../../components/settingsPanel";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";

const TAB_ID = "html";
const STORAGE_KEY = "w2w_settings_expanded_html";

const API_URL = "http://localhost:3002";

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
  textMode: "website" | "lorem" | "semantic";
  layoutMode: "autoLayout" | "absolute";
}

export default function HTML() {
  const [htmlCode, setHtmlCode] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  const [showRenderingLoader, setShowRenderingLoader] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<RenderingProgress | undefined>();
  const [expandedField, setExpandedField] = useState<"html" | "css" | null>(null);
  const [showFontModal, setShowFontModal] = useState(false);
  const [fontModalData, setFontModalData] = useState<{
    missingFonts: string[];
    defaultMapping: Record<string, string>;
    pluginFont: string;
    pluginFontOptions: string[];
  } | null>(null);

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

        if (isComplete) {
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            setImportState({ status: "idle", message: "" });
            setHtmlCode("");
            setCssCode("");
            resetTimeoutRef.current = null;
          }, 10000);
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

  const sendToFigma = (data: RenderData, variableMode: "styles" | "direct") => {
    // Cancel any pending reset from previous import
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
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
            variableMode,
            colorMode: data.colorMode,
            fontMode: data.fontMode,
            textMode: data.textMode,
            layoutMode: data.layoutMode,
          },
        },
      },
      "*"
    );
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

  const handleGenerate = async () => {
    const trimmedHTML = htmlCode.trim();
    if (!trimmedHTML) return;

    setImportState({ status: "loading", message: "Generating wireframe from HTML..." });
    settings.collapseSettings();

    try {
      const colorModeMap: Record<string, string> = {
        plugin: "plugin-colors",
        website: "website-colors",
      };

      const fontModeMap: Record<string, string> = {
        plugin: "plugin-fonts",
        website: "website-fonts",
      };

      const response = await fetch(`${API_URL}/api/import-html`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          htmlCode: trimmedHTML,
          cssCode: cssCode.trim() || undefined,
          viewports: settings.localViewports.map(Number),
          colorMode: colorModeMap[settings.localColorMode] || "plugin-colors",
          typographyMode: fontModeMap[settings.localFontMode] || "plugin-fonts",
          textMode: settings.localTextMode,
          pluginColors: config.pluginColors,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.details || `HTTP ${response.status}`
        );
      }

      const data = await response.json();

      // Transform text content
      const rawFrames = data.wireframeData?.frames || [];
      const transformedFrames = transformFramesData(
        rawFrames as Parameters<typeof transformFramesData>[0],
        {
          colorMode: settings.localColorMode,
          fontMode: settings.localFontMode,
          textMode: settings.localTextMode,
        }
      );

      // Convert ExtractedElement -> WireframeNode
      const pluginColors = data.pluginColors || config.pluginColors;
      const frames = prepareFramesForRendering(
        transformedFrames as unknown as { viewport: { width: number; height: number }; tree: ExtractedElement }[],
        {
          text: pluginColors.text,
          surface: pluginColors.surface,
        }
      );

      const renderData: RenderData = {
        frames,
        sourceUrl: "html-import",
        localStyles: data.localStyles,
        pluginColors,
        cssVariables: data.cssVariables || [],
        colorMode: settings.localColorMode,
        fontMode: settings.localFontMode,
        textMode: settings.localTextMode,
        layoutMode: settings.localLayoutMode,
      };

      sendToFigma(renderData, settings.localCssVariablesMode);
    } catch (error) {
      console.error("HTML import error:", error);
      setImportState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to generate wireframe from HTML",
      });
    }
  };

  const isDisabled = !htmlCode.trim() || importState.status === "loading";

  return (
    <div class={styles.htmlContainer}>
      {/* HTML Code Section */}
      <div class={styles.codeSection}>
        <div class={styles.codeLabelRow}>
          <div class={styles.codeLabel}>HTML</div>
          <button class={styles.maximizeBtn} title="Maximize" onClick={() => setExpandedField("html")}>
            ⛶
          </button>
        </div>
        <textarea
          class={styles.codeTextarea}
          placeholder="Type or paste HTML code here."
          value={htmlCode}
          onInput={(e) => setHtmlCode((e.target as HTMLTextAreaElement).value)}
          disabled={importState.status === "loading"}
        />
      </div>

      {/* CSS Code Section */}
      <div class={styles.codeSection}>
        <div class={styles.codeLabelRow}>
          <div class={styles.codeLabel}>CSS (optional)</div>
          <button class={styles.maximizeBtn} title="Maximize" onClick={() => setExpandedField("css")}>
            ⛶
          </button>
        </div>
        <textarea
          class={styles.codeTextarea}
          placeholder="Type or paste CSS code here. (optional)"
          value={cssCode}
          onInput={(e) => setCssCode((e.target as HTMLTextAreaElement).value)}
          disabled={importState.status === "loading"}
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
        handleSaveAsDefault={settings.handleSaveAsDefault}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
        colorWebsiteLabel="Code Colors"
        fontWebsiteLabel="Code Fonts"
        textWebsiteLabel="Code Text"
      />

      {/* Generate Button */}
      <button
        class={styles.htmlCreateBtn}
        onClick={handleGenerate}
        disabled={isDisabled}
      >
        {importState.status === "loading" ? "Generating..." : "Generate Wireframe"}
      </button>

      {/* Font Fallback Modal */}
      <FontFallbackModal
        isOpen={showFontModal}
        missingFonts={fontModalData?.missingFonts || []}
        defaultMapping={fontModalData?.defaultMapping || {}}
        pluginFont={fontModalData?.pluginFont || "Montserrat"}
        pluginFontOptions={fontModalData?.pluginFontOptions || []}
        onChoice={handleFontFallbackChoice}
      />

      {/* Expand Overlay */}
      {expandedField && (
        <div class={styles.expandOverlay}>
          <div class={styles.expandHeader}>
            <span class={styles.expandLabel}>
              {expandedField === "html" ? "HTML" : "CSS (optional)"}
            </span>
            <button
              class={styles.expandCloseBtn}
              onClick={() => setExpandedField(null)}
              title="Close"
            >
              ✕
            </button>
          </div>
          <textarea
            class={styles.expandTextarea}
            value={expandedField === "html" ? htmlCode : cssCode}
            onInput={(e) => {
              const val = (e.target as HTMLTextAreaElement).value;
              expandedField === "html" ? setHtmlCode(val) : setCssCode(val);
            }}
            placeholder={
              expandedField === "html"
                ? "Type or paste HTML code here."
                : "Type or paste CSS code here. (optional)"
            }
            disabled={importState.status === "loading"}
            autoFocus
          />
        </div>
      )}

      {/* Rendering Loader Overlay */}
      <RenderingLoader
        isVisible={showRenderingLoader}
        progress={renderingProgress}
        onClose={() => {
          setShowRenderingLoader(false);
          setRenderingProgress(undefined);
          setImportState({ status: "idle", message: "" });
          setHtmlCode("");
          setCssCode("");
        }}
      />
    </div>
  );
}
