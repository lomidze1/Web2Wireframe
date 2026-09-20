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
import * as perf from "../../../../utils/perf";
import { prepareFramesForRendering, type ExtractedElement } from "../../../shared/absoluteModeRenderer";
import type { WireframeFrame, WireframeNode } from "../../../../types";
import { validateUrl } from "../../../../utils/urlValidation";
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
import RenderingLoader from "../../../components/renderingLoader/RenderingLoader";
import NextStepCard, {
  MOBILE_VIEWPORT,
  type ImportSnapshot,
} from "../../../components/nextStepCard/NextStepCard";
import { useImportProgress } from "../../../hooks/useImportProgress";
import { deriveQuota } from "../../../shared/quota";
import { matchStyle, nextStyle, type StyleId } from "../../../shared/styleLadder";
import { requestPlanModal } from "../../../shared/planEvents";

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

/** One-off settings for a single import (the next-step card's re-imports). */
type ImportOverrides = Partial<ImportSnapshot>;

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
  assetMode: ImportSnapshot["assetMode"];
  fontRealNames?: Record<string, string>;
  fontDeclaredCuts?: Record<string, FontCut[]>;
  fontVariableFamilies?: string[];
  fontFaceStyles?: Record<string, string[]>;
}

export default function Web() {
  const [url, setUrl] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  // Loader state — covers the whole import, capture included.
  const loader = useImportProgress("url");
  const { applyRender, hide: hideLoader } = loader;
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
  // The last import that rendered — the next-step card re-imports from it. Kept
  // apart from `url`, which is cleared when the loader closes.
  const [lastImport, setLastImport] = useState<ImportSnapshot | null>(null);
  // Style-ladder steps already imported for this site (see shared/styleLadder.ts).
  const [triedStyles, setTriedStyles] = useState<StyleId[]>([]);
  // A finished import this session — hides the first-run how-to steps.
  const [hasImported, setHasImported] = useState(false);
  // Bumped by "Choose yourself" when More Options is already open.
  const [optionsScrollRequest, setOptionsScrollRequest] = useState(0);
  const pendingImportRef = useRef<ImportSnapshot | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use shared hook for all settings logic
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);
  const { config } = useConfig();
  const {
    refresh: refreshLicense,
    license,
    isLoading: licenseLoading,
    error: licenseError,
  } = useLicense();
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for messages from Figma plugin main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "render-progress") {
        const { step, percent, isComplete } = msg.data;
        applyRender({ step, percent, isComplete });

        // When complete, show success state then close
        if (isComplete) {
          const finished = pendingImportRef.current;
          if (finished) {
            setLastImport(finished);
            setHasImported(true);
            pendingImportRef.current = null;
            const style = matchStyle(finished);
            if (style) {
              setTriedStyles((prev) => (prev.includes(style) ? prev : [...prev, style]));
            }
          }
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            hideLoader();
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
        pendingImportRef.current = null;
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

  /**
   * Send render message to Figma
   */
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
            kind: "url",
            localStyles: data.localStyles,
            pluginColors: data.pluginColors,
            pluginFont: config.pluginFont,
            cssVariables: data.cssVariables || [],
            variableMode, // "styles" or "direct"
            colorMode: data.colorMode,
            fontMode: data.fontMode,
            textMode: data.textMode,
            layoutMode: data.layoutMode, // "autoLayout" or "absolute"
            assetMode: data.assetMode,
            interactionMode: settings.localInteractionMode,
            htmlLayerNames: config.htmlLayerNames,
            geometryRows: config.geometryRows,
            originLinks: settings.localOriginLinks,
            fontRealNames: data.fontRealNames,
            fontDeclaredCuts: data.fontDeclaredCuts,
            fontVariableFamilies: data.fontVariableFamilies,
            fontFaceStyles: data.fontFaceStyles,
            // Dev profiler (stripped in production): `sentAt` prices the
            // structured clone of this payload, `perfUi` carries the iframe's
            // own stage timings so the sandbox prints one combined table.
            sentAt: __W2W_DEV_LOG__ ? Date.now() : undefined,
            perfUi: perf.handoff(),
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

  /** `overrides` apply to this import only — the tab's own (visible and
   *  saved) settings are never touched. */
  const handleImport = async (overrides: ImportOverrides = {}) => {
    const trimmedUrl = (overrides.url ?? url).trim();
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
    const effective = {
      viewports: overrides.viewports ?? settings.localViewports,
      colorMode: overrides.colorMode ?? settings.localColorMode,
      fontMode: overrides.fontMode ?? settings.localFontMode,
      assetMode: overrides.assetMode ?? settings.localAssetMode,
      textMode: overrides.textMode ?? settings.localTextMode,
    };

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
    setLastImport(null);
    // An import typed into the form starts a new site's ladder; the card's
    // own re-imports pass the URL and keep climbing.
    if (overrides.url === undefined) setTriedStyles([]);

    // Collapse settings panel so user can see loading status
    settings.collapseSettings();

    // The capture is the long half of the import — raise the loader now, not
    // once the response lands.
    const controller = loader.beginCapture("Capturing the website…");

    try {
      // Call backend API
      const response = await perf.timed("ui.fetch", () => fetch(`${API_URL}/api/import-url`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
        },
        body: JSON.stringify({
          userId: `figma-user-${Date.now()}`, // Temporary user ID
          figmaUserId: config.figmaUserId,
          sourceUrl: normalizedUrl,
          viewports: effective.viewports.map(Number),
          colorMode: effective.colorMode,        // "plugin" | "website"
          typographyMode: effective.fontMode,     // "plugin" | "website" | "lines"
          textMode: effective.textMode,
          assetMode: effective.assetMode,
          cssVariablesMode: settings.localCssVariablesMode,
          layoutMode: settings.localLayoutMode,
          pluginColors: config.pluginColors, // Send full 6-color palette
        }),
      }));

      const { isAuthExpired } = await import("../../../shared/authEvents");
      if (isAuthExpired(response)) {
        // Reset the state too: `loading` is what disables the Import button,
        // and ConnectionGate is about to swap in the Connect screen. Without
        // this the overlay closes onto a dead "Importing…" button.
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

      const data = await perf.timed("ui.parseJson", () => response.json());

      // Store extracted fonts for font fallback download. The server reads a
      // face's real (SFNT) names only for the formats it can open — a WOFF1
      // site (goodwill.ge) arrives with none — so read them here from the
      // bytes it did bind, same as the extension path does with its `.w2w`
      // asset map. Everything below keys off this enriched list.
      if (data.fonts && Array.isArray(data.fonts)) {
        data.fonts = await perf.timed("ui.fontNames", () =>
          enrichFontsWithSfntNames(data.fonts),
        );
        setExtractedFonts(data.fonts);
      }

      const rawFrames = data.wireframeData?.frames || [];

      // Bot-protected sites (e.g. tesla.com behind Akamai) serve an "Access
      // Denied" page to our server-side headless browser. Rendering it gives a
      // useless frame — instead, point the user at the Browser Extension, which
      // captures from their real, already-authenticated browser.
      if (looksLikeBlockPage(rawFrames)) {
        hideLoader();
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

      const transformStartedAt = Date.now();
      let frames: WireframeFrame[];
      if (isW2WFormat) {
        // W2W format: pass tree as capturedData, main.ts will convert via convertW2WToWireframe()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frames = rawFrames.map((f: any) => {
          const tree = f.tree;
          // Apply text transformation (semantic/lorem) to W2W tree before sending to Figma
          if (effective.textMode !== "website") {
            transformW2WTreeText(tree, effective.textMode);
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
            colorMode: effective.colorMode,
            fontMode: effective.fontMode,
            textMode: effective.textMode,
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
      perf.mark("ui.transform", Date.now() - transformStartedAt);

      // Prepare render data
      const renderData: RenderData = {
        frames,
        sourceUrl: normalizedUrl,
        localStyles: data.localStyles,
        pluginColors,
        cssVariables: data.cssVariables || [],
        colorMode: effective.colorMode,
        fontMode: effective.fontMode,
        textMode: effective.textMode,
        layoutMode: settings.localLayoutMode,
        assetMode: effective.assetMode,
        fontRealNames: buildFontRealNames(data.fonts),
        fontDeclaredCuts: buildFontDeclaredCuts(data.fonts),
        fontVariableFamilies: Array.from(buildVariableFontFamilies(data.fonts)),
        fontFaceStyles: buildFontFaceStyles(data.fonts),
      };

      // Always use the user's configured CSS variables mode from settings
      // The response landed, but reading it, decoding font names and cutting
      // assets all take time the loader still offers Cancel for. Honour it.
      if (controller.signal.aborted) return;

      pendingImportRef.current = { url: normalizedUrl, ...effective };
      sendToFigma(renderData, settings.localCssVariablesMode);

      // Import consumed a quota slot server-side — refresh the footer badge.
      void refreshLicense();
    } catch (error) {
      // Cancel already closed the overlay and set its own message.
      if (controller.signal.aborted) return;
      // Every failure hands over to the inline panel, which says more than the
      // overlay could (bot-protection handoff, extension link, retry).
      hideLoader();
      setImportState({
        status: "error",
        message: toUserMessage(error, "Failed to import website"),
      });
    }
  };

  const isDisabled = !url.trim() || importState.status === "loading";
  // The how-to steps are for someone who has never imported; the field label stays.
  const showFirstRunSteps = !hasImported && !((license?.usage.imports ?? 0) > 0);

  return (
    <div class={styles.webContainer}>
      {/* Title & Instructions */}
      <div>
        <label class={styles.urlLabel} for="w2w-url-input">
          Website URL
        </label>
        {showFirstRunSteps && (
          <ul class={styles.webBullets}>
            <li>Paste a website URL</li>
            <li>Choose your import options</li>
            <li>Click Import</li>
          </ul>
        )}
      </div>

      {/* URL Input */}
      <input
        ref={inputRef}
        id="w2w-url-input"
        type="url"
        class={styles.urlInput}
        placeholder="https://www.website.com/"
        value={url}
        aria-invalid={importState.status === "error"}
        aria-describedby={
          importState.status === "error" ? "w2w-url-error" : undefined
        }
        onInput={(e) => {
          setUrl((e.target as HTMLInputElement).value);
          setLastImport(null);
        }}
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

      {/* Next step after a successful import */}
      {lastImport && !loader.isVisible && (
        <NextStepCard
          snapshot={lastImport}
          quota={license && !licenseLoading && !licenseError ? deriveQuota(license) : null}
          disabled={importState.status === "loading"}
          onImportMobile={() =>
            // Only URL + width: colours, fonts and assets come from the tab's
            // own settings, so a one-off wireframe re-import doesn't carry over.
            handleImport({ url: lastImport.url, viewports: [MOBILE_VIEWPORT] })
          }
          onAnotherPage={() => {
            setUrl(`${new URL(lastImport.url).origin}/`);
            inputRef.current?.focus();
          }}
          nextStyle={nextStyle(triedStyles)}
          showChooseYourself={triedStyles.length > 0}
          onTryStyle={() => {
            const style = nextStyle(triedStyles);
            if (!style) return;
            handleImport({
              url: lastImport.url,
              viewports: lastImport.viewports,
              ...style.settings,
            });
          }}
          onChooseYourself={() => {
            // Collapsed: opening scrolls by itself. Already open: ask the panel
            // to scroll there again.
            if (!settings.isExpanded) settings.toggleExpanded();
            else setOptionsScrollRequest((n) => n + 1);
          }}
          onDismiss={() => setLastImport(null)}
          onSeePro={requestPlanModal}
        />
      )}

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
        localOriginLinks={settings.localOriginLinks}
        setOriginLinks={settings.setOriginLinks}
        localInteractionMode={settings.localInteractionMode}
        setInteractionMode={settings.setInteractionMode}
        handleReset={settings.handleReset}
        handleSaveAsDefault={settings.handleSaveAsDefault}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
        scrollRequest={optionsScrollRequest}
      />

      {/* Import Button */}
      <button
        class={importStyles.btnPrimary}
        onClick={() => handleImport()}
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
        isVisible={loader.isVisible}
        progress={loader.progress}
        onClose={() => {
          // Closing already resets the tab. The 10s fallback timer would
          // otherwise fire later and wipe a URL the next-step card prefilled.
          if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
            resetTimeoutRef.current = null;
          }
          hideLoader();
          setImportState({ status: "idle", message: "" });
          setUrl("");
        }}
        onCancel={() => {
          loader.cancel();
          setImportState({ status: "idle", message: "Import canceled" });
        }}
      />
    </div>
  );
}
