/** @jsx h */
import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { decode } from "@msgpack/msgpack";
import { decodeW2W, detectFormat, gunzip } from "@w2w/shared/w2w-codec";
import styles from "./AreaSelection.css";
import importStyles from "../Import.css";
import { useConfig } from "../../../shared/ConfigContext";
import { useLicense } from "../../../shared/LicenseContext";
import { authHeader } from "../../../shared/licenseClient";
import { httpErrorMessage } from "../../../shared/httpErrors";
import { API_BASE_URL } from "../../../shared/apiConfig";
import FontFallbackModal from "../../../components/modalPopup/FontFallbackModal";
import RenderingLoader, {
  type RenderingProgress,
} from "../../../components/renderingLoader/RenderingLoader";
import { transformFramesData, transformW2WTreeText } from "../../../shared/transformData";
import * as perf from "../../../../utils/perf";
import { prepareFramesForRendering } from "../../../shared/absoluteModeRenderer";
import { useTabSettings } from "../../../hooks/useTabSettings";
import SettingsPanel from "../../../components/settingsPanel";
import { buildFontDownloads, buildFontRealNames, enrichFontsFromAssets } from "../../../../utils/fontDownload";
import { buildFontDeclaredCuts, buildVariableFontFamilies, type FontCut } from "../../../../utils/fontUtils";

// ============================================================================
// FIGMA-READY TYPES - matching Browser_Extension's shared/types.ts
// ============================================================================

// ExtractedElement is imported from shared/absoluteModeRenderer.ts

// CSS Variable extracted from the page
interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value (might reference other vars)
  category?: string; // color, spacing, typography, etc.
}

// Detected colors from the page (matches Browser Extension)
interface DetectedColors {
  background: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  main: string;
  source: {
    totalElements: number;
    backgroundSamples: number;
    textSamples: number;
    accentSamples: number;
  };
}

// NEW multi-frame format from Browser Extension
interface MultiFrameCaptureResult {
  url: string;
  title: string;
  timestamp: number;
  frames: Array<{ viewport: { width: number; height: number }; tree: unknown; assets?: Record<string, string> }>;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
  detectedColors?: DetectedColors;
}

// LEGACY single-viewport format (Area Selection)
interface SingleViewportCaptureResult {
  url: string;
  title: string;
  timestamp: number;
  viewport: { width: number; height: number };
  options: {
    viewport: number;
    colorMode: "plugin" | "website";
    fontMode: "plugin" | "website" | "lines";
    textMode: "semantic" | "lorem" | "website";
    variableMode?: "preserve" | "resolve";
  };
  tree: unknown;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
}

// Unified type that supports both single and multi-frame data
interface UnifiedCaptureResult {
  url: string;
  title: string;
  timestamp: number;
  frames: Array<{
    viewport: { width: number; height: number };
    tree: unknown;
    assets?: Record<string, string>;
    capturedData?: {
      frame: Record<string, unknown>;
      assets?: Record<string, { base64Encoded: boolean; content: string; mimeType?: string }>;
      doc?: Record<string, unknown>;
    };
  }>;
  fonts: unknown[];
  assets: unknown[];
  stylesheets: unknown[];
  cssVariables?: ExtractedCSSVariable[];
  detectedColors?: DetectedColors;
}

