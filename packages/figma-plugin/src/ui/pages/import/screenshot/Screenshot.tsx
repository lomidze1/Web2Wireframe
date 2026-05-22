/** @jsx h */
import { h } from "preact";
import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import styles from "./Screenshot.css";
import importStyles from "../Import.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import { authHeader } from "../../../shared/licenseClient";
import { httpErrorMessage, toUserMessage } from "../../../shared/httpErrors";
import { API_BASE_URL } from "../../../shared/apiConfig";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "screenshot";
const STORAGE_KEY = "w2w_settings_expanded_screenshot";
const API_URL = API_BASE_URL;

export default function Screenshot() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { config } = useConfig();
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  // Screenshot mode can't use website fonts, auto-layout, real assets, hover
  // variants, or semantic text. Coerce to the supported value for display and
  // import — derived, never written back, so the user's settings on other
  // tabs (and the global defaults) stay untouched. The SettingsPanel disables
  // these options with a tooltip; this only handles an incompatible default.
  const fontMode =
    settings.localFontMode === "website" ? "plugin" : settings.localFontMode;
  const layoutMode =
    settings.localLayoutMode === "autoLayout"
      ? "absolute"
      : settings.localLayoutMode;
  const assetMode =
    settings.localAssetMode === "realAssets"
      ? "placeholders"
      : settings.localAssetMode;
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
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleImageUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      setError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDelete = (e: Event) => {
    e.stopPropagation();
    setImagePreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!imagePreview) return;

    setIsGenerating(true);
    setError(null);
    settings.collapseSettings();

    try {
      // Get image dimensions
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("Failed to read image dimensions"));
          img.src = imagePreview;
        }
      );

      const response = await fetch(`${API_URL}/api/import-screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader() },
        body: JSON.stringify({
          figmaUserId: config.figmaUserId,
          imageBase64: imagePreview,
          imageWidth: dimensions.width,
          imageHeight: dimensions.height,
          viewports: settings.localViewports.map(Number),
          pluginColors: config.pluginColors,
          pluginFont: config.pluginFont,
          textMode,
          colorMode: settings.localColorMode,
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

      // Send to Figma sandbox for rendering
      parent.postMessage(
        {
          pluginMessage: {
            type: "render-wireframe",
            data: {
              frames: data.wireframeData.frames,
              sourceUrl: data.sourceUrl,
              pluginColors: data.pluginColors,
              pluginFont: config.pluginFont,
              variableMode: "direct",
              layoutMode: "absolute",
              colorMode: settings.localColorMode,
              fontMode: "plugin",
              textMode,
            },
          },
        },
        "*"
      );
    } catch (err: unknown) {
      setIsGenerating(false);
      setError(toUserMessage(err, "Screenshot analysis failed"));
    }
  }, [imagePreview, settings.localViewports, textMode, settings.localColorMode, config]);

  return (
    <div class={styles.screenshotContainer}>
      {/* Image Upload Area — label + visually-hidden input keeps keyboard
          and screen-reader access (Tab focuses input, Space/Enter opens
          picker, label click also triggers it). Delete button is rendered
          outside the label so its click doesn't re-open the picker. */}
      <div class={styles.uploadWrapper}>
        {imagePreview && (
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
            imagePreview ? styles.hasImage : ""
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            class={styles.hiddenInput}
            accept="image/*"
            aria-label={
              imagePreview ? "Replace uploaded image" : "Upload screenshot image"
            }
            onChange={handleImageUpload}
          />
        {imagePreview ? (
          <img
            src={imagePreview}
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
              <div class={styles.uploadCaption}>or drag and drop</div>
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
        disableRealAssetsOption={true}
        assetsDisabledTooltip="Not available in Screenshot mode"
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
        disabled={!imagePreview || isGenerating}
      >
        {isGenerating ? "Importing…" : "Import"}
      </button>
    </div>
  );
}
