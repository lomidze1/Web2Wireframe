/** @jsx h */
import { h } from "preact";
import { useState, useRef } from "preact/hooks";
import styles from "./AreaSelection.css";

export default function AreaSelection() {
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  const handleBrowse = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleGenerate = () => {
    console.log("Generating wireframe from .w2w file:", fileName);
    // .w2w file already contains all configuration data
    // No additional settings needed
  };

  // Open extension install page
  const handleInstallExtension = () => {
    window.open("https://chrome.google.com/webstore", "_blank");
  };

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

      {/* Upload Area */}
      <div class={styles.areaUpload}>
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
            <button class={styles.uploadBtn} onClick={handleBrowse}>
              Browse
            </button>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <button
        class={styles.areaGenerate}
        onClick={handleGenerate}
        disabled={!fileName}
      >
        Generate Wireframe
      </button>
    </div>
  );
}