/**
 * Convert any capture format to unified multi-frame format
 * Handles: multi-frame, legacy single-viewport, and w2w content-script format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toUnifiedFormat(data: any): UnifiedCaptureResult | null {
  // Check for w2w content-script format: has 'frame' (singular) + 'doc' + 'assets' object
  if ('frame' in data && 'doc' in data && typeof data.frame === 'object' && data.frame !== null) {
    return {
      url: data.url || data.name || '',
      title: data.doc?.title || '',
      timestamp: Date.now(),
      frames: [{
        viewport: {
          width: data.width || data.doc?.innerWidth || 1440,
          height: data.doc?.innerHeight || 900,
        },
        tree: null, // Will be populated from capturedData via convertW2WToWireframe()
        assets: {},
        capturedData: {
          frame: data.frame,
          assets: data.assets,
          doc: data.doc,
        },
      }],
      fonts: data.fonts || [],
      assets: [],
      stylesheets: [],
      cssVariables: data.cssVariables,
    };
  }

  // Check for multi-viewport w2w content-script format (W2WMultiCaptureResult):
  // frames[i] has { width, frame, doc } (no viewport/tree). Top-level shares
  // assets/fonts/cssVariables across all frames.
  if (
    'frames' in data &&
    Array.isArray(data.frames) &&
    data.frames.length > 0 &&
    typeof data.frames[0]?.frame === 'object' &&
    data.frames[0]?.frame !== null &&
    typeof data.frames[0]?.width === 'number'
  ) {
    const sharedAssets = data.assets || {};
    return {
      url: data.url || data.name || '',
      title: data.frames[0]?.doc?.title || '',
      timestamp: Date.now(),
      frames: data.frames.map((fc: { width: number; frame: Record<string, unknown>; doc?: { innerHeight?: number; innerWidth?: number } }) => ({
        viewport: {
          width: fc.width || fc.doc?.innerWidth || 1440,
          height: fc.doc?.innerHeight || 900,
        },
        tree: null, // Populated downstream via convertW2WToWireframe()
        assets: {},
        capturedData: {
          frame: fc.frame,
          assets: sharedAssets,
          doc: fc.doc as Record<string, unknown> | undefined,
        },
      })),
      fonts: data.fonts || [],
      assets: [],
      stylesheets: [],
      cssVariables: data.cssVariables,
    };
  }

  // Check for new multi-frame format
  if ('frames' in data && Array.isArray(data.frames) && data.frames.length > 0) {
    const multiFrame = data as MultiFrameCaptureResult;
    return {
      url: multiFrame.url,
      title: multiFrame.title,
      timestamp: multiFrame.timestamp,
      frames: multiFrame.frames,
      fonts: multiFrame.fonts,
      assets: multiFrame.assets,
      stylesheets: multiFrame.stylesheets,
      cssVariables: multiFrame.cssVariables,
      detectedColors: multiFrame.detectedColors,
    };
  }

  // Check for legacy single-viewport format - convert to unified format
  if ('tree' in data && 'viewport' in data) {
    const singleViewport = data as SingleViewportCaptureResult;
    return {
      url: singleViewport.url,
      title: singleViewport.title,
      timestamp: singleViewport.timestamp,
      frames: [{
        viewport: singleViewport.viewport,
        tree: singleViewport.tree,
      }],
      fonts: singleViewport.fonts,
      assets: singleViewport.assets,
      stylesheets: singleViewport.stylesheets,
      cssVariables: singleViewport.cssVariables,
      // Legacy format doesn't have detectedColors
    };
  }

  return null;
}

// Import state
interface ImportState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

/** Max raw upload size. A real capture is a few MB; this caps the JSON path. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

const TAB_ID = "areaSelection";
const STORAGE_KEY = "w2w_settings_expanded_areaSelection";

export default function AreaSelection() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Mirrors `fileDataRef` for rendering — a rejected file still shows its
  // name, so the name alone must not decide whether Import is clickable.
  const [hasFile, setHasFile] = useState(false);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
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
  // Extracted fonts from the captured file — fed into FontFallbackModal so the
  // "Download fonts (.zip)" button can appear when fonts are missing locally.
  // Mirrors the pattern used by Web.tsx and HTML.tsx.
  const [extractedFonts, setExtractedFonts] = useState<unknown[]>([]);
  // Rendering loader state
  const [showRenderingLoader, setShowRenderingLoader] = useState(false);
  const [renderingProgress, setRenderingProgress] = useState<RenderingProgress | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDataRef = useRef<File | null>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderingProgressRef = useRef<RenderingProgress | undefined>();
  const { config } = useConfig();
  const { refresh: refreshLicense } = useLicense();
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  // Listen for messages from Figma plugin main thread
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "render-progress") {
        const { step, percent, isComplete } = msg.data;
        setRenderingProgress({ step, percent, isComplete });
        renderingProgressRef.current = { step, percent, isComplete };

        // Clear safety timeout — sandbox is responding
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }

        // When complete, show success state then close
        if (isComplete) {
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            setShowRenderingLoader(false);
            setRenderingProgress(undefined);
            renderingProgressRef.current = undefined;
            setImportState({ status: "idle", message: "" });
            setFileName(null);
            fileDataRef.current = null;
            setHasFile(false);

            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
            resetTimeoutRef.current = null;
          }, 10000); // Show success state for 10 seconds
        }
      }

      if (msg.type === "wireframe-created") {
        // Handled by render-progress with isComplete
      }

      if (msg.type === "fonts-not-available") {
        // Clear safety timeout — sandbox responded
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }
        setFontModalData(msg.data);
        setShowFontModal(true);
      }

      if (msg.type === "wireframe-error") {
        // Clear safety timeout
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
        renderingProgressRef.current = undefined;
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

  const acceptFile = (file: File) => {
    // Reject implausibly large uploads up front. A legit capture is a few MB;
    // this caps the plain-JSON parse path and is a first guard before any
    // decompression (see also the decompressed-size ceiling in the codec).
    if (file.size > MAX_UPLOAD_BYTES) {
      setFileName(file.name);
      fileDataRef.current = null;
      setHasFile(false);
      setImportState({
        status: "error",
        message: "File is too large to import (over 100 MB).",
      });
      return;
    }
    // Mirrors the file picker's `accept=".w2w"`. The decoder rejects anything
    // else by magic bytes anyway, but only once Import is pressed — catching it
    // on drop tells the user immediately instead of leaving a dead filename.
    if (!file.name.toLowerCase().endsWith(".w2w")) {
      setFileName(file.name);
      fileDataRef.current = null;
      setHasFile(false);
      setImportState({
        status: "error",
        message:
          "Only .w2w files exported from the Web2Wireframe extension can be imported here.",
      });
      return;
    }
    setFileName(file.name);
    fileDataRef.current = file;
    setHasFile(true);
    setImportState({ status: "idle", message: "" });
  };

  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) acceptFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (importState.status === "loading") return;
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptFile(file);
  };

  const handleBrowse = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  /**
   * Process file and render wireframe(s)
   * Handles both single and multi-frame files
   * Uses inline settings from useTabSettings hook
   */
  const processAndRender = async (
    captureResult: UnifiedCaptureResult
  ) => {
    // Collapse settings panel during import
    settings.collapseSettings();

    // Surface the captured fonts list so FontFallbackModal can offer the
    // "Download fonts (.zip)" button if any are missing on the user's machine.
    //
    // The extension stores font binaries in the capture's URL-keyed asset map
    // without linking them to the face that declared them. Re-attach them here:
    // the ZIP then builds from the bytes already in the .w2w (no blocked
    // cross-origin fetches), and each face gains the real SFNT family name the
    // font actually installs under.
    const capturedFonts = await enrichFontsFromAssets(
      captureResult.fonts,
      captureResult.frames.find((f) => f.capturedData?.assets)?.capturedData?.assets,
    );
    setExtractedFonts(capturedFonts);

    // Cancel any pending reset from previous import
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    // Show the rendering loader
    setShowRenderingLoader(true);
    setRenderingProgress({
      step: "Preparing wireframe data…",
      percent: 0,
    });
    setImportState({ status: "loading", message: "" });

    // Transform text content based on textMode (lorem, semantic, or website)
    // This must happen BEFORE converting to wireframe nodes
    const transformStartedAt = Date.now();
    const transformedFrames = transformFramesData(
      captureResult.frames as unknown as Parameters<typeof transformFramesData>[0],
      {
        colorMode: settings.localColorMode,
        fontMode: settings.localFontMode,
        textMode: settings.localTextMode,
      }
    );

    // Check if frames have capturedData (new content script extraction)
    const inputFrames = captureResult.frames;
    const hasCapturedData = inputFrames.some(f => f.capturedData?.frame);

    let framesData;

    if (hasCapturedData) {
      // New capture format — skip old convertToWireframeNode, pass directly to main.ts
      // main.ts sandbox will call convertW2WToWireframe() (has access to css-converter)
      framesData = inputFrames.map((frame) => {
        // Apply text transformation (semantic/lorem) to W2W tree before sending to Figma
        if (frame.capturedData?.frame && settings.localTextMode !== "website") {
          transformW2WTreeText(frame.capturedData.frame, settings.localTextMode);
        }
        return {
          viewportWidth: frame.viewport?.width ?? 1440,
          viewportHeight: frame.viewport?.height ?? 900,
          // `null` matches Web.tsx convention — main.ts's FIX A guard treats
          // any falsy tree as "needs conversion from capturedData". Using an
          // empty object `{}` here was truthy and silently bypassed FIX A,
          // leaving the rendered frame empty for .w2w imports.
          tree: null as unknown,
          assets: frame.assets || {},
          capturedData: frame.capturedData,
        };
      });
    } else {
      // Legacy format — use old conversion pipeline
       
      framesData = prepareFramesForRendering(
        transformedFrames as unknown as Parameters<typeof prepareFramesForRendering>[0],
        {
          text: config.pluginColors.text,
          surface: config.pluginColors.surface,
        }
      );

      // Carry over assets from input frames to output frames
      for (let i = 0; i < framesData.length; i++) {
        if (inputFrames[i]?.assets) {
          (framesData[i] as { assets?: Record<string, string> }).assets = inputFrames[i].assets;
        }
      }
    }

    perf.mark("ui.transform", Date.now() - transformStartedAt);

    // Send to Figma main thread with all options from inline settings
    renderingProgressRef.current = { step: "Preparing wireframe data…", percent: 0 };
    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: framesData,
            sourceUrl: captureResult.url,
            pluginColors: config.pluginColors,
            pluginFont: config.pluginFont,
            cssVariables: captureResult.cssVariables || [],
            variableMode: settings.localCssVariablesMode,
            layoutMode: settings.localLayoutMode,
            colorMode: settings.localColorMode,
            fontMode: settings.localFontMode,
            textMode: settings.localTextMode,
            assetMode: settings.localAssetMode,
            interactionMode: settings.localInteractionMode,
            htmlLayerNames: config.htmlLayerNames,
            geometryRows: config.geometryRows,
            fontRealNames: buildFontRealNames(capturedFonts),
            fontDeclaredCuts: buildFontDeclaredCuts(capturedFonts),
            fontVariableFamilies: Array.from(buildVariableFontFamilies(capturedFonts)),
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

    // Safety timeout: if sandbox doesn't respond within 60s, assume failure
    renderTimeoutRef.current = setTimeout(() => {
      if (renderingProgressRef.current?.percent === 0) {
        setShowRenderingLoader(false);
        setRenderingProgress(undefined);
        renderingProgressRef.current = undefined;
        setImportState({
          status: "error",
          message: "Import timed out — the file may be too large. Try a simpler page.",
        });
      }
    }, 60000);
  };

  /**
   * Handle font fallback choice from modal
   */
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
    if (!fileDataRef.current) {
      setImportState({ status: "error", message: "No file selected" });
      return;
    }

    setImportState({ status: "loading", message: "Importing the file…" });

    try {
      // 1. Read file as ArrayBuffer
      const decodeStartedAt = Date.now();
      const arrayBuffer = await fileDataRef.current.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);

      // Detect format by magic bytes (robust to file extension): the hardened
      // Only `.w2w` capture files are accepted — the hardened container or a
      // legacy gzip+msgpack `.w2w`. Plain JSON (and anything else, even if
      // dragged in or renamed) is rejected via magic-byte detection.
      const format = detectFormat(fileBytes);

      let rawData: MultiFrameCaptureResult | SingleViewportCaptureResult;

      if (format === "w2w" || format === "w2w-v2") {
        // Hardened .w2w container (current keyed-tag or legacy "W2W2") —
        // unscramble + decrypt + gunzip + msgpack.
        setImportState({ status: "loading", message: "Decoding data…" });
        rawData = (await decodeW2W(fileBytes)) as
          | MultiFrameCaptureResult
          | SingleViewportCaptureResult;
      } else if (format === "gzip-legacy") {
        // Legacy .w2w — gzip + msgpack (pre-hardening exports).
        setImportState({ status: "loading", message: "Decompressing…" });
        const decompressedData = await gunzip(new Uint8Array(arrayBuffer));

        setImportState({ status: "loading", message: "Decoding data…" });
        rawData = decode(decompressedData) as MultiFrameCaptureResult | SingleViewportCaptureResult;
      } else {
        throw new Error(
          "Only .w2w files exported from the Web2Wireframe extension can be imported here.",
        );
      }

      perf.mark("ui.decodeW2W", Date.now() - decodeStartedAt);

      // Convert to unified multi-frame format (handles both old single-viewport and new multi-frame format)
      const unifiedResult = toUnifiedFormat(rawData);
      if (!unifiedResult) {
        throw new Error(
          "This file isn't a valid Web2Wireframe capture. Please upload a .w2w file exported from the extension.",
        );
      }

      // Count this .w2w import against the user's quota. Extension captures
      // are otherwise untracked (the extension just downloads the file). Done
      // after a successful decode so an invalid file never consumes a slot.
      // Forward the decoded metadata so the server can attribute the import in
      // the admin history (the .w2w file itself never leaves the client).
      const response = await perf.timed("ui.fetch", () => fetch(`${API_BASE_URL}/api/import-w2w-file`, {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl: unifiedResult.url,
          title: unifiedResult.title,
          viewports: unifiedResult.frames.map((f) => f.viewport.width),
          // The .w2w renders client-side, so forward the render settings (the 6
          // More Options) for the admin import history.
          colorMode: settings.localColorMode,
          typographyMode: settings.localFontMode,
          textMode: settings.localTextMode,
          assetMode: settings.localAssetMode,
          cssVariablesMode: settings.localCssVariablesMode,
          layoutMode: settings.localLayoutMode,
        }),
      }));

      const { isAuthExpired } = await import("../../../shared/authEvents");
      if (isAuthExpired(response)) return;

      const { isQuotaExceeded } = await import("../../../shared/quotaEvents");
      if (await isQuotaExceeded(response)) {
        // QuotaExceededModal shows via the w2w:quota-exceeded event.
        setImportState({ status: "idle", message: "" });
        return;
      }

      if (!response.ok) {
        throw new Error(httpErrorMessage(response.status));
      }

      // Render directly using inline settings (no modal)
      await processAndRender(unifiedResult);

      // Refresh the footer badge to reflect the just-incremented count.
      void refreshLicense();
    } catch (error) {
      setShowRenderingLoader(false);
      setRenderingProgress(undefined);
      setImportState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to import file",
      });
    }
  };

  // Open extension install page
  const handleInstallExtension = () => {
    window.open("https://chromewebstore.google.com/detail/web2wireframe/fcmicolldgpmpdkcdljkaaimmjmboipl", "_blank");
  };

  const isDisabled = !hasFile || importState.status === "loading";

  return (
    <div class={styles.areaSection}>
      {/* Title & Instructions */}
      <div>
        <div class={styles.areaTitle}>AREA SELECTION</div>
        <ul class={styles.areaBullets}>
          <li>
            Install our browser extension (Chrome/Edge)
            <button
              class={styles.installInlineBtn}
              onClick={handleInstallExtension}
            >
              Install
            </button>
          </li>
          <li>Select a specific region on any webpage via extension</li>
          <li>Download the generated .w2w file</li>
          <li>Upload the file here to convert it into a wireframe</li>
        </ul>
      </div>

      {/* Upload Area — also the drag & drop target */}
      <div
        class={`${styles.areaUpload} ${isDragOver ? styles.dragOver : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div class={styles.uploadIcon}>⬚</div>
        <div class={styles.uploadCopy}>
          <div class={styles.uploadText}>
            {fileName ? fileName : "Drag-and-drop your .w2w file"}
          </div>
          <div class={styles.uploadSubtext}>or select from your computer</div>
          <div class={styles.uploadActions}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".w2w"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <button
              class={styles.uploadBtn}
              onClick={handleBrowse}
              disabled={importState.status === "loading"}
            >
              Browse
            </button>
          </div>
        </div>
      </div>

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

      {/* More Options (inline settings panel) */}
      <SettingsPanel
        styles={importStyles}
        containerClassName={importStyles.settingsBox}
        hideViewports={true}
        isExpanded={settings.isExpanded}
        toggleExpanded={settings.toggleExpanded}
        localViewports={settings.localViewports}
        localColorMode={settings.localColorMode}
        localFontMode={settings.localFontMode}
        localTextMode={settings.localTextMode}
        localCssVariablesMode={settings.localCssVariablesMode}
        localLayoutMode={settings.localLayoutMode}
        localAssetMode={settings.localAssetMode}
        localInteractionMode={settings.localInteractionMode}
        toggleViewport={settings.toggleViewport}
        setColorMode={settings.setColorMode}
        setFontMode={settings.setFontMode}
        setTextMode={settings.setTextMode}
        setCssVariablesMode={settings.setCssVariablesMode}
        setLayoutMode={settings.setLayoutMode}
        setAssetMode={settings.setAssetMode}
        setInteractionMode={settings.setInteractionMode}
        handleReset={settings.handleReset}
        handleSaveAsDefault={settings.handleSaveAsDefault}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
      />

      {/* Import Button */}
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

      {/* Rendering Loader Overlay */}
      <RenderingLoader
        isVisible={showRenderingLoader}
        progress={renderingProgress}
        onClose={() => {
          setShowRenderingLoader(false);
          setRenderingProgress(undefined);
          setImportState({ status: "idle", message: "" });
          setFileName(null);
          fileDataRef.current = null;
          setHasFile(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
      />
    </div>
  );
}
