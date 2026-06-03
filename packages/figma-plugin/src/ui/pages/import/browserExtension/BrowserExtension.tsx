/** @jsx h */
import { h } from "preact";
import styles from "./BrowserExtension.css";

/**
 * Browser Extension tab — informational only.
 *
 * The extension captures a page in the browser and downloads a `.w2w` file;
 * the user imports that file via the Area tab (decodeW2W). No auto-send /
 * pairing flow at launch.
 */
export default function BrowserExtension() {
  /**
   * Open extension install page
   */
  const handleInstall = () => {
    window.open("https://chrome.google.com/webstore", "_blank");
  };

  return (
    <div class={styles.extensionContainer}>
      <div class={styles.extensionTitle}>Browser Extension</div>

      <div class={styles.extensionDescription}>
        Capture any webpage from your browser — including private, local, and
        login-protected pages — then bring it into Figma.
      </div>

      <div class={styles.extensionBenefits}>
        <ul>
          <li>Install the Web2Wireframe browser extension</li>
          <li>Open a page in your browser and click the extension to capture it</li>
          <li>The extension saves a .w2w file to your computer</li>
          <li>Open the “Area” tab here and drop the .w2w file in to import it</li>
        </ul>
      </div>

      <div class={styles.extensionSubtext}>
        Works on Chrome, Edge, Brave, Arc, Opera, Vivaldi, and Yandex browsers.
      </div>

      <div class={styles.extensionActions}>
        <button class={styles.extensionBtn} onClick={handleInstall}>
          Install Extension
        </button>
      </div>
    </div>
  );
}
