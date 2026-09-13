/** @jsx h */
import { h, Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import styles from "./HTML.css";
import importStyles from "../Import.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { useLicense } from "../../../shared/LicenseContext";
import { authHeader } from "../../../shared/licenseClient";
import { httpErrorMessage, toUserMessage } from "../../../shared/httpErrors";
import { API_BASE_URL } from "../../../shared/apiConfig";
import { transformFramesData, transformW2WTreeText } from "../../../shared/transformData";
import { prepareFramesForRendering, type ExtractedElement } from "../../../shared/absoluteModeRenderer";
import type { WireframeFrame, WireframeNode } from "../../../../types";
import SettingsPanel from "../../../components/settingsPanel";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import {
  buildFontDownloads,
  buildFontRealNames,
  enrichFontsWithSfntNames,
} from "../../../../utils/fontDownload";
import {
  buildFontDeclaredCuts,
  buildFontFaceStyles,
  buildVariableFontFamilies,
  type FontCut,
} from "../../../../utils/fontUtils";
import HtmlWarningModal from "../../../components/modalPopup/HtmlWarningModal";
import RenderingLoader from "../../../components/renderingLoader/RenderingLoader";
import { useImportProgress } from "../../../hooks/useImportProgress";
import { validateHtml, type HtmlValidationResult } from "../../../../utils/validateHtml";

const TAB_ID = "html";
const STORAGE_KEY = "w2w_settings_expanded_html";
/** Uploaded HTML/CSS are plain text; past this, it is not a page. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const API_URL = API_BASE_URL;

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
  fontRealNames?: Record<string, string>;
  fontDeclaredCuts?: Record<string, FontCut[]>;
  fontVariableFamilies?: string[];
  fontFaceStyles?: Record<string, string[]>;
}

export default function HTML() {
  const [htmlCode, setHtmlCode] = useState("");
  const [cssCode, setCssCode] = useState("");
  // Code = paste, Files = upload. Session-only; the tab opens on Code.
  const [inputMode, setInputMode] = useState<"code" | "files">("code");
  const [htmlFileName, setHtmlFileName] = useState<string | null>(null);
  const [cssFileName, setCssFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<"html" | "css" | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  // Loader state — covers the whole import, capture included.
  const loader = useImportProgress("html");
  const { applyRender, hide: hideLoader } = loader;
  const [expandedField, setExpandedField] = useState<"html" | "css" | null>(null);
  const [warningType, setWarningType] = useState<"html" | "css" | null>(null);
  const [htmlValidation, setHtmlValidation] = useState<HtmlValidationResult | null>(null);
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

  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();
  const { refresh: refreshLicense } = useLicense();
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const cssFileInputRef = useRef<HTMLInputElement>(null);

  // Listen for messages from Figma plugin main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "render-progress") {
        const { step, percent, isComplete } = msg.data;
        applyRender({ step, percent, isComplete });

        if (isComplete) {
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            hideLoader();
            setImportState({ status: "idle", message: "" });
            clearHtmlFile();
            clearCssFile();
            resetTimeoutRef.current = null;
          }, 10000);
        }
      }

      if (msg.type === "fonts-not-available") {
        setFontModalData(msg.data);
        setShowFontModal(true);
      }

      if (msg.type === "wireframe-error") {
        hideLoader();
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
  }, [applyRender, hideLoader]);

  const clearHtmlFile = () => {
    setHtmlCode("");
    setHtmlFileName(null);
  };

  const clearCssFile = () => {
    setCssCode("");
    setCssFileName(null);
  };

  /**
   * Bumped on every accepted file, per slot. A read that finishes after a
   * newer pick has to go quiet: drop a 5 MB `slow.html` then a small
   * `fast.html` and fast paints first, after which slow's `onload` silently
   * replaced both the name and the markup — the user imported a file they had
   * already replaced.
   */
  const readGeneration = useRef<{ html: number; css: number }>({ html: 0, css: 0 });

  /** Reads an uploaded file into the same state the textareas feed, so the
   *  import path below is identical for pasted and uploaded code. */
  const acceptFile = (file: File, kind: "html" | "css") => {
    const name = file.name.toLowerCase();
    const matches =
      kind === "html"
        ? name.endsWith(".html") || name.endsWith(".htm")
        : name.endsWith(".css");
    if (!matches) {
      setImportState({
        status: "error",
        message:
          kind === "html"
            ? "Only .html files can be uploaded here."
            : "Only .css files can be uploaded here.",
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setImportState({
        status: "error",
        message: "File is too large to import (over 5 MB).",
      });
      return;
    }

    const generation = (readGeneration.current[kind] += 1);
    const superseded = (): boolean => readGeneration.current[kind] !== generation;

    const reader = new FileReader();
    reader.onload = () => {
      if (superseded()) return;
      const text = typeof reader.result === "string" ? reader.result : "";
      if (kind === "html") {
        setHtmlCode(text);
        setHtmlFileName(file.name);
      } else {
        setCssCode(text);
        setCssFileName(file.name);
      }
      setImportState({ status: "idle", message: "" });
    };
    reader.onerror = () => {
      if (superseded()) return;
      setImportState({
        status: "error",
        message: `Could not read ${file.name}.`,
      });
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e: Event, kind: "html" | "css") => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) acceptFile(file, kind);
    // Let the same file be picked again after a clear.
    input.value = "";
  };

  const handleFileDrop = (e: DragEvent, kind: "html" | "css") => {
    e.preventDefault();
    setDragOver(null);
    if (importState.status === "loading") return;
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptFile(file, kind);
  };

  const sendToFigma = (data: RenderData, variableMode: "styles" | "direct") => {
    // Cancel any pending reset from previous import
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    // The loader is already up (it opened with the capture); hand it over to
    // the sandbox's own scale.
    loader.applyRender({ step: "Creating wireframe…", percent: 0 });
    setImportState({ status: "loading", message: "" });

    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: data.frames,
            sourceUrl: data.sourceUrl,
            kind: "html",
            localStyles: data.localStyles,
            pluginColors: data.pluginColors,
            pluginFont: config.pluginFont,
            cssVariables: data.cssVariables || [],
            variableMode,
            colorMode: data.colorMode,
            fontMode: data.fontMode,
            textMode: data.textMode,
            layoutMode: data.layoutMode,
            assetMode: settings.localAssetMode,
            interactionMode: settings.localInteractionMode,
            htmlLayerNames: config.htmlLayerNames,
            geometryRows: config.geometryRows,
            originLinks: settings.localOriginLinks,
            fontRealNames: data.fontRealNames,
            fontDeclaredCuts: data.fontDeclaredCuts,
            fontVariableFamilies: data.fontVariableFamilies,
            fontFaceStyles: data.fontFaceStyles,
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

  const proceedWithGenerate = async (trimmedHTML: string) => {
    setImportState({ status: "loading", message: "Importing the HTML…" });
    settings.collapseSettings();

    // The server round-trip is the long half — raise the loader now.
    const controller = loader.beginCapture("Converting the HTML…");

    try {
      const response = await fetch(`${API_URL}/api/import-html`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
        },
        body: JSON.stringify({
          figmaUserId: config.figmaUserId,
          htmlCode: trimmedHTML,
          cssCode: cssCode.trim() || undefined,
          viewports: settings.localViewports.map(Number),
          colorMode: settings.localColorMode,
          typographyMode: settings.localFontMode,
          textMode: settings.localTextMode,
          assetMode: settings.localAssetMode,
          cssVariablesMode: settings.localCssVariablesMode,
          layoutMode: settings.localLayoutMode,
          pluginColors: config.pluginColors,
        }),
      });

      const { isAuthExpired } = await import("../../../shared/authEvents");
      if (isAuthExpired(response)) {
        // See Web.tsx: `loading` is what disables the button, so the auth
        // branch has to clear it exactly like the quota branch below.
        hideLoader();
        setImportState({ status: "idle", message: "" });
        return;
      }

      const { isQuotaExceeded } = await import("../../../shared/quotaEvents");
      if (await isQuotaExceeded(response)) {
        hideLoader();
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

      // Bank the capture duration only now, with a usable response in hand.
      // Banking it the moment `fetch` resolved fed 200ms quota and auth
      // rejections into the estimate, and a median of those pins the next
      // import's ring at its ceiling for the whole capture.
      loader.finishCapture();

      const data = await response.json();

      // Store extracted fonts for font fallback download. See Web.tsx: the
      // server ships no real (SFNT) names for formats it can't open, so the
      // plugin reads them off the bound bytes before anything keys off them.
      if (data.fonts && Array.isArray(data.fonts)) {
        data.fonts = await enrichFontsWithSfntNames(data.fonts);
        setExtractedFonts(data.fonts);
      }

      const rawFrames = data.wireframeData?.frames || [];
      const pluginColors = data.pluginColors || config.pluginColors;

      // Detect W2W format (content script extraction) vs legacy ExtractedElement format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isW2WFormat = rawFrames.length > 0 && (rawFrames[0] as any)?.tree?.type === "FRAME";

      let frames: WireframeFrame[];
      if (isW2WFormat) {
        // W2W format: pass tree as capturedData, main.ts converts via convertW2WToWireframe()
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
            tree: null as unknown as WireframeNode,
            assets: {},
            capturedData: {
              frame: tree,
              assets: f.assets || {},
            },
          };
        });
      } else {
        // Legacy ExtractedElement format
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
        fontRealNames: buildFontRealNames(data.fonts),
        fontDeclaredCuts: buildFontDeclaredCuts(data.fonts),
        fontVariableFamilies: Array.from(buildVariableFontFamilies(data.fonts)),
        fontFaceStyles: buildFontFaceStyles(data.fonts),
      };

      // The response landed, but reading it, decoding font names and cutting
      // assets all take time the loader still offers Cancel for. Honour it.
      if (controller.signal.aborted) return;

      sendToFigma(renderData, settings.localCssVariablesMode);

      // Import consumed a quota slot server-side — refresh the footer badge.
      void refreshLicense();
    } catch (error) {
      // Cancel already closed the overlay and set its own message.
      if (controller.signal.aborted) return;
      hideLoader();
      setImportState({
        status: "error",
        message: toUserMessage(error, "Failed to import the HTML"),
      });
    }
  };

  const handleGenerate = async () => {
    const trimmedHTML = htmlCode.trim();
    if (!trimmedHTML) return;

    const validation = validateHtml(trimmedHTML);
    if (!validation.isValid) {
      setHtmlValidation(validation);
      setWarningType("html");
      return;
    }

    if (!cssCode.trim()) {
      setWarningType("css");
      return;
    }

    await proceedWithGenerate(trimmedHTML);
  };

  const handleWarningContinue = () => {
    setWarningType(null);
    setHtmlValidation(null);
    proceedWithGenerate(htmlCode.trim());
  };

  const handleWarningCancel = () => {
    setWarningType(null);
    setHtmlValidation(null);
  };

  const isDisabled = !htmlCode.trim() || !/<[a-zA-Z]/.test(htmlCode) || importState.status === "loading";

  return (
    <div class={styles.htmlContainer}>
      {/* Input Mode — paste code or upload files */}
      <div
        class={`${importStyles.segmentGroup} ${styles.modeSwitch}`}
        role="radiogroup"
        aria-label="Input mode"
      >
        {(["code", "files"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={inputMode === mode}
            class={`${importStyles.segmentItem} ${
              inputMode === mode ? importStyles.segmentActive : ""
            }`}
            disabled={importState.status === "loading"}
            onClick={() => setInputMode(mode)}
          >
            {mode === "code" ? "Code" : "Files"}
          </button>
        ))}
      </div>

      {inputMode === "code" ? (
        <Fragment>
          {/* HTML Code Section */}
          <div class={styles.codeSection}>
            <div class={styles.codeLabelRow}>
              <label class={styles.codeLabel} for="w2w-html-code" id="w2w-html-label">
                HTML
              </label>
              <button
                type="button"
                class={styles.maximizeBtn}
                aria-label="Expand HTML editor"
                title="Maximize"
                onClick={() => setExpandedField("html")}
              >
                ⛶
              </button>
            </div>
            <textarea
              id="w2w-html-code"
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
              <label class={styles.codeLabel} for="w2w-css-code" id="w2w-css-label">
                CSS (optional)
              </label>
              <button
                type="button"
                class={styles.maximizeBtn}
                aria-label="Expand CSS editor"
                title="Maximize"
                onClick={() => setExpandedField("css")}
              >
                ⛶
              </button>
            </div>
            <textarea
              id="w2w-css-code"
              class={styles.codeTextarea}
              placeholder="Type or paste CSS code here. (optional)"
              value={cssCode}
              onInput={(e) => setCssCode((e.target as HTMLTextAreaElement).value)}
              disabled={importState.status === "loading"}
            />
          </div>
        </Fragment>
      ) : (
        <Fragment>
          {/* HTML File Section */}
          <div class={styles.codeSection}>
            <div class={styles.codeLabelRow}>
              <span class={styles.codeLabel}>HTML</span>
            </div>
            <div
              class={`${styles.fileZone} ${dragOver === "html" ? styles.dragOver : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver("html");
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleFileDrop(e, "html")}
            >
              <div class={styles.fileIcon}>⬚</div>
              <div class={styles.fileCopy}>
                <div class={styles.fileName}>
                  {htmlFileName || "Drag-and-drop your .html file"}
                </div>
                <div class={styles.fileSubtext}>or select from your computer</div>
                <div class={styles.fileActions}>
                  <input
                    type="file"
                    ref={htmlFileInputRef}
                    accept=".html,.htm"
                    aria-label="Choose an HTML file"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileInput(e, "html")}
                  />
                  <button
                    type="button"
                    class={styles.browseBtn}
                    onClick={() => htmlFileInputRef.current?.click()}
                    disabled={importState.status === "loading"}
                  >
                    Browse
                  </button>
                  {htmlFileName && (
                    <button
                      type="button"
                      class={styles.fileClearBtn}
                      aria-label="Remove the HTML file"
                      title="Remove"
                      onClick={clearHtmlFile}
                      disabled={importState.status === "loading"}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CSS File Section */}
          <div class={styles.codeSection}>
            <div class={styles.codeLabelRow}>
              <span class={styles.codeLabel}>CSS (optional)</span>
            </div>
            <div
              class={`${styles.fileZone} ${dragOver === "css" ? styles.dragOver : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver("css");
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleFileDrop(e, "css")}
            >
              <div class={styles.fileIcon}>⬚</div>
              <div class={styles.fileCopy}>
                <div class={styles.fileName}>
                  {cssFileName || "Drag-and-drop your .css file"}
                </div>
                <div class={styles.fileSubtext}>or select from your computer</div>
                <div class={styles.fileActions}>
                  <input
                    type="file"
                    ref={cssFileInputRef}
                    accept=".css"
                    aria-label="Choose a CSS file"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileInput(e, "css")}
                  />
                  <button
                    type="button"
                    class={styles.browseBtn}
                    onClick={() => cssFileInputRef.current?.click()}
                    disabled={importState.status === "loading"}
                  >
                    Browse
                  </button>
                  {cssFileName && (
                    <button
                      type="button"
                      class={styles.fileClearBtn}
                      aria-label="Remove the CSS file"
                      title="Remove"
                      onClick={clearCssFile}
                      disabled={importState.status === "loading"}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div class={styles.fileHint}>
              Files linked from your HTML aren't loaded — add your CSS file here.
            </div>
          </div>
        </Fragment>
      )}

      {/* Status Message — live region so screen readers announce updates */}
      {importState.message && (
        <div
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

      {/* Settings */}
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
        localOriginLinks={settings.localOriginLinks}
        setOriginLinks={settings.setOriginLinks}
        localInteractionMode={settings.localInteractionMode}
        setInteractionMode={settings.setInteractionMode}
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
        class={importStyles.btnPrimary}
        onClick={handleGenerate}
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

      {/* Warning Modal (HTML validation or missing CSS) */}
      <HtmlWarningModal
        isOpen={warningType !== null}
        title={warningType === "css" ? "Missing CSS" : "HTML Quality Warning"}
        intro={
          warningType === "css"
            ? "No CSS provided. The wireframe will use browser default styling and may look unstyled."
            : undefined
        }
        errorCount={warningType === "css" ? 0 : htmlValidation?.errorCount ?? 0}
        errors={warningType === "css" ? [] : htmlValidation?.errors ?? []}
        onContinue={handleWarningContinue}
        onCancel={handleWarningCancel}
      />

      {/* Expand Overlay */}
      {expandedField && (
        <div class={styles.expandOverlay}>
          <div class={styles.expandHeader}>
            <span class={styles.expandLabel}>
              {expandedField === "html" ? "HTML" : "CSS (optional)"}
            </span>
            <button
              type="button"
              class={styles.expandCloseBtn}
              onClick={() => setExpandedField(null)}
              aria-label="Close expanded editor"
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
        isVisible={loader.isVisible}
        progress={loader.progress}
        onClose={() => {
          hideLoader();
          setImportState({ status: "idle", message: "" });
          clearHtmlFile();
          clearCssFile();
        }}
        onCancel={() => {
          loader.cancel();
          setImportState({ status: "idle", message: "Import canceled" });
        }}
      />
    </div>
  );
}
