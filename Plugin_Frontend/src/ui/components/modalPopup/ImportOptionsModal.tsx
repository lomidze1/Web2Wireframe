/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import styles from "./Modal.css";

export type ColorMode = "plugin" | "website";
export type FontMode = "plugin" | "website";
export type TextMode = "lorem" | "semantic" | "website";

export interface ImportOptions {
  colorMode: ColorMode;
  fontMode: FontMode;
  textMode: TextMode;
}

interface ImportOptionsModalProps {
  isOpen: boolean;
  onConfirm: (options: ImportOptions) => void;
  onCancel: () => void;
  sourceUrl?: string;
}

const DEFAULT_OPTIONS: ImportOptions = {
  colorMode: "website",
  fontMode: "website",
  textMode: "website",
};

export default function ImportOptionsModal({
  isOpen,
  onConfirm,
  onCancel,
  sourceUrl,
}: ImportOptionsModalProps) {
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(options);
    // Reset to defaults for next time
    setOptions(DEFAULT_OPTIONS);
  };

  const handleCancel = () => {
    onCancel();
    setOptions(DEFAULT_OPTIONS);
  };

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.importOptionsModal}`}>
        <div class={styles.modalHeader}>
          <span>Import Options</span>
          <button class={styles.modalClose} onClick={handleCancel}>
            &times;
          </button>
        </div>

        <div class={styles.modalContent}>
          {sourceUrl && (
            <p class={styles.importOptionsUrl}>
              Importing: <strong>{new URL(sourceUrl).hostname}</strong>
            </p>
          )}

          {/* Color Mode */}
          <div class={styles.importOptionsSection}>
            <label class={styles.importOptionsLabel}>Colors</label>
            <div class={styles.importOptionsButtons}>
              <button
                class={`${styles.importOptionsBtn} ${options.colorMode === "website" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, colorMode: "website" }))}
              >
                <span class={styles.importOptionsBtnIcon}>🌐</span>
                <span>Website</span>
              </button>
              <button
                class={`${styles.importOptionsBtn} ${options.colorMode === "plugin" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, colorMode: "plugin" }))}
              >
                <span class={styles.importOptionsBtnIcon}>🎨</span>
                <span>Plugin</span>
              </button>
            </div>
            <p class={styles.importOptionsHint}>
              {options.colorMode === "website"
                ? "Use original colors from the website"
                : "Replace with your plugin color palette"}
            </p>
          </div>

          {/* Font Mode */}
          <div class={styles.importOptionsSection}>
            <label class={styles.importOptionsLabel}>Fonts</label>
            <div class={styles.importOptionsButtons}>
              <button
                class={`${styles.importOptionsBtn} ${options.fontMode === "website" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, fontMode: "website" }))}
              >
                <span class={styles.importOptionsBtnIcon}>🌐</span>
                <span>Website</span>
              </button>
              <button
                class={`${styles.importOptionsBtn} ${options.fontMode === "plugin" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, fontMode: "plugin" }))}
              >
                <span class={styles.importOptionsBtnIcon}>📝</span>
                <span>Plugin</span>
              </button>
            </div>
            <p class={styles.importOptionsHint}>
              {options.fontMode === "website"
                ? "Keep original fonts from the website"
                : "Replace with your plugin font (Montserrat)"}
            </p>
          </div>

          {/* Text Mode */}
          <div class={styles.importOptionsSection}>
            <label class={styles.importOptionsLabel}>Text Content</label>
            <div class={styles.importOptionsButtons}>
              <button
                class={`${styles.importOptionsBtn} ${options.textMode === "website" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, textMode: "website" }))}
              >
                <span class={styles.importOptionsBtnIcon}>🌐</span>
                <span>Website</span>
              </button>
              <button
                class={`${styles.importOptionsBtn} ${options.textMode === "lorem" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, textMode: "lorem" }))}
              >
                <span class={styles.importOptionsBtnIcon}>📄</span>
                <span>Lorem</span>
              </button>
              <button
                class={`${styles.importOptionsBtn} ${options.textMode === "semantic" ? styles.importOptionsBtnActive : ""}`}
                onClick={() => setOptions((prev) => ({ ...prev, textMode: "semantic" }))}
              >
                <span class={styles.importOptionsBtnIcon}>📋</span>
                <span>Semantic</span>
              </button>
            </div>
            <p class={styles.importOptionsHint}>
              {options.textMode === "website"
                ? "Keep original text content"
                : options.textMode === "lorem"
                  ? "Replace with lorem ipsum placeholder"
                  : "Replace with semantic placeholders (e.g., 'Heading', 'Body')"}
            </p>
          </div>
        </div>

        <div class={styles.importOptionsFooter}>
          <button class={styles.importOptionsCancelBtn} onClick={handleCancel}>
            Cancel
          </button>
          <button class={styles.importOptionsConfirmBtn} onClick={handleConfirm}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
