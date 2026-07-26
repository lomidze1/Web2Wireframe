/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import styles from "./Web.css";
import importStyles from "../Import.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { useLicense } from "../../../shared/LicenseContext";
import { authHeader } from "../../../shared/licenseClient";
import { httpErrorMessage, toUserMessage } from "../../../shared/httpErrors";
import { API_BASE_URL } from "../../../shared/apiConfig";
import { looksLikeBlockPage } from "../../../shared/blockPageDetection";
import { requestImportTab } from "../../../shared/importTabEvents";
import { transformFramesData, transformW2WTreeText } from "../../../shared/transformData";
import { prepareFramesForRendering, type ExtractedElement } from "../../../shared/absoluteModeRenderer";
import type { WireframeFrame, WireframeNode } from "../../../../types";
import { validateUrl } from "../../../../utils/urlValidation";
import SettingsPanel from "../../../components/settingsPanel";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import { buildFontDownloads, buildFontRealNames } from "../../../../utils/fontDownload";
import type { FontCut } from "../../../../utils/fontUtils";
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
  /** Set on the bot-protection case so the error renders the extension-handoff
   *  panel instead of plain text. */
  blocked?: boolean;
  /** The URL that was blocked. Kept separate from the input's live value so the
   *  "open in browser" button still targets the right site after the user edits
   *  the field. */
  blockedUrl?: string;
}

const EXTENSION_URL =
  "https://chromewebstore.google.com/detail/web2wireframe/fcmicolldgpmpdkcdljkaaimmjmboipl";

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
  fontRealNames?: Record<string, string>;
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
    /** Per family, the cuts the page needs but Figma lacks — narrows the
     *  download ZIP to just those files. */
    missingCuts?: Record<string, FontCut[]>;
  } | null>(null);
  const [extractedFonts, setExtractedFonts] = useState<unknown[]>([]);
  // Set when window.open() is refused, so the blocked panel offers a clickable
  // link the user can open manually.
  const [popupBlocked, setPopupBlocked] = useState(false);

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();
  const { refresh: refreshLicense } = useLicense();
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
            fontRealNames: data.fontRealNames,
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

    // A previous import's 10s "reset to idle" timer may still be pending. It
    // would wipe this import's status message (and the URL field) mid-flight,
    // so cancel it before starting. Imports that reach sendToFigma clear it
    // again there; ones that bail out early (bot-protection, API errors) only
    // get cleared here.
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    setImportState({ status: "loading", message: "Importing the website…" });
    setPopupBlocked(false);

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
          assetMode: settings.localAssetMode,
          cssVariablesMode: settings.localCssVariablesMode,
          layoutMode: settings.localLayoutMode,
          pluginColors: config.pluginColors, // Send full 6-color palette
        }),
      });

      const { isAuthExpired } = await import("../../../shared/authEvents");
      if (isAuthExpired(response)) return;

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

      // Bot-protected sites (e.g. tesla.com behind Akamai) serve an "Access
      // Denied" page to our server-side headless browser. Rendering it gives a
      // useless frame — instead, point the user at the Browser Extension, which
      // captures from their real, already-authenticated browser.
      if (looksLikeBlockPage(rawFrames)) {
        setImportState({
          status: "error",
          message:
            "This site blocks automated URL import (bot protection). Try capturing it with the Browser Extension instead.",
          blocked: true,
          blockedUrl: normalizedUrl,
        });
        return;
      }

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
        fontRealNames: buildFontRealNames(data.fonts),
      };

      // Always use the user's configured CSS variables mode from settings
      sendToFigma(renderData, settings.localCssVariablesMode);

      // Import consumed a quota slot server-side — refresh the footer badge.
      void refreshLicense();
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
                  ? `${importStyles.error} ${styles.dismissable}`
                  : ""
          }`}
        >
          {importState.status === "error" && (
            <button
              type="button"
              class={styles.dismissBtn}
              aria-label="Dismiss"
              onClick={() => {
                setImportState({ status: "idle", message: "" });
                setPopupBlocked(false);
              }}
            >
              ×
            </button>
          )}
          {importState.status === "loading" && (
            <span class={importStyles.spinner} aria-hidden="true"></span>
          )}
          {importState.blocked ? (
            <div class={styles.blockedPanel}>
              <span>
                This site blocks automated URL import (bot protection). The
                Browser Extension captures it from your own browser instead.
              </span>
              <button
                class={styles.blockedBtn}
                onClick={() => {
                  if (!importState.blockedUrl) return;
                  // Direct user gesture, so popup blockers normally allow it —
                  // but Figma's iframe can still refuse (same fallback as the
                  // Plan modal's checkout window).
                  const opened = window.open(importState.blockedUrl, "_blank");
                  if (!opened) setPopupBlocked(true);
                }}
              >
                Open site in your browser
              </button>
              <span class={styles.blockedHint}>
                Then click the W2W icon in your browser toolbar to capture it.
              </span>
              {popupBlocked && importState.blockedUrl && (
                <a
                  href={importState.blockedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class={styles.blockedLink}
                >
                  {importState.blockedUrl}
                </a>
              )}
              <div class={styles.blockedActions}>
                <a
                  href={EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  class={styles.blockedLink}
                >
                  Get the extension
                </a>
                <span aria-hidden="true">·</span>
                <button
                  class={styles.blockedLink}
                  onClick={() => requestImportTab("screenshot")}
                >
                  Try Screenshot import
                </button>
              </div>
            </div>
          ) : (
            <span>{importState.message}</span>
          )}
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
        fontDownloads={buildFontDownloads(fontModalData?.missingFonts || [], extractedFonts, fontModalData?.missingCuts)}
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
