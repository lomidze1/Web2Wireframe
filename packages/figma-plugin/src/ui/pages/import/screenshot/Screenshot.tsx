/** @jsx h */
import { h } from "preact";
import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import styles from "./Screenshot.css";
import { useTabSettings } from "../../../hooks/useTabSettings";
import { useConfig } from "../../../shared/ConfigContext";
import SettingsPanel from "../../../components/settingsPanel";

const TAB_ID = "screenshot";
const STORAGE_KEY = "w2w_settings_expanded_screenshot";
const API_URL = "http://localhost:3002";

export default function Screenshot() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { config } = useConfig();
  const settings = useTabSettings(TAB_ID, STORAGE_KEY);

  // Force plugin fonts — website fonts not available in screenshot mode
  useEffect(() => {
    if (settings.localFontMode === "website") {
      settings.setFontMode("plugin");
    }
  }, [settings.localFontMode]);

  // Force absolute layout — auto-layout not available in screenshot mode
  useEffect(() => {
    if (settings.localLayoutMode === "autoLayout") {
      settings.setLayoutMode("absolute");
    }
  }, [settings.localLayoutMode]);

  // Force placeholders — real assets not available in screenshot mode (no DOM)
  useEffect(() => {
    if (settings.localAssetMode === "realAssets") {
      settings.setAssetMode("placeholders");
    }
  }, [settings.localAssetMode]);

  // Force no interactions — hover variants not available in screenshot mode
  useEffect(() => {
    if (settings.localInteractionMode === "variants") {
      settings.setInteractionMode("none");
    }
  }, [settings.localInteractionMode]);

  // Force lorem/website text — semantic placeholders not useful in screenshot mode
  useEffect(() => {
    if (settings.localTextMode === "semantic") {
      settings.setTextMode("lorem");
    }
  }, [settings.localTextMode]);

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

  const handleAreaClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imagePreview,
          imageWidth: dimensions.width,
          imageHeight: dimensions.height,
          viewports: settings.localViewports.map(Number),
          pluginColors: config.pluginColors,
          pluginFont: config.pluginFont,
          textMode: settings.localTextMode,
          colorMode: settings.localColorMode,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
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
              textMode: settings.localTextMode,
            },
          },
        },
        "*"
      );
    } catch (err: unknown) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : "Screenshot analysis failed");
    }
  }, [imagePreview, settings.localViewports, settings.localTextMode, settings.localColorMode, config]);

  return (
    <div class={styles.screenshotContainer}>
      {/* Image Upload Area */}
      <div
        class={`${styles.imageUploadArea} ${
          imagePreview ? styles.hasImage : ""
        }`}
        onClick={handleAreaClick}
      >
        {imagePreview && (
          <button class={styles.deleteBtn} onClick={handleDelete}>
            ✕
          </button>
        )}
        <input
          type="file"
          ref={fileInputRef}
          class={styles.hiddenInput}
          accept="image/*"
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
            <div class={styles.uploadIcon}>📸</div>
            <div>
              <div style={{ fontWeight: 600 }}>Click to upload screenshot</div>
              <div style={{ fontSize: "11px", marginTop: "4px" }}>
                or drag and drop
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <SettingsPanel
        styles={styles}
        containerClassName={styles.screenshotSettings}
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
        localInteractionMode={settings.localInteractionMode}
        setInteractionMode={settings.setInteractionMode}
        disableInteractionsVariants={true}
        interactionsDisabledTooltip="Not available in Screenshot mode"
      />

      {/* Error Display */}
      {error && <p class={styles.errorText}>{error}</p>}

      {/* Generate Button */}
      <button
        class={styles.screenshotBtn}
        onClick={handleGenerate}
        disabled={!imagePreview || isGenerating}
      >
        {isGenerating ? "Analyzing Screenshot..." : "Generate Wireframe"}
      </button>
    </div>
  );
}
