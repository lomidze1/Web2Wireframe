/** @jsx h */
import { h } from "preact";
import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import styles from "./Screenshot.css";
import importStyles from "../Import.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { useLicense } from "../../../shared/LicenseContext";
import { authHeader } from "../../../shared/licenseClient";
import { httpErrorMessage, toUserMessage } from "../../../shared/httpErrors";
import { API_BASE_URL } from "../../../shared/apiConfig";
import {
  downscaleImage,
  loadImageElement,
  type DownscaledImage,
} from "../../../shared/imageDownscale";
import type { CropSource } from "../../../shared/screenshotCrop";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "screenshot";
const STORAGE_KEY = "w2w_settings_expanded_screenshot";
const API_URL = API_BASE_URL;

const UNSUPPORTED_FORMAT_MESSAGE =
  "Unsupported image format. Please use PNG, JPEG, WebP, or GIF.";

export default function Screenshot() {
  // Downscaled image + its dimensions — the request uses these directly,
  // so what we report always matches what the AI actually receives.
  const [image, setImage] = useState<DownscaledImage | null>(null);
  // The pre-downscale file, kept only for Real Assets cropping — icons cut
  // from the 1568px-capped JPEG would be blurry. The AI still receives the
  // downscaled copy, so tokens and payload size are unchanged.
  const cropSourceRef = useRef<CropSource | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How closely the rendered frame matches the uploaded image (see visualDiff).
  const [match, setMatch] = useState<{
    score: number;
    heatmapUrl: string | null;
  } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { config } = useConfig();
  const { refresh: refreshLicense } = useLicense();
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  // Screenshot mode can't use website fonts, auto-layout, hover variants, or
  // semantic text. Coerce to the supported value for display and import —
  // derived, never written back, so the user's settings on other tabs (and
  // the global defaults) stay untouched. The SettingsPanel disables these
  // options with a tooltip; this only handles an incompatible default.
  // assetMode is NOT coerced: Real Assets works here by cropping the
  // uploaded screenshot (see screenshotCrop.ts).
  const fontMode =
    settings.localFontMode === "website" ? "plugin" : settings.localFontMode;
  const layoutMode =
    settings.localLayoutMode === "autoLayout"
      ? "absolute"
      : settings.localLayoutMode;
  const assetMode = settings.localAssetMode;
  const interactionMode =
    settings.localInteractionMode === "variants"
      ? "none"
      : settings.localInteractionMode;
  const textMode =
    settings.localTextMode === "semantic" ? "lorem" : settings.localTextMode;

  // Listen for wireframe creation results from Figma sandbox
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === "wireframe-created") {
        setIsGenerating(false);
      }
      if (msg.type === "wireframe-error") {
        setIsGenerating(false);
        setError(msg.data.error || "Failed to create wireframe");
      }
      if (msg.type === "wireframe-exported" && cropSourceRef.current) {
        const source = cropSourceRef.current;
        void (async () => {
          const { compareRenderToSource } = await import(
            "../../../shared/visualDiff"
          );
          setMatch(await compareRenderToSource(msg.data, source));
        })();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Shared entry point for all three input sources (file picker, drag &
  // drop, clipboard paste): read → downscale → preview.
  const processFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl !== "string") {
        setError(UNSUPPORTED_FORMAT_MESSAGE);
        return;
      }
      try {
        const original = await loadImageElement(dataUrl);
        cropSourceRef.current = {
          dataUrl,
          width: original.naturalWidth,
          height: original.naturalHeight,
        };
        setImage(await downscaleImage(dataUrl));
      } catch {
        // Browser couldn't decode it (HEIC, corrupted file, …) — surface
        // the error BEFORE a quota-consuming upload.
        setError(UNSUPPORTED_FORMAT_MESSAGE);
      }
    };
    reader.onerror = () => setError(UNSUPPORTED_FORMAT_MESSAGE);
    reader.readAsDataURL(file);
  }, []);

  const handleImageUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  };

  // Clipboard paste (Cmd/Ctrl+V) — the most natural input for screenshots.
  useEffect(() => {
    const onPaste = (e: Event) => {
      const clipboard = (e as ClipboardEvent).clipboardData;
      if (!clipboard) return;
      let file: File | null = clipboard.files?.[0] ?? null;
      if (!file) {
        for (const item of Array.from(clipboard.items ?? [])) {
          if (item.type.startsWith("image/")) {
            file = item.getAsFile();
            break;
          }
        }
      }
      if (file && file.type.startsWith("image/")) processFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [processFile]);

  const handleDelete = (e: Event) => {
    e.stopPropagation();
    setImage(null);
    cropSourceRef.current = null;
    setError(null);
    setMatch(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!image) return;

    setIsGenerating(true);
    setError(null);
    setMatch(null);
    setShowHeatmap(false);
    settings.collapseSettings();

    try {
      const response = await fetch(`${API_URL}/api/import-screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader() },
        body: JSON.stringify({
          figmaUserId: config.figmaUserId,
          imageBase64: image.dataUrl,
          imageWidth: image.width,
          imageHeight: image.height,
          viewports: settings.localViewports.map(Number),
          pluginColors: config.pluginColors,
          pluginFont: config.pluginFont,
          textMode,
          colorMode: settings.localColorMode,
          // Screenshot mode coerces incompatible settings (website fonts →
          // plugin, auto-layout → absolute); log the coerced values that the
          // import actually used, not the raw ones.
          typographyMode: fontMode,
          assetMode: assetMode,
          cssVariablesMode: settings.localCssVariablesMode,
          layoutMode: layoutMode,
        }),
      });

      const { isAuthExpired } = await import("../../../shared/authEvents");
      if (isAuthExpired(response)) return;

      const { isQuotaExceeded } = await import("../../../shared/quotaEvents");
      if (await isQuotaExceeded(response)) {
        setIsGenerating(false);
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || httpErrorMessage(response.status));
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Screenshot analysis failed");

      const frames = data.wireframeData.frames;

      // Real Assets: the screenshot itself is the only pixel source, so cut
      // each observed placeholder out of the original file. Best-effort —
      // any failure just leaves the wireframe placeholders in place.
      if (assetMode === "realAssets" && cropSourceRef.current) {
        try {
          const { applyScreenshotCrops } = await import(
            "../../../shared/screenshotCrop"
          );
          await applyScreenshotCrops(frames, cropSourceRef.current);
        } catch {
          /* keep placeholders */
        }
      }

      // Send to Figma sandbox for rendering
      parent.postMessage(
        {
          pluginMessage: {
            type: "render-wireframe",
            data: {
              frames,
              sourceUrl: data.sourceUrl,
              pluginColors: data.pluginColors,
              pluginFont: config.pluginFont,
              variableMode: "direct",
              layoutMode: "absolute",
              colorMode: settings.localColorMode,
              fontMode: "plugin",
              textMode,
              assetMode,
              compareToSource: true,
            },
          },
        },
        "*"
      );

      // Import consumed a quota slot server-side — refresh the footer badge.
      void refreshLicense();
    } catch (err: unknown) {
      setIsGenerating(false);
      setError(toUserMessage(err, "Screenshot analysis failed"));
    }
    // `settings` is the full hook return value (collapseSettings + local*
    // state) — include it whole; eslint's exhaustive-deps can't track the
    // individual fields we use across the callback body.
  }, [image, textMode, config, settings, refreshLicense]);

  return (
    <div class={styles.screenshotContainer}>
      {/* Image Upload Area — label + visually-hidden input keeps keyboard
          and screen-reader access (Tab focuses input, Space/Enter opens
          picker, label click also triggers it). Delete button is rendered
          outside the label so its click doesn't re-open the picker.
          The wrapper is also the drag & drop target. */}
      <div
        class={styles.uploadWrapper}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {image && (
          <button
            type="button"
            class={styles.deleteBtn}
            onClick={handleDelete}
            aria-label="Remove uploaded image"
          >
            ✕
          </button>
        )}
        <label
          class={`${styles.imageUploadArea} ${
            image ? styles.hasImage : ""
          } ${isDragOver ? styles.dragOver : ""}`}
        >
          <input
            type="file"
            ref={fileInputRef}
            class={styles.hiddenInput}
            accept="image/*"
            aria-label={
              image ? "Replace uploaded image" : "Upload screenshot image"
            }
            onChange={handleImageUpload}
          />
        {image ? (
          <img
            src={image.dataUrl}
            class={styles.screenshotPreview}
            alt="Screenshot preview"
          />
        ) : (
          <div class={styles.uploadContent}>
            <div class={styles.uploadIcon} aria-hidden="true">
              📸
            </div>
            <div>
              <div class={styles.uploadHeading}>Click to upload screenshot</div>
              <div class={styles.uploadCaption}>
                or drag & drop, or paste (Ctrl/Cmd+V)
              </div>
            </div>
          </div>
        )}
        </label>
      </div>

      {/* Settings */}
      <SettingsPanel
        styles={importStyles}
        containerClassName={importStyles.settingsBox}
        isExpanded={settings.isExpanded}
        toggleExpanded={settings.toggleExpanded}
        localViewports={settings.localViewports}
        localColorMode={settings.localColorMode}
        localFontMode={fontMode}
        localTextMode={textMode}
        localCssVariablesMode={settings.localCssVariablesMode}
        localLayoutMode={layoutMode}
        localAssetMode={assetMode}
        toggleViewport={settings.toggleViewport}
        setColorMode={settings.setColorMode}
        setFontMode={settings.setFontMode}
        setTextMode={settings.setTextMode}
        setCssVariablesMode={settings.setCssVariablesMode}
        setLayoutMode={settings.setLayoutMode}
        setAssetMode={settings.setAssetMode}
        handleReset={settings.handleReset}
        handleSaveAsDefault={settings.handleSaveAsDefault}
        hasOverrides={settings.hasOverrides}
        openSettings={settings.openSettings}
        colorWebsiteLabel="Screenshot Colors"
        textWebsiteLabel="Screenshot Text"
        disableSemanticOption={true}
        semanticDisabledTooltip="Not available in Screenshot mode"
        disableFontWebsiteOption={true}
        fontDisabledTooltip="Not available in Screenshot mode"
        disableAutoLayoutOption={true}
        layoutDisabledTooltip="Not available in Screenshot mode"
        localInteractionMode={interactionMode}
        setInteractionMode={settings.setInteractionMode}
        disableInteractionsVariants={true}
        interactionsDisabledTooltip="Not available in Screenshot mode"
      />

      {/* Error Display */}
      {error && (
        <p class={styles.errorText} role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {/* Generate Button */}
      <button
        class={importStyles.btnPrimary}
        onClick={handleGenerate}
        disabled={!image || isGenerating}
      >
        {isGenerating ? "Importing…" : "Import"}
      </button>

      {/* Visual match — how close the rendered frame is to the uploaded image.
          A signal, not a verdict: the wireframe uses the plugin font, so a
          perfect layout still lands well short of 100%. */}
      {match && (
        <div class={styles.matchCard}>
          <button
            type="button"
            class={styles.matchHeader}
            onClick={() => setShowHeatmap((v) => !v)}
            disabled={!match.heatmapUrl}
            aria-expanded={showHeatmap}
          >
            <span>Visual match</span>
            <span class={styles.matchScore}>{match.score}%</span>
          </button>
          {showHeatmap && match.heatmapUrl && (
            <img
              src={match.heatmapUrl}
              class={styles.matchHeatmap}
              alt="Difference heatmap — red marks where the import diverges from the screenshot"
            />
          )}
        </div>
      )}
    </div>
  );
}
